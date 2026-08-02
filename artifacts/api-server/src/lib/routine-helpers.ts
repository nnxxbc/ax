import { eq, and } from "drizzle-orm";
import { db, checkpointsTable, checkpointSessionsTable, dailyRoutinesTable, settingsTable } from "@workspace/db";

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
    .where(eq(dailyRoutinesTable.date, today));
  if (existing.length > 0) return existing[0];

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

  for (const cp of checkpoints) {
    const modes: string[] = JSON.parse(cp.energyModes);
    if (!modes.includes(energyMode)) continue;
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
