import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, dailyRoutinesTable, checkpointsTable, checkpointSessionsTable, settingsTable } from "@workspace/db";
import { StartTodayRoutineBody } from "@workspace/api-zod";
import {
  getTodayDateString,
  getOrCreateTodayRoutine,
  getOrCreateSettings,
  getEnrichedSessions,
  enrichSession,
} from "../lib/routine-helpers";
import { logEvent } from "../lib/event-logger";

const router = Router();

router.get("/routines/today", async (req, res): Promise<void> => {
  const routine = await getOrCreateTodayRoutine();
  const sessions = await getEnrichedSessions(routine.id);
  res.json({ ...routine, sessions });
});

router.post("/routines/today", async (req, res): Promise<void> => {
  const parsed = StartTodayRoutineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const today = getTodayDateString();
  const { energyMode, reset } = parsed.data;

  if (reset) {
    // Delete existing sessions + routine for today
    const existing = await db
      .select()
      .from(dailyRoutinesTable)
      .where(eq(dailyRoutinesTable.date, today));
    for (const r of existing) {
      await db.delete(checkpointSessionsTable).where(eq(checkpointSessionsTable.routineId, r.id));
      await db.delete(dailyRoutinesTable).where(eq(dailyRoutinesTable.id, r.id));
    }
  }

  // Create or update routine
  const existing = await db
    .select()
    .from(dailyRoutinesTable)
    .where(eq(dailyRoutinesTable.date, today));

  let routine;
  if (existing.length > 0 && !reset) {
    [routine] = await db
      .update(dailyRoutinesTable)
      .set({ energyMode, status: "active" })
      .where(eq(dailyRoutinesTable.id, existing[0].id))
      .returning();
    // Delete existing sessions and re-create for new energy mode
    await db.delete(checkpointSessionsTable).where(eq(checkpointSessionsTable.routineId, routine.id));
  } else {
    [routine] = await db
      .insert(dailyRoutinesTable)
      .values({ date: today, energyMode, status: "active", createdAt: new Date().toISOString() })
      .returning();
  }

  // Create sessions for checkpoints matching this energy mode
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

  await logEvent(req, "routine_started", `Routine started in ${energyMode} mode`, {});
  const sessions = await getEnrichedSessions(routine.id);
  res.json({ ...routine, sessions });
});

router.get("/routines/today/summary", async (req, res): Promise<void> => {
  const routine = await getOrCreateTodayRoutine();
  const sessions = await getEnrichedSessions(routine.id);
  const completed = sessions.filter((s) => s.status === "completed").length;
  const missed = sessions.filter((s) => s.status === "missed").length;
  const skipped = sessions.filter((s) => s.status === "skipped").length;
  const overridden = sessions.filter((s) => s.overrideReason != null).length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;
  const waiting = sessions.filter((s) => s.status === "waiting").length;
  const nextSession = sessions.find((s) => s.status === "waiting" || s.status === "in_progress") ?? null;
  res.json({
    date: routine.date,
    energyMode: routine.energyMode,
    totalSessions: sessions.length,
    completed,
    missed,
    skipped,
    overridden,
    inProgress,
    waiting,
    nextSession,
  });
});

export default router;
