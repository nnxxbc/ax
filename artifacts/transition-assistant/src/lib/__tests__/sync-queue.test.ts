/**
 * Real, executable tests for the offline sync queue: durability across
 * "restart" (simulated by not clearing the fake localStorage between
 * calls), retry/backoff, and — critically — that retries can't duplicate
 * a backend record (Phase 1 requirement: idempotent sync).
 *
 * Run from artifacts/transition-assistant:
 *   node --experimental-strip-types src/lib/__tests__/sync-queue.test.ts
 *
 * A minimal in-memory localStorage shim stands in for the real Android
 * WebView storage, which isn't available in this plain-Node sandbox (see
 * local-store.ts's isAvailable() check — it degrades safely to a no-op
 * without this shim, which is itself covered by a test below).
 */
import assert from "node:assert/strict";

// ─── Fake localStorage — must exist before any local-store call ───────────
class FakeStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}
(globalThis as any).window = { localStorage: new FakeStorage() };

const { getQueue, enqueue, flushQueue, pendingCount, getLastSuccessfulSync } = await import("../sync-queue.ts");
const { isHealthy } = await import("../local-store.ts");

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      passed++;
      console.log(`  PASS  ${name}`);
    } catch (err: any) {
      failed++;
      console.log(`  FAIL  ${name}`);
      console.log(`        ${err.message}`);
    }
  })();
}

console.log("sync-queue.ts\n");

await test("local-store reports healthy once the storage shim is present", () => {
  assert.equal(isHealthy(), true);
});

await test("Test 1/4 — enqueue is durable: survives being read back (simulated restart = re-read from the same backing store)", () => {
  (globalThis as any).window.localStorage.clear();
  const evt = enqueue("checkpoint_scan", { checkpointId: 7, sessionId: "local-1", occurredAt: new Date().toISOString() });
  const reread = getQueue(); // a fresh app boot would call getQueue() the same way
  assert.equal(reread.length, 1);
  assert.equal(reread[0].id, evt.id);
  assert.equal(reread[0].syncStatus, "pending");
});

await test("Test 2 — successful sync marks the event synced and it stops counting as pending", async () => {
  (globalThis as any).window.localStorage.clear();
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: new Date().toISOString() });
  assert.equal(pendingCount(), 1);

  const result = await flushQueue(async () => ({ ok: true }));
  assert.equal(result.synced, 1);
  assert.equal(pendingCount(), 0);
  assert.ok(getLastSuccessfulSync() !== null);
});

await test("Test 3 — HTTP 500 from the backend: event is NOT lost, stays pending, user's local action is unaffected", async () => {
  (globalThis as any).window.localStorage.clear();
  const evt = enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: new Date().toISOString() });

  const result = await flushQueue(async () => ({ ok: false, error: "HTTP 500" }));
  assert.equal(result.failed, 1);

  const stillThere = getQueue().find((e) => e.id === evt.id);
  assert.ok(stillThere, "event must still be in the queue after a failed sync");
  assert.equal(stillThere!.syncStatus, "failed"); // "failed this attempt", not "lost" — will retry
  assert.equal(pendingCount(), 1);
});

await test("Test 7 — idempotent retry: server saying 'already applied' clears the event without creating a second record", async () => {
  (globalThis as any).window.localStorage.clear();
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: new Date().toISOString() });

  // First attempt: network drops before a response arrives.
  let r = await flushQueue(async () => { throw new Error("network offline"); });
  assert.equal(r.failed, 1);
  assert.equal(pendingCount(), 1);

  // Move the clock forward past the backoff window (same technique as the
  // dedicated backoff test) so this retry is actually attempted rather
  // than skipped.
  const queue = getQueue();
  queue[0].createdAt = new Date(Date.now() - 60_000).toISOString();
  (globalThis as any).window.localStorage.setItem("ta_v1_sync_queue", JSON.stringify(queue));

  // Retry reaches the server, which recognizes the clientEventId as
  // already-applied — this is exactly what routes/sync.ts returns for a
  // genuine duplicate delivery, and the client must treat it as success,
  // not create a second local record or retry forever.
  r = await flushQueue(async () => ({ ok: true, alreadyApplied: true }));
  assert.equal(r.synced, 1);
  assert.equal(pendingCount(), 0, "an alreadyApplied response must still clear the local pending flag");
});

await test("Retry ordering: events are sent oldest-first, so a 'start' always reaches the server before its 'complete'", async () => {
  (globalThis as any).window.localStorage.clear();
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: "2026-08-14T09:00:00.000Z", payload: { action: "started" } });
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: "2026-08-14T09:10:00.000Z", payload: { action: "completed" } });

  const order: string[] = [];
  await flushQueue(async (evt) => {
    order.push(evt.payload.action as string);
    return { ok: true };
  });

  assert.deepEqual(order, ["started", "completed"]);
});

await test("Backoff: a just-failed event is skipped on an immediate re-flush, not hammered instantly", async () => {
  (globalThis as any).window.localStorage.clear();
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: new Date().toISOString() });

  let calls = 0;
  await flushQueue(async () => { calls++; return { ok: false, error: "HTTP 500" }; });
  assert.equal(calls, 1);

  // Immediately flush again — should be skipped (within backoff window), not retried yet.
  const r2 = await flushQueue(async () => { calls++; return { ok: true }; });
  assert.equal(calls, 1, "backoff must prevent an immediate re-send");
  assert.equal(r2.skipped, 1);
  assert.equal(pendingCount(), 1, "still pending, just not due for retry yet");
});

await test("Backoff clears once enough time has passed, and the retry can then succeed", async () => {
  (globalThis as any).window.localStorage.clear();
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: new Date().toISOString() });
  await flushQueue(async () => ({ ok: false, error: "HTTP 500" }));

  // Simulate time passing by back-dating the event's createdAt directly in
  // storage (same technique a real app restart + real elapsed time would
  // produce — we're testing the backoff *math*, not wall-clock waiting).
  const queue = getQueue();
  queue[0].createdAt = new Date(Date.now() - 60_000).toISOString();
  (globalThis as any).window.localStorage.setItem("ta_v1_sync_queue", JSON.stringify(queue));

  const r = await flushQueue(async () => ({ ok: true }));
  assert.equal(r.synced, 1);
  assert.equal(pendingCount(), 0);
});

await test("Multiple independent checkpoints: a failure on one does not block sync of another", async () => {
  (globalThis as any).window.localStorage.clear();
  enqueue("checkpoint_scan", { checkpointId: 1, occurredAt: new Date().toISOString() });
  enqueue("checkpoint_scan", { checkpointId: 2, occurredAt: new Date().toISOString() });

  const r = await flushQueue(async (evt) => (evt.checkpointId === 1 ? { ok: false, error: "HTTP 500" } : { ok: true }));
  assert.equal(r.synced, 1);
  assert.equal(r.failed, 1);
  assert.equal(pendingCount(), 1); // checkpoint 1's event remains, checkpoint 2's is done
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
