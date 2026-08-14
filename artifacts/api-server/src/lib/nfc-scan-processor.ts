import type { Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, checkpointsTable, checkpointSessionsTable } from "@workspace/db";
import { logEvent } from "./event-logger";
import { getOrCreateTodayRoutine, enrichSession, updateRoutineCompletionStatus } from "./routine-helpers";

// ─── Debounce guard: prevent duplicate reads within 2s ────────────────────────
const lastScanTime = new Map<number, number>(); // checkpointId → epoch ms
const DEBOUNCE_MS = 2000;

export async function processNfcScan(req: Request, checkpointId: number) {
  req.log.info({ checkpointId }, "Processing NFC scan");

  // Debounce — same checkpoint scanned again within 2s → ignore
  const now = Date.now();
  const last = lastScanTime.get(checkpointId) ?? 0;
  if (now - last < DEBOUNCE_MS) {
    req.log.warn({ checkpointId, elapsed: now - last }, "Scan debounced");
    return {
      action: "debounced",
      sessionId: null,
      checkpointId,
      checkpointName: null,
      message: "Duplicate scan ignored",
      elapsedMinutes: null,
      targetMinutes: null,
      session: null,
    };
  }
  lastScanTime.set(checkpointId, now);

  const [checkpoint] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, checkpointId));
  if (!checkpoint) {
    req.log.error({ checkpointId }, "Checkpoint not found");
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
  req.log.info({ routineId: routine.id }, "Routine context");

  const sessions = await db
    .select()
    .from(checkpointSessionsTable)
    .where(and(eq(checkpointSessionsTable.routineId, routine.id), eq(checkpointSessionsTable.checkpointId, checkpointId)));

  const inProgress = sessions.find((s) => s.status === "in_progress");
  const waiting = sessions.find((s) => s.status === "waiting");

  req.log.info({ inProgress: !!inProgress, waiting: !!waiting }, "Session state search result");

  if (inProgress) {
    req.log.info({ sessionId: inProgress.id }, "Attempting to complete in-progress session");
    // Second scan — complete the session
    const nowDate = new Date();
    const startedAt = inProgress.startedAt ? new Date(inProgress.startedAt) : nowDate;
    const elapsedMs = nowDate.getTime() - startedAt.getTime();
    const elapsedMinutes = elapsedMs / 60000; // keep decimal precision
    const minDuration = inProgress.minDurationMinutes ?? 0;

    if (minDuration > 0 && elapsedMinutes < minDuration) {
      req.log.warn({ elapsedMinutes, minDuration }, "Early complete warning triggered");
      const enriched = await enrichSession(inProgress);
      await logEvent(req, "early_complete_warning", `${checkpoint.name} — early scan (${elapsedMinutes.toFixed(1)}m / ${minDuration}m min)`, {
        checkpointId,
        sessionId: inProgress.id,
      });
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const minSec = Math.floor(minDuration * 60);
      return {
        action: "early_complete_warning",
        sessionId: inProgress.id,
        checkpointId,
        checkpointName: checkpoint.name,
        message: `You've been here ${elapsedSec}s. Minimum is ${minSec}s.`,
        elapsedMinutes,
        targetMinutes: inProgress.targetDurationMinutes ?? null,
        session: enriched,
      };
    }

    req.log.info({ sessionId: inProgress.id }, "Updating session to completed");
    const [updated] = await db
      .update(checkpointSessionsTable)
      .set({ status: "completed", completedAt: nowDate.toISOString(), durationMinutes: elapsedMinutes })
      .where(eq(checkpointSessionsTable.id, inProgress.id))
      .returning();

    if (!updated) throw new Error(`Failed to update session ${inProgress.id} to completed`);

    await logEvent(req, "session_completed", `${checkpoint.name} completed (${elapsedMinutes.toFixed(1)}m)`, {
      checkpointId,
      sessionId: inProgress.id,
    });

    req.log.info({ routineId: routine.id }, "Updating routine completion status");
    await updateRoutineCompletionStatus(routine.id);

    const enriched = await enrichSession(updated);
    req.log.info({ sessionId: updated.id }, "Session completed successfully");
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
    req.log.info({ sessionId: waiting.id }, "Starting waiting session");
    const nowIso = new Date().toISOString();

    // completeOnFirstScan: start AND immediately complete in one scan
    if (checkpoint.completeOnFirstScan) {
      req.log.info({ sessionId: waiting.id }, "Completing on first scan");
      const [updated] = await db
        .update(checkpointSessionsTable)
        .set({ status: "completed", startedAt: nowIso, completedAt: nowIso, durationMinutes: 0 })
        .where(eq(checkpointSessionsTable.id, waiting.id))
        .returning();

      if (!updated) throw new Error(`Failed to update session ${waiting.id} to completed`);

      await logEvent(req, "session_completed", `${checkpoint.name} completed on first scan`, {
        checkpointId,
        sessionId: updated.id,
      });

      await updateRoutineCompletionStatus(routine.id);

      return {
        action: "completed",
        sessionId: updated.id,
        checkpointId,
        checkpointName: checkpoint.name,
        message: `${checkpoint.name} complete — moving on.`,
        elapsedMinutes: 0,
        targetMinutes: null,
        session: await enrichSession(updated),
      };
    }

    // Normal first scan — start session
    req.log.info({ sessionId: waiting.id }, "Starting normal session");
    const [updated] = await db
      .update(checkpointSessionsTable)
      .set({ status: "in_progress", startedAt: nowIso })
      .where(eq(checkpointSessionsTable.id, waiting.id))
      .returning();

    if (!updated) throw new Error(`Failed to update session ${waiting.id} to in_progress`);

    await logEvent(req, "session_started", `${checkpoint.name} started`, { checkpointId, sessionId: updated.id });
    return {
      action: "started",
      sessionId: updated.id,
      checkpointId,
      checkpointName: checkpoint.name,
      message: `${checkpoint.name} started. Park your phone.`,
      elapsedMinutes: 0,
      targetMinutes: updated.targetDurationMinutes ?? null,
      session: await enrichSession(updated),
    };
  }

  // No in_progress or waiting session -> Create a new repeatable session
  req.log.info("No active session found. Creating new repeat session.");
  const nowIso = new Date().toISOString();
  const [newSession] = await db
    .insert(checkpointSessionsTable)
    .values({
      routineId: routine.id,
      checkpointId: checkpoint.id,
      status: "in_progress",
      order: checkpoint.order,
      startedAt: nowIso,
      targetDurationMinutes: checkpoint.defaultDurationMinutes > 0 ? checkpoint.defaultDurationMinutes : null,
      minDurationMinutes: checkpoint.minDurationMinutes > 0 ? checkpoint.minDurationMinutes : null,
      createdAt: nowIso,
    })
    .returning();

  if (!newSession) throw new Error("Failed to insert new repeatable session");

  await logEvent(req, "session_started", `${checkpoint.name} started (repeat)`, { checkpointId, sessionId: newSession.id });

  const enriched = await enrichSession(newSession);
  req.log.info({ sessionId: newSession.id }, "New repeat session started");
  return {
    action: "started",
    sessionId: newSession.id,
    checkpointId,
    checkpointName: checkpoint.name,
    message: `${checkpoint.name} started.`,
    elapsedMinutes: 0,
    targetMinutes: newSession.targetDurationMinutes ?? null,
    session: enriched,
  };
}
