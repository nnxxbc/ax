/**
 * offline-sync.ts — glue between the pure state machine (nfc-state-machine.ts),
 * the durable queue (sync-queue.ts), local-store persistence, and the
 * backend (customFetch → POST /api/sync/events).
 *
 * This is the only file that knows about the server's session/checkpoint
 * shapes, HTTP, and React Query — everything else in src/lib stays pure
 * and independently testable.
 */

import { customFetch } from "@workspace/api-client-react";
import { getJSON, setJSON } from "./local-store.ts";
import type { LocalSession, LocalCheckpoint } from "./nfc-state-machine.ts";
import { enqueue, flushQueue, type EventSender, type SyncEvent } from "./sync-queue.ts";
import type { SubmitMorningCheckinInput } from "./morning-checkin-api.ts";

const SESSIONS_CACHE_KEY = "cached_sessions";
const CHECKPOINTS_CACHE_KEY = "cached_checkpoints";
const ROUTINE_ID_KEY = "cached_routine_id";

// ─── Server ⇄ local shape conversion ───────────────────────────────────────

export function toLocalSession(s: any): LocalSession {
  return {
    id: String(s.id),
    routineId: String(s.routineId),
    checkpointId: s.checkpointId,
    checkpointName: s.checkpointName ?? "Station",
    status: s.status,
    order: s.order ?? 0,
    startedAt: s.startedAt ?? null,
    completedAt: s.completedAt ?? null,
    durationMinutes: s.durationMinutes ?? null,
    targetDurationMinutes: s.targetDurationMinutes ?? s.checkpointDefaultDurationMinutes ?? null,
    minDurationMinutes: s.minDurationMinutes ?? s.checkpointMinDurationMinutes ?? null,
    mode: s.mode ?? null,
    checkpointType: s.checkpointType,
    pendingSync: false,
  };
}

/**
 * Patch a local session back into the shape the existing UI components
 * expect. Critically, this MERGES onto `prevServerShape` rather than
 * replacing it — the server's enrichSession() attaches extra fields
 * (checkpointIcon, checkpointLocation, isRequired, ...) that the local
 * state machine doesn't know about and must not silently drop from
 * sessions that didn't even change.
 */
export function toUiSession(s: LocalSession, prevServerShape?: any): any {
  return {
    ...(prevServerShape ?? {}),
    id: /^local-/.test(s.id) ? s.id : Number(s.id),
    routineId: s.routineId,
    checkpointId: s.checkpointId,
    checkpointName: s.checkpointName,
    status: s.status,
    order: s.order,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    durationMinutes: s.durationMinutes,
    targetDurationMinutes: s.targetDurationMinutes,
    minDurationMinutes: s.minDurationMinutes,
    mode: s.mode,
    checkpointType: s.checkpointType,
  };
}

/**
 * Patch ONE changed/new local session into a full server-shaped session
 * list without disturbing the enrichment fields on every other untouched
 * session. `originalSessions` should be the last known server (or cached)
 * session list — the same array the UI was already rendering.
 */
export function patchSessionsForUi(originalSessions: any[], localSessions: LocalSession[]): any[] {
  const byId = new Map(originalSessions.map((s) => [String(s.id), s]));
  return localSessions.map((ls) => {
    const prev = byId.get(ls.id);
    if (prev) return toUiSession(ls, prev);
    // Brand new session (flexible-order repeat) — no previous row for this
    // exact session id, but a sibling session for the same checkpoint
    // carries the same static checkpoint-derived enrichment fields
    // (icon, location, isRequired, default/min duration) we can borrow.
    const sibling = originalSessions.find((s) => s.checkpointId === ls.checkpointId);
    return toUiSession(ls, sibling);
  });
}

export function toLocalCheckpoint(c: any): LocalCheckpoint {
  return {
    id: c.id,
    name: c.name,
    minDurationMinutes: c.minDurationMinutes ?? 0,
    targetDurationMinutes: c.defaultDurationMinutes ?? 0,
    completeOnFirstScan: !!c.completeOnFirstScan,
    checkpointType: c.type,
    isRepeatable: c.isRepeatable !== false,
  };
}

// ─── Persistence (restart recovery) ────────────────────────────────────────

export function cacheSessions(routineId: string | number, sessions: any[]): void {
  setJSON(ROUTINE_ID_KEY, String(routineId));
  setJSON(SESSIONS_CACHE_KEY, sessions);
}

export function getCachedSessions(): any[] {
  return getJSON<any[]>(SESSIONS_CACHE_KEY, []);
}

export function getCachedRoutineId(): string | null {
  return getJSON<string | null>(ROUTINE_ID_KEY, null);
}

