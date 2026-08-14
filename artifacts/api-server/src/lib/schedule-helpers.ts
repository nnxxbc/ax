/**
 * schedule-helpers.ts — pure logic for per-checkpoint day-of-week
 * scheduling ("only show 'Take out trash' on Mon/Thu"). No DB, no I/O.
 */

/** Empty/missing daysOfWeek means "every day" — existing checkpoints with
 * no configured schedule keep behaving exactly as before this feature. */
export function isScheduledForDay(daysOfWeek: number[], dayOfWeek: number): boolean {
  if (!daysOfWeek || daysOfWeek.length === 0) return true;
  return daysOfWeek.includes(dayOfWeek);
}

/**
 * Derives 0=Sunday..6=Saturday from a "YYYY-MM-DD" date string. Parsing at
 * UTC midnight is safe here regardless of server timezone — a date-only
 * string has no time-of-day component, so its day-of-week is fixed no
 * matter what zone you parse it in. The actual local-day-boundary logic
 * lives in getTodayDateString() (Asia/Tokyo) — this function just derives
 * the weekday from whatever date string it's given.
 */
export function dayOfWeekFromDateString(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/**
 * Sorts a routine's sessions by each checkpoint's *current* order (from
 * the Stations screen), not the order value that was snapshotted onto the
 * session row when it was first created. This is what makes reordering
 * checkpoints show up in today's routine immediately, with no need to
 * regenerate the routine. Falls back to the session's own stored order if
 * its checkpoint has since been deleted.
 */
export function sortSessionsByCheckpointOrder<T extends { checkpointId: number; order: number }>(
  sessions: T[],
  checkpointOrderById: Map<number, number>,
): T[] {
  return [...sessions].sort((a, b) => {
    const orderA = checkpointOrderById.get(a.checkpointId) ?? a.order;
    const orderB = checkpointOrderById.get(b.checkpointId) ?? b.order;
    return orderA - orderB;
  });
}
