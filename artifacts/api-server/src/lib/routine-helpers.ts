import { eq, and, desc, sql } from "drizzle-orm";
import { db, checkpointsTable, checkpointSessionsTable, dailyRoutinesTable, settingsTable } from "@workspace/db";
import { isScheduledForDay, dayOfWeekFromDateString, sortSessionsByCheckpointOrder } from "./schedule-helpers";

/**
 * "Today" is defined in Karen's local timezone (Asia/Tokyo), not UTC.
 * Using UTC here used to mean the app's calendar day didn't roll over
 * until 09:00 JST — so anything done between midnight and 9am JST (e.g.
 * a 5am morning routine) was silently treated as still being the
 * *previous* day, including day-of-week eligibility for things like
 * "trash on Fri only". That's what caused trash/laundry to show up on
 * the wrong day.
 */
export function getTodayDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable);
  if (rows.length > 0) return rows[0];
  const [settings] = await db.insert(settingsTable).values({}).returning();
  return settings;
}

export async function getOrCreateTodayRoutine() {
  const today = getTodayDateString();

  // Everything below runs inside one transaction, gated by a Postgres
  // advisory lock keyed on today's date string. Without this, two requests
  // landing at nearly the same instant (e.g. several screens each fetching
  // "today's routine" right when the app cold-starts) can both read "no
  // waiting session for checkpoint X yet" before either has written
  // anything, and both insert one — that's exactly what produced a
  // duplicate session for almost every checkpoint the first time a routine
  // got created after the day-boundary fix shipped. The lock is
  // per-transaction (pg_advisory_xact_lock), so it's released automatically
  // on commit/rollback and only ever makes a concurrent call *wait its
  // turn*, never fail — the second call simply re-reads state after the
  // first one committed and correctly sees the sessions already exist.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${today}))`);

    const existing = await tx
      .select()
      .from(dailyRoutinesTable)
      .where(eq(dailyRoutinesTable.date, today))
      .orderBy(desc(dailyRoutinesTable.id));

    // If there's an active routine, use it — but first bring its sessions in
    // line with whatever the checkpoints look like *right now*. Karen can
    // reorder stations or change a checkpoint's days at any time via the
    // Stations screen, including mid-day after today's routine already
    // exists; without this, those edits would silently only take effect
    // tomorrow.
    const active = existing.find(r => r.status === "active");
    if (active) {
      await reconcileTodaySessions(tx, active);
      return active;
    }

    // If the latest routine is completed, we'll create a new one below.
    // Unless we want to keep using the completed one for repetitions?
    // The requirement says "begin a new cycle".

    const settings = await getOrCreateSettings();
    const energyMode = settings.defaultEnergyMode;
    const [routine] = await tx
      .insert(dailyRoutinesTable)
      .values({ date: today, energyMode, status: "active", createdAt: new Date().toISOString() })
      .returning();

    await reconcileTodaySessions(tx, routine);

    return routine;
  });
}

/**
 * Keeps a routine's sessions in sync with the *current* checkpoint config
 * (order + energy mode + days of week), not just whatever was true the
 * moment the routine was first created. Two things it does, both
 * non-destructive to anything already touched today:
 *   - adds a "waiting" session for any active, eligible checkpoint that
 *     doesn't have one yet for this routine (covers: newly created
 *     checkpoints, and checkpoints whose days-of-week now include today
 *     when they didn't before).
 *   - removes a "waiting" (never started) session for a checkpoint that's
 *     no longer active or no longer scheduled for today. A session that's
 *     already in_progress/completed/skipped/etc. is left alone — a
 *     checkpoint config change never erases real progress.
 * Session *order* is intentionally NOT re-synced here — getEnrichedSessions
 * always sorts by the checkpoint's current order at read time, so reorders
 * show up immediately without needing to touch stored session rows at all.
 */