export function cacheCheckpoints(checkpoints: any[]): void {
  setJSON(CHECKPOINTS_CACHE_KEY, checkpoints);
}

export function getCachedCheckpoints(): any[] {
  return getJSON<any[]>(CHECKPOINTS_CACHE_KEY, []);
}

// ─── Checkpoint resolution from a scanned tag, entirely local ─────────────

export function resolveCheckpointFromTag(
  tagUid: string,
  nfcTags: Array<{ tagUid: string; checkpointId?: number | null }> | undefined,
  checkpoints: any[],
): LocalCheckpoint | null {
  const tag = (nfcTags ?? []).find((t) => t.tagUid === tagUid);
  if (!tag || !tag.checkpointId) return null;
  const cp = checkpoints.find((c) => c.id === tag.checkpointId);
  if (!cp) return null;
  return toLocalCheckpoint(cp);
}

// ─── Sending queued events to the backend ──────────────────────────────────

export const sendSyncEvent: EventSender = async (event: SyncEvent) => {
  try {
    const res = await customFetch<{ results: Array<{ clientEventId: string; ok: boolean; alreadyApplied?: boolean; error?: string }> }>(
      "/api/sync/events",
      {
        method: "POST",
        body: JSON.stringify({
          events: [
            {
              clientEventId: event.id,
              type: event.type,
              checkpointId: event.checkpointId,
              occurredAt: event.occurredAt,
              payload: event.payload,
            },
          ],
        }),
        responseType: "json",
      },
    );
    const result = res.results?.[0];
    if (!result) return { ok: false, error: "Empty sync response" };
    return { ok: result.ok, alreadyApplied: result.alreadyApplied, error: result.error };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Network failure" };
  }
};

export function flushSyncQueue() {
  return flushQueue(sendSyncEvent);
}

export function queueCheckpointScan(checkpointId: number, sessionId: string, action: string, occurredAt: string) {
  const event = enqueue("checkpoint_scan", { checkpointId, sessionId, occurredAt, payload: { action } });
  // Fire-and-forget — never block the UI on this.
  flushSyncQueue().catch((err) => console.error("[offline-sync] Immediate flush after scan failed:", err));
  return event;
}

export function queueEmergencyUnlock(reason: string | null) {
  const event = enqueue("emergency_unlock", { occurredAt: new Date().toISOString(), payload: { reason } });
  flushSyncQueue().catch((err) => console.error("[offline-sync] Immediate flush after unlock failed:", err));
  return event;
}

// Morning Check-In — goes through the same durable queue as everything else
// here rather than a direct fetch, deliberately. This is exactly the moment
// (right after waking up, phone not yet on wifi) offline is most likely, and
// losing a day's check-in silently would leave a gap in the pattern data
// the feature exists to build up. Payload-only (no checkpointId/sessionId),
// same shape as queueEmergencyUnlock.
export function queueMorningCheckin(payload: SubmitMorningCheckinInput) {
  // Cast at this single choke point: SubmitMorningCheckinInput is a named
  // interface (no index signature), so TS won't structurally assign it to
  // enqueue()'s Record<string, unknown> payload field without an explicit
  // cast, even though every property is a valid value for that shape.
  const event = enqueue("morning_checkin", {
    occurredAt: new Date().toISOString(),
    payload: payload as unknown as Record<string, unknown>,
  });
  flushSyncQueue().catch((err) => console.error("[offline-sync] Immediate flush after morning check-in failed:", err));
  return event;
}

// ─── Diagnostics tracking (for the Dev/diagnostics screen) ────────────────

const LAST_SCAN_UID_KEY = "diag_last_scan_uid";
const LAST_SCAN_TIME_KEY = "diag_last_scan_time";
const LAST_LOCAL_ACTION_KEY = "diag_last_local_action";

export function recordScanDiagnostics(uid: string, action: string): void {
  setJSON(LAST_SCAN_UID_KEY, uid);
  setJSON(LAST_SCAN_TIME_KEY, new Date().toISOString());
  setJSON(LAST_LOCAL_ACTION_KEY, action);
}

export function getScanDiagnostics() {
  return {
    lastTagUid: getJSON<string | null>(LAST_SCAN_UID_KEY, null),
    lastScanTime: getJSON<string | null>(LAST_SCAN_TIME_KEY, null),
    lastLocalAction: getJSON<string | null>(LAST_LOCAL_ACTION_KEY, null),
  };
}

// ─── API reachability probe (for the diagnostics screen) ──────────────────

export async function checkApiReachable(): Promise<{ reachable: boolean; error?: string }> {
  try {
    await customFetch("/api/ping", { method: "GET", responseType: "json" });
    return { reachable: true };
  } catch (err: any) {
    return { reachable: false, error: err?.message || "Unreachable" };
  }
}
