import type { Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, checkpointsTable, checkpointSessionsTable, dailyRoutinesTable } from "@workspace/db";
import { logEvent } from "./event-logger";
import { getTodayDateString, getOrCreateTodayRoutine, enrichSession } from "./routine-helpers";

export async function processNfcScan(req: Request, checkpointId: number) {
  const [checkpoint] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, checkpointId));
  if (!checkpoint) {
    return {
      action: "no_checkpoint_assigned",
      sessionId: null,
      checkpointId,
      checkpointName: null,
      message: "Checkpoint not found",
      elapsedMinutes: null,
      targetMinutes: null,
      session: null,
    };
  }

  const routine = await getOrCreateTodayRoutine();
  const sessions = await db
    .select()
    .from(checkpointSessionsTable)
    .where(and(eq(checkpointSessionsTable.routineId, routine.id), eq(checkpointSessionsTable.checkpointId, checkpointId)));

  // Find the most relevant session for this checkpoint
  const inProgress = sessions.find((s) => s.status === "in_progress");
  const waiting = sessions.find((s) => s.status === "waiting");

  if (inProgress) {
    // Second scan — complete the session
    const now = new Date();
    const startedAt = inProgress.startedAt ? new Date(inProgress.startedAt) : now;
    const elapsedMs = now.getTime() - startedAt.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / 60000);
    const minDuration = inProgress.minDurationMinutes ?? 0;

    if (minDuration > 0 && elapsedMinutes < minDuration) {
      // Early — warn user, don't auto-complete
      const enriched = await enrichSession(inProgress);
      await logEvent(req, "early_complete_warning", `${checkpoint.name} — early scan (${elapsedMinutes}m / ${minDuration}m min)`, {
        checkpointId,
        sessionId: inProgress.id,
      });
      return {
        action: "early_complete_warning",
        sessionId: inProgress.id,
        checkpointId,
        checkpointName: checkpoint.name,
        message: `You've been here for ${elapsedMinutes} minute${elapsedMinutes !== 1 ? "s" : ""}. Your minimum time is ${minDuration} minutes.`,
        elapsedMinutes,
        targetMinutes: inProgress.targetDurationMinutes ?? null,
        session: enriched,
      };
    }

    // Complete it
    const [updated] = await db
      .update(checkpointSessionsTable)
      .set({
        status: "completed",
        completedAt: now.toISOString(),
        durationMinutes: elapsedMinutes,
      })
      .where(eq(checkpointSessionsTable.id, inProgress.id))
      .returning();

    await logEvent(req, "session_completed", `${checkpoint.name} completed (${elapsedMinutes}m)`, {
      checkpointId,
      sessionId: inProgress.id,
    });
    const enriched = await enrichSession(updated);
    return {
      action: "completed",
      sessionId: updated.id,
      checkpointId,
      checkpointName: checkpoint.name,
      message: `${checkpoint.name} completed!`,
      elapsedMinutes,
      targetMinutes: inProgress.targetDurationMinutes ?? null,
      session: enriched,
    };
  }

  if (waiting) {
    // First scan — start the session
    const now = new Date().toISOString();
    const [updated] = await db
      .update(checkpointSessionsTable)
      .set({
        status: "in_progress",
        startedAt: now,
      })
      .where(eq(checkpointSessionsTable.id, waiting.id))
      .returning();

    await logEvent(req, "session_started", `${checkpoint.name} started`, {
      checkpointId,
      sessionId: updated.id,
    });
    const enriched = await enrichSession(updated);
    return {
      action: "started",
      sessionId: updated.id,
      checkpointId,
      checkpointName: checkpoint.name,
      message: `${checkpoint.name} started. Park your phone.`,
      elapsedMinutes: 0,
      targetMinutes: updated.targetDurationMinutes ?? null,
      session: enriched,
    };
  }

  return {
    action: "no_checkpoint_assigned",
    sessionId: null,
    checkpointId,
    checkpointName: checkpoint.name,
    message: "No active session for this checkpoint",
    elapsedMinutes: null,
    targetMinutes: null,
    session: null,
  };
}
