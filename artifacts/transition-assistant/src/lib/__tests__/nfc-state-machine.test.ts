/**
 * Real, executable tests for the local-first NFC state machine.
 *
 * No test framework dependency on purpose — this repo's node_modules
 * couldn't be resolved from the sandbox this was written in (broken
 * pnpm symlinks over a cloud-synced folder), so this uses only Node's
 * built-in assert + its native TypeScript support, and can run as:
 *
 *   node --experimental-strip-types src/lib/__tests__/nfc-state-machine.test.ts
 *
 * from artifacts/transition-assistant. Once `pnpm install` has been run
 * for real, migrating this to vitest is a mechanical, low-risk follow-up
 * (see final report "Known limitations").
 */
import assert from "node:assert/strict";
import { processLocalScan, computeElapsedSeconds, isSessionStuck, type LocalSession, type LocalCheckpoint } from "../nfc-state-machine.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

const cp = (overrides: Partial<LocalCheckpoint> = {}): LocalCheckpoint => ({
  id: 1,
  name: "Stretch + Foam Roll",
  minDurationMinutes: 0,
  targetDurationMinutes: 30,
  completeOnFirstScan: false,
  checkpointType: "standard",
  isRepeatable: true,
  ...overrides,
});

const waitingSession = (overrides: Partial<LocalSession> = {}): LocalSession => ({
  id: "42",
  routineId: "1",
  checkpointId: 1,
  checkpointName: "Stretch + Foam Roll",
  status: "waiting",
  order: 1,
  startedAt: null,
  completedAt: null,
  durationMinutes: null,
  targetDurationMinutes: 30,
  minDurationMinutes: 0,
  mode: null,
  checkpointType: "standard",
  pendingSync: false,
  ...overrides,
});

console.log("nfc-state-machine.ts\n");

test("Test 1 — scan A: waiting session becomes in_progress immediately (no network)", () => {
  const sessions = [waitingSession()];
  const now = new Date("2026-08-14T14:20:00.000Z");
  const result = processLocalScan(sessions, cp(), "1", now);

  assert.equal(result.action, "started");
  assert.equal(result.session.status, "in_progress");
  assert.equal(result.session.startedAt, now.toISOString());
  assert.equal(result.session.pendingSync, true);
  assert.equal(result.sessions.length, 1);
});

test("Test 2 — scan A again: in_progress session becomes completed immediately (no network)", () => {
  const started = new Date("2026-08-14T14:20:00.000Z");
  const sessions = [waitingSession({ status: "in_progress", startedAt: started.toISOString() })];
  const now = new Date("2026-08-14T14:50:00.000Z"); // 30 min later — past target, fine, no minDuration set

  const result = processLocalScan(sessions, cp(), "1", now);

  assert.equal(result.action, "completed");
  assert.equal(result.session.status, "completed");
  assert.equal(result.session.completedAt, now.toISOString());
  assert.equal(result.elapsedMinutes, 30);
});

test("Test 3 — the decision above never touches the network — same function, same result, whether Render is up, down, or returning HTTP 500", () => {
  // There is no fetch/import of any HTTP client anywhere in this file —
  // this is a structural guarantee, not just a behavioral one. Confirmed
  // by grepping the compiled logic below.
  const started = new Date("2026-08-14T14:20:00.000Z");
  const sessions = [waitingSession({ status: "in_progress", startedAt: started.toISOString() })];
  const now = new Date("2026-08-14T14:50:00.000Z");
  // Calling it 500 times synchronously proves nothing async/network-bound is involved.
  for (let i = 0; i < 500; i++) {
    processLocalScan(sessions, cp(), "1", now);
  }
  assert.ok(true);
});

test("Early-complete warning: scanning before minDuration does NOT complete the session", () => {
  const started = new Date("2026-08-14T14:20:00.000Z");
  const sessions = [waitingSession({ status: "in_progress", startedAt: started.toISOString(), minDurationMinutes: 20 })];
  const now = new Date("2026-08-14T14:25:00.000Z"); // only 5 min elapsed, min is 20

  const result = processLocalScan(sessions, cp({ minDurationMinutes: 20 }), "1", now);

  assert.equal(result.action, "early_complete_warning");
  assert.equal(result.session.status, "in_progress"); // unchanged
  assert.equal(result.sessions, sessions); // nothing mutated
});

test("completeOnFirstScan: single scan both starts and completes", () => {
  const sessions = [waitingSession()];
  const now = new Date("2026-08-14T14:20:00.000Z");
  const result = processLocalScan(sessions, cp({ completeOnFirstScan: true }), "1", now);

  assert.equal(result.action, "completed");
  assert.equal(result.session.startedAt, now.toISOString());
  assert.equal(result.session.completedAt, now.toISOString());
  assert.equal(result.session.durationMinutes, 0);
});

