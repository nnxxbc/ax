/**
 * sync-reconcile.ts — protects locally-decided-but-not-yet-server-confirmed
 * session state from being clobbered by a background routine refetch.
 *
 * Bug this fixes: home.tsx polls GET /today-routine every few seconds
 * (`refetchInterval`). A physical NFC scan updates the UI instantly and
 * queues the fact for background sync (src/lib/sync-queue.ts) — but if a
 * routine poll lands and returns BEFORE that queued event has been applied
 * server-side, the poll's stale response silently overwrites the correct
 * local state, snapping the UI back to the previous checkpoint. Reported
 * symptom: scan "Out of Bed" -> UI briefly shows "Foam Roller" -> reverts
 * to "Out of Bed" -> stuck in a loop.
 *
 * Fix: for any session that currently has an unsynced event in the queue,
 * trust the locally-cached version over whatever the server just returned.
 * Pure function — no I/O — so it's unit-testable the same way as
 * nfc-state-machine.ts.
 */

export function reconcilePendingSessions<T extends { id: string | number }>(
  serverSessions: T[],
  cachedSessions: T[],
  pendingSessionIds: Set<string>,
): T[] {
  if (pendingSessionIds.size === 0) return serverSessions;
  return serverSessions.map((s) => {
    if (!pendingSessionIds.has(String(s.id))) return s;
    const cached = cachedSessions.find((c) => String(c.id) === String(s.id));
    return cached ?? s;
  });
}
