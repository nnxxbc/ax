import { eq, and, desc } from "drizzle-orm";
import { db, checkpointsTable, checkpointSessionsTable, dailyRoutinesTable, settingsTable } from "@workspace/db";
import { isScheduledForDay, dayOfWeekFromDateString } from "./schedule-helpers";

export function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getOrCreateSettings() {
  const rows = await db.select().from(settingsTable);
  if (rows.length > 0) return rows[0];
  const [settings] = await db.insert(settingsTable).values({}).returning();
  return settings;
}

export async function getOrCreateTodayRoutine() {
  const today = getTodayDateString();
  const existing = await db
    .select()
    .from(dailyRoutinesTable)
    .where(eq(dailyRoutinesTable.date, today))
    .orderBy(desc(dailyRoutinesTable.id));

  // If there's an active routine, use it.
  const active = existing.find(r => r.status === "active");
  if (active) return active;

  // If the latest routine is completed, we'll create a new one below.
  // Unless we want to keep using the completed one for repetitions?
  // The requirement says "begin a new cycle".

  const settings = await getOrCreateSettings();
  const energyMode = settings.defaultEnergyMode;
  const [routine] = await db
    .insert(dailyRoutinesTable)
    .values({ date: today, energyMode, status: "active", createdAt: new Date().toISOString() })
    .returning();

  // Create sessions for active checkpoints matching this energy mode
  const checkpoints = await db
    .select()
    .from(checkpointsTable)
    .where(eq(checkpointsTable.isActive, true))
    .orderBy(checkpointsTable.order);

  const todayDayOfWeek = dayOfWeekFromDateString(today);

  for (const cp of checkpoints) {
    const modes: string[] = JSON.parse(cp.energyModes);
    if (!modes.includes(energyMode)) continue;
    const days: number[] = JSON.parse(cp.daysOfWeek ?? "[]");
    if (!isScheduledForDay(days, todayDayOfWeek)) continue;
    await db.insert(checkpointSessionsTable).values({
      routineId: routine.id,
      checkpointId: cp.id,
      status: "waiting",
      order: cp.order,
      targetDurationMinutes: cp.defaultDurationMinutes > 0 ? cp.defaultDurationMinutes : null,
      minDurationMinutes: cp.minDurationMinutes > 0 ? cp.minDurationMinutes : null,
      createdAt: new Date().toISOString(),
    });
  }

  return routine;
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
    .where(eq(checkpointSessionsTable.routineId, routineId))
    .orderBy(checkpointSessionsTable.order);
  return Promise.all(sessions.map(enrichSession));
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