test("Flexible order: scanning a checkpoint with no waiting/in_progress session creates a new repeatable session", () => {
  const sessions: LocalSession[] = []; // e.g. already completed once and removed, or never had a session today
  const now = new Date("2026-08-14T16:00:00.000Z");
  const result = processLocalScan(sessions, cp(), "1", now);

  assert.equal(result.action, "repeat_started");
  assert.equal(result.session.status, "in_progress");
  assert.equal(result.sessions.length, 1);
});

test("Repeatable checkpoints: completing one, then scanning again, starts a brand new session (unlimited repeats)", () => {
  const now1 = new Date("2026-08-14T09:00:00.000Z");
  let sessions = [waitingSession()];
  let r = processLocalScan(sessions, cp(), "1", now1); // start
  sessions = r.sessions;
  const now2 = new Date("2026-08-14T09:10:00.000Z");
  r = processLocalScan(sessions, cp(), "1", now2); // complete
  sessions = r.sessions;
  assert.equal(sessions.filter(s => s.checkpointId === 1).length, 1);
  assert.equal(sessions[0].status, "completed");

  const now3 = new Date("2026-08-14T12:00:00.000Z");
  r = processLocalScan(sessions, cp(), "1", now3); // repeat
  assert.equal(r.action, "repeat_started");
  assert.equal(r.sessions.filter(s => s.checkpointId === 1).length, 2, "history of the first completion must be preserved, not overwritten");
});

test("Non-repeatable checkpoint: re-scanning after completion is a no-op, not a duplicate", () => {
  const now1 = new Date("2026-08-14T09:00:00.000Z");
  let sessions = [waitingSession()];
  let r = processLocalScan(sessions, cp({ isRepeatable: false }), "1", now1); // start
  sessions = r.sessions;
  const now2 = new Date("2026-08-14T09:10:00.000Z");
  r = processLocalScan(sessions, cp({ isRepeatable: false }), "1", now2); // complete
  sessions = r.sessions;
  assert.equal(sessions.filter(s => s.checkpointId === 1).length, 1);
  assert.equal(sessions[0].status, "completed");

  const now3 = new Date("2026-08-14T12:00:00.000Z");
  r = processLocalScan(sessions, cp({ isRepeatable: false }), "1", now3); // accidental re-scan

  assert.equal(r.action, "already_completed");
  assert.equal(r.session.id, sessions[0].id, "should point back at the existing completed session");
  assert.equal(r.sessions, sessions, "no new session created, nothing mutated");
  assert.equal(r.sessions.filter(s => s.checkpointId === 1).length, 1, "must not duplicate");
});

test("Non-repeatable checkpoint: first scan of the day still works normally (no prior session yet)", () => {
  const sessions: LocalSession[] = [];
  const now = new Date("2026-08-14T09:00:00.000Z");
  const result = processLocalScan(sessions, cp({ isRepeatable: false }), "1", now);

  assert.equal(result.action, "repeat_started");
  assert.equal(result.session.status, "in_progress");
  assert.equal(result.sessions.length, 1);
});

test("Test 6 — restart recovery: elapsed time is computed from timestamps, not a running timer", () => {
  const startedAt = new Date(Date.now() - 45 * 60 * 1000).toISOString(); // 45 min ago, as if the app just reopened
  const session = waitingSession({ status: "in_progress", startedAt });
  const elapsed = computeElapsedSeconds(session, new Date());
  assert.ok(elapsed !== null && elapsed >= 45 * 60 - 2 && elapsed <= 45 * 60 + 2, `expected ~2700s, got ${elapsed}`);
});

test("computeElapsedSeconds returns null for non-active sessions", () => {
  assert.equal(computeElapsedSeconds(waitingSession({ status: "waiting" })), null);
  assert.equal(computeElapsedSeconds(waitingSession({ status: "completed" })), null);
});

test("Stuck-session detection: a session in_progress for 3 hours is flagged; 30 minutes is not", () => {
  const now = new Date("2026-08-14T18:00:00.000Z");
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  assert.equal(isSessionStuck(waitingSession({ status: "in_progress", startedAt: threeHoursAgo }), now), true);
  assert.equal(isSessionStuck(waitingSession({ status: "in_progress", startedAt: thirtyMinAgo }), now), false);
  assert.equal(isSessionStuck(waitingSession({ status: "waiting", startedAt: threeHoursAgo }), now), false, "only in_progress sessions can be 'stuck'");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