async function reconcileTodaySessions(tx: any, routine: { id: number; date: string; energyMode: string }) {
  const checkpoints = await tx.select().from(checkpointsTable).where(eq(checkpointsTable.isActive, true));
  const todayDayOfWeek = dayOfWeekFromDateString(routine.date);

  const eligibleCheckpointIds = new Set(
    checkpoints
      .filter((cp: any) => {
        const modes: string[] = JSON.parse(cp.energyModes);
        if (!modes.includes(routine.energyMode)) return false;
        const days: number[] = JSON.parse(cp.daysOfWeek ?? "[]");
        return isScheduledForDay(days, todayDayOfWeek);
      })
      .map((cp: any) => cp.id),
  );

  const existingSessions = await tx
    .select()
    .from(checkpointSessionsTable)
    .where(eq(checkpointSessionsTable.routineId, routine.id));
  // "cancelled" is what a session gets when the Frozen/stuck flow is
  // abandoned mid-checkpoint — it's not a deliberate resolution the way
  // completed/skipped/missed are, it just means an attempt got bailed on.
  // A checkpoint whose only session(s) today are cancelled must NOT count
  // as "already has a session" here, or it silently disappears from the
  // guided "what's next" queue for the rest of the day — you can still
  // reach it by manually re-scanning its tag (the flexible-repeat path),
  // but the app stops guiding you to it, which is exactly what made foam
  // roller and hygiene feel "skipped" this morning even though nothing
  // was ever actually resolved for them.
  const checkpointIdsWithLiveSessions = new Set(
    existingSessions.filter((s) => s.status !== "cancelled").map((s) => s.checkpointId),
  );

  // Add sessions for newly-eligible checkpoints (including ones whose only
  // prior session today was cancelled).
  for (const cp of checkpoints) {
    if (!eligibleCheckpointIds.has(cp.id) || checkpointIdsWithLiveSessions.has(cp.id)) continue;
    await tx.insert(checkpointSessionsTable).values({
      routineId: routine.id,
      checkpointId: cp.id,
      status: "waiting",
      order: cp.order,
      targetDurationMinutes: cp.defaultDurationMinutes > 0 ? cp.defaultDurationMinutes : null,
      minDurationMinutes: cp.minDurationMinutes > 0 ? cp.minDurationMinutes : null,
      createdAt: new Date().toISOString(),
    });
  }

  // Remove never-started sessions for checkpoints that are no longer eligible.
  for (const session of existingSessions) {
    if (session.status !== "waiting") continue;
    if (eligibleCheckpointIds.has(session.checkpointId)) continue;
    await tx.delete(checkpointSessionsTable).where(eq(checkpointSessionsTable.id, session.id));
  }
}

export async function enrichSession(session: {
  id: number;
  routineId: number;
  checkpointId: number;
  status: string;
  order: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMinutes: number | null;
  targetDurationMinutes: number | null;
  minDurationMinutes: number | null;
  skipReason: string | null;
  overrideReason: string | null;
  createdAt: string;
}) {
  const [cp] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, session.checkpointId));
  let elapsedSeconds: number | null = null;
  if (session.status === "in_progress" && session.startedAt) {
    elapsedSeconds = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  }
  return {
    ...session,
    checkpointName: cp?.name ?? "Unknown",
    checkpointIcon: cp?.icon ?? "MapPin",
    checkpointLocation: cp?.location ?? null,
    checkpointDefaultDurationMinutes: cp?.defaultDurationMinutes ?? 0,
    checkpointMinDurationMinutes: cp?.minDurationMinutes ?? 0,
    checkpointType: cp?.type ?? "standard",
    elapsedSeconds,
  };
}

export async function getEnrichedSessions(routineId: number) {
  const sessions = await db
    .select()
    .from(checkpointSessionsTable)
    .where(eq(checkpointSessionsTable.routineId, routineId));
  const checkpoints = await db.select().from(checkpointsTable);
  const orderByCheckpointId = new Map(checkpoints.map((cp) => [cp.id, cp.order]));
  const sorted = sortSessionsByCheckpointOrder(sessions, orderByCheckpointId);

  return Promise.all(sorted.map(enrichSession));
}

export async function updateRoutineCompletionStatus(routineId: number) {
  const [routine] = await db.select().from(dailyRoutinesTable).where(eq(dailyRoutinesTable.id, routineId));
  if (!routine || routine.status === "completed") return routine;

  // Get all checkpoints that ARE required for this cycle. A checkpoint
  // scheduled for specific days (e.g. trash on Mon/Thu) is only "required"
  // on those days — otherwise a Wednesday routine could never complete
  // because a Mon/Thu-only checkpoint has no session to satisfy it.
  const todayDayOfWeek = dayOfWeekFromDateString(routine.date);
  const allRequired = await db
    .select()
    .from(checkpointsTable)
    .where(and(eq(checkpointsTable.isActive, true), eq(checkpointsTable.isRequired, true)));
  const requiredCheckpoints = allRequired.filter((cp) =>
    isScheduledForDay(JSON.parse(cp.daysOfWeek ?? "[]"), todayDayOfWeek),
  );

  if (requiredCheckpoints.length === 0) return routine;

  // Get all completed sessions for this routine
  const completedSessions = await db
    .select()
    .from(checkpointSessionsTable)
    .where(and(eq(checkpointSessionsTable.routineId, routineId), eq(checkpointSessionsTable.status, "completed")));

  const completedCheckpointIds = new Set(completedSessions.map(s => s.checkpointId));

  // Check if every required checkpoint has at least one completed session
  const allRequiredDone = requiredCheckpoints.every(cp => completedCheckpointIds.has(cp.id));

  if (allRequiredDone) {
    const [updated] = await db
      .update(dailyRoutinesTable)
      .set({ status: "completed", completedAt: new Date().toISOString() })
      .where(eq(dailyRoutinesTable.id, routineId))
      .returning();
    return updated;
  }

  return routine;
}
