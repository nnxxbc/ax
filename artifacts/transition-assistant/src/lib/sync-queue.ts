/**
 * sync-queue.ts — durable offline queue for events that must eventually
 * reach the backend, plus the background flush engine that drains it.
 *
 * Design:
 *  - Every locally-decided action (checkpoint scan, cancel, extension,
 *    emergency unlock) is appended here BEFORE anything talks to the
 *    network. It is never lost on a failed request — it just stays
 *    "pending" and gets retried.
 *  - Each event carries a client-generated `id` that doubles as the
 *    idempotency key (`clientEventId`) sent to the backend. Retrying an
 *    event never creates a duplicate server-side record — see
 *    artifacts/api-server/src/routes/sync.ts, which dedupes on this id.
 *  - Flushing is best-effort and strictly in queue order (oldest first),
 *    so out-of-order delivery (e.g. a "complete" reaching the server
 *    before its "start") can't happen even after a long offline stretch.
 */

import { getJSON, setJSON } from "./local-store.ts";

const QUEUE_KEY = "sync_queue";
const LAST_SYNC_KEY = "last_successful_sync";
const LAST_ERROR_KEY = "last_sync_error";

export type SyncEventType =
  | "checkpoint_scan"
  | "session_cancel"
  | "timer_extend"
  | "emergency_unlock"
  | "morning_checkin";

// An event that keeps failing forever (e.g. the server permanently rejects
// it for a reason no amount of retrying fixes) used to stay "failed"
// indefinitely, which — since pendingCount() counted anything not yet
// "synced" — meant the "Saved on this device. Syncing with server…" banner
// on Home never went away, even though nothing was actually going to
// change no matter how long it waited. After MAX_SYNC_ATTEMPTS, an event
// is marked "abandoned" instead: it stops being retried and stops holding
// the banner open, but — unlike deleting it — stays in the queue so
// getLastSyncError()/dev.tsx can still show what actually happened.
export const MAX_SYNC_ATTEMPTS = 8;

export interface SyncEvent {
  id: string; // clientEventId — unique, generated on enqueue
  type: SyncEventType;
  checkpointId: number | null;
  sessionId: string | null;
  occurredAt: string; // ISO — device-authoritative timestamp of the real-world action
  payload: Record<string, unknown>;
  syncStatus: "pending" | "synced" | "failed" | "abandoned";
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

function newEventId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function getQueue(): SyncEvent[] {
  return getJSON<SyncEvent[]>(QUEUE_KEY, []);
}

function saveQueue(queue: SyncEvent[]): void {
  setJSON(QUEUE_KEY, queue);
}

export function enqueue(
  type: SyncEventType,
  fields: { checkpointId?: number | null; sessionId?: string | null; occurredAt?: string; payload?: Record<string, unknown> },
): SyncEvent {
  const event: SyncEvent = {
    id: newEventId(),
    type,
    checkpointId: fields.checkpointId ?? null,
    sessionId: fields.sessionId ?? null,
    occurredAt: fields.occurredAt ?? new Date().toISOString(),
    payload: fields.payload ?? {},
    syncStatus: "pending",
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
  const queue = getQueue();
  queue.push(event);
  saveQueue(queue);
  return event;
}

export function pendingCount(): number {
  return getQueue().filter((e) => e.syncStatus !== "synced" && e.syncStatus !== "abandoned").length;
}

export function getLastSuccessfulSync(): string | null {
  return getJSON<string | null>(LAST_SYNC_KEY, null);
}

export function getLastSyncError(): string | null {
  return getJSON<string | null>(LAST_ERROR_KEY, null);
}

// Backoff: 0 for first attempt, then 5s, 15s, 30s, capped at 60s.
function backoffMs(attempts: number): number {
  const table = [0, 5000, 15000, 30000];
  return table[Math.min(attempts, table.length - 1)] ?? 60000;
}

let flushing = false;

/**
 * One send function per event, injected by the caller (so this file has
 * no dependency on the generated API client and stays independently
 * testable). Returns true on confirmed success.
 */
export type EventSender = (event: SyncEvent) => Promise<{ ok: boolean; error?: string; alreadyApplied?: boolean }>;

export async function flushQueue(send: EventSender): Promise<{ synced: number; failed: number; skipped: number }> {
  if (flushing) return { synced: 0, failed: 0, skipped: 0 };
  flushing = true;

  let synced = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const queue = getQueue();
    const now = Date.now();

    for (const event of queue) {
      if (event.syncStatus === "synced" || event.syncStatus === "abandoned") continue;

      const readyAt = event.lastError ? new Date(event.createdAt).getTime() + backoffMs(event.attempts) : 0;
      // Simple readiness check: skip events still in their backoff window,
      // but always attempt the oldest un-synced event first (order matters).
      if (event.attempts > 0 && now < readyAt) {
        skipped++;
        continue;
      }

      try {
        const result = await send(event);
        event.attempts += 1;
        if (result.ok || result.alreadyApplied) {
          event.syncStatus = "synced";
          event.lastError = null;
          synced++;
          setJSON(LAST_SYNC_KEY, new Date().toISOString());
        } else {
          event.syncStatus = event.attempts >= MAX_SYNC_ATTEMPTS ? "abandoned" : "failed";
          event.lastError = result.error ?? "Unknown sync error";
          setJSON(LAST_ERROR_KEY, event.lastError);
          failed++;
          // Stop draining further events for THIS checkpoint's ordering safety,
          // but keep trying other checkpoints' independent event chains.
        }
      } catch (err: any) {
        event.attempts += 1;
        event.syncStatus = event.attempts >= MAX_SYNC_ATTEMPTS ? "abandoned" : "failed";
        event.lastError = err?.message || "Network failure";
        setJSON(LAST_ERROR_KEY, event.lastError);
        failed++;
      }
    }

    // Prune synced events older than a day so the queue doesn't grow forever.
    const cutoff = now - 24 * 60 * 60 * 1000;
    const pruned = queue.filter((e) => e.syncStatus !== "synced" || new Date(e.createdAt).getTime() > cutoff);
    saveQueue(pruned);
  } finally {
    flushing = false;
  }

  return { synced, failed, skipped };
}

let backgroundTimer: ReturnType<typeof setInterval> | null = null;

export function startBackgroundSync(send: EventSender, intervalMs = 15000): () => void {
  if (backgroundTimer) clearInterval(backgroundTimer);
  backgroundTimer = setInterval(() => {
    flushQueue(send).catch((err) => console.error("[sync-queue] Background flush crashed:", err));
  }, intervalMs);

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      flushQueue(send).catch((err) => console.error("[sync-queue] Online-triggered flush crashed:", err));
    });
  }

  return () => {
    if (backgroundTimer) clearInterval(backgroundTimer);
    backgroundTimer = null;
  };
}
