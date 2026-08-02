import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db, dailyRoutinesTable, checkpointSessionsTable } from "@workspace/db";
import { GetDayHistoryParams } from "@workspace/api-zod";
import { getEnrichedSessions } from "../lib/routine-helpers";

const router = Router();

async function buildDayHistory(routine: { id: number; date: string; energyMode: string; status: string; createdAt: string }) {
  const sessions = await getEnrichedSessions(routine.id);
  return {
    date: routine.date,
    energyMode: routine.energyMode,
    totalSessions: sessions.length,
    completed: sessions.filter((s) => s.status === "completed").length,
    missed: sessions.filter((s) => s.status === "missed").length,
    skipped: sessions.filter((s) => s.status === "skipped").length,
    overridden: sessions.filter((s) => s.overrideReason != null).length,
    sessions,
  };
}

router.get("/history", async (req, res): Promise<void> => {
  const routines = await db
    .select()
    .from(dailyRoutinesTable)
    .orderBy(desc(dailyRoutinesTable.date))
    .limit(7);
  const history = await Promise.all(routines.map(buildDayHistory));
  res.json(history);
});

router.get("/history/:date", async (req, res): Promise<void> => {
  const rawDate = Array.isArray(req.params.date) ? req.params.date[0] : req.params.date;
  const [routine] = await db
    .select()
    .from(dailyRoutinesTable)
    .where(eq(dailyRoutinesTable.date, rawDate));
  if (!routine) {
    res.json({ date: rawDate, energyMode: null, totalSessions: 0, completed: 0, missed: 0, skipped: 0, overridden: 0, sessions: [] });
    return;
  }
  res.json(await buildDayHistory(routine));
});

export default router;
