import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, dailyRoutinesTable, checkpointSessionsTable, checkpointsTable } from "@workspace/db";

const router = Router();

router.get("/insights", async (req, res): Promise<void> => {
  // Get last 14 days of routines
  const routines = await db
    .select()
    .from(dailyRoutinesTable)
    .orderBy(desc(dailyRoutinesTable.date))
    .limit(14);

  const insights: { type: string; message: string; severity: string; checkpointId: number | null; checkpointName: string | null }[] = [];

  if (routines.length === 0) {
    res.json({
      insights: [{ type: "welcome", message: "Start your first routine to see personalised insights here.", severity: "info", checkpointId: null, checkpointName: null }],
      completionRatePercent: 0,
      mostDifficultCheckpoint: null,
      bestEnergyMode: null,
      streakDays: 0,
      averageCompletionMinutes: null,
    });
    return;
  }

  // Gather all sessions
  const allSessions = await Promise.all(
    routines.map(async (r) => {
      const sessions = await db
        .select()
        .from(checkpointSessionsTable)
        .where(eq(checkpointSessionsTable.routineId, r.id));
      return sessions;
    })
  );
  const flat = allSessions.flat();
  const totalSessions = flat.length;
  const completedSessions = flat.filter((s) => s.status === "completed").length;
  const completionRatePercent = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  // Most missed checkpoint
  const missedCounts: Record<number, number> = {};
  for (const s of flat) {
    if (s.status === "missed" || s.status === "skipped") {
      missedCounts[s.checkpointId] = (missedCounts[s.checkpointId] ?? 0) + 1;
    }
  }
  let mostDifficultCheckpointId: number | null = null;
  let mostDifficultCheckpointName: string | null = null;
  if (Object.keys(missedCounts).length > 0) {
    const topId = Number(Object.entries(missedCounts).sort((a, b) => b[1] - a[1])[0][0]);
    mostDifficultCheckpointId = topId;
    const [cp] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, topId));
    mostDifficultCheckpointName = cp?.name ?? null;
  }

  // Best energy mode
  const modeCounts: Record<string, number> = {};
  for (const r of routines) {
    const sessions = allSessions[routines.indexOf(r)];
    const completed = sessions.filter((s) => s.status === "completed").length;
    const total = sessions.length;
    if (total > 0) {
      modeCounts[r.energyMode] = (modeCounts[r.energyMode] ?? 0) + completed / total;
    }
  }
  const bestEnergyMode = Object.keys(modeCounts).length > 0
    ? Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  // Streak: consecutive days with any completions
  let streakDays = 0;
  for (const r of routines) {
    const sessions = allSessions[routines.indexOf(r)];
    if (sessions.some((s) => s.status === "completed")) streakDays++;
    else break;
  }

  // Average duration
  const durations = flat.filter((s) => s.durationMinutes != null).map((s) => s.durationMinutes as number);
  const averageCompletionMinutes = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  // Build insight messages
  if (completionRatePercent >= 80) {
    insights.push({ type: "streak", message: `You're completing ${completionRatePercent}% of your routine. That consistency is real progress.`, severity: "info", checkpointId: null, checkpointName: null });
  }
  if (mostDifficultCheckpointName) {
    insights.push({ type: "difficulty", message: `Your most skipped station is ${mostDifficultCheckpointName}. Consider switching to Reduced Mode on tough days.`, severity: "tip", checkpointId: mostDifficultCheckpointId, checkpointName: mostDifficultCheckpointName });
  }
  if (bestEnergyMode) {
    const label = bestEnergyMode === "full" ? "Full" : bestEnergyMode === "reduced" ? "Reduced" : "Survival";
    insights.push({ type: "energy_mode", message: `You complete more when using ${label} Mode. That's the right tool for you.`, severity: "info", checkpointId: null, checkpointName: null });
  }
  if (streakDays >= 3) {
    insights.push({ type: "streak", message: `${streakDays} days in a row. Each one matters.`, severity: "info", checkpointId: null, checkpointName: null });
  }
  if (averageCompletionMinutes != null) {
    insights.push({ type: "timing", message: `Your average station takes about ${averageCompletionMinutes} minutes. Your body knows the rhythm.`, severity: "info", checkpointId: null, checkpointName: null });
  }

  if (insights.length === 0) {
    insights.push({ type: "info", message: "Keep going — patterns become clearer after a few days.", severity: "info", checkpointId: null, checkpointName: null });
  }

  res.json({
    insights,
    completionRatePercent,
    mostDifficultCheckpoint: mostDifficultCheckpointName,
    bestEnergyMode,
    streakDays,
    averageCompletionMinutes,
  });
});

export default router;
