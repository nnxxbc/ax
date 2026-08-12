import type { Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, checkpointsTable, checkpointSessionsTable } from "@workspace/db";
import { logEvent } from "./event-logger";
import { getOrCreateTodayRoutine, enrichSession } from "./routine-helpers";

// ─── Debounce guard: prevent duplicate reads within 2s ────────────────────────
const lastScanTime = new Map<number, number>(); // checkpointId → epoch ms
const DEBOUNCE_MS = 2000;

export async function processNfcScan(req: Request, checkpointId: number) {
  // Debounce — same checkpoint scanned again within 2s → ignore
  const now = Date.now();
  const last = lastScanTime.get(checkpointId) ?? 0;
  if (now - last < DEBOUNCE_MS) {
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

  const inProgress = sessions.find((s) => s.status === "in_progress");
  const waiting = sessions.find((s) => s.status === "waiting");

  if (inProgress) {
    // Second scan — complete the session
    const nowDate = new Date();
    const startedAt = inProgress.startedAt ? new Date(inProgress.startedAt) : nowDate;
    const elapsedMs = nowDate.getTime() - startedAt.getTime();
    const elapsedMinutes = elapsedMs / 60000; // keep decimal precision
    const minDuration = inProgress.minDurationMinutes ?? 0;

    if (minDuration > 0 && elapsedMinutes < minDuration) {
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

    const [updated] = await db
      .update(checkpointSessionsTable)
      .set({ status: "completed", completedAt: nowDate.toISOString(), durationMinutes: elapsedMinutes })
      .where(eq(checkpointSessionsTable.id, inProgress.id))
      .returning();

    await logEvent(req, "session_completed", `${checkpoint.name} completed (${elapsedMinutes.toFixed(1)}m)`, {
      checkpointId,
      sessionId: inProgress.id,
    });
    return {
      action: "completed",
      sessionId: updated.id,
      checkpointId,
      checkpointName: checkpoint.name,
      message: `${checkpoint.name} completed!`,
      elapsedMinutes,
      targetMinutes: inProgress.targetDurationMinutes ?? null,
      session: await enrichSession(updated),
    };
  }

  if (waiting) {
    const nowIso = new Date().toISOString();

    // completeOnFirstScan: start AND immediately complete in one scan
    if (checkpoint.completeOnFirstScan) {
      const [updated] = await db
        .update(checkpointSessionsTable)
        .set({ status: "completed", startedAt: nowIso, completedAt: nowIso, durationMinutes: 0 })
        .where(eq(checkpointSessionsTable.id, waiting.id))
        .returning();
      await logEvent(req, "session_completed", `${checkpoint.name} completed on first scan`, {
        checkpointId,
        sessionId: updated.id,
      });
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
    const [updated] = await db
      .update(checkpointSessionsTable)
      .set({ status: "in_progress", startedAt: nowIso })
      .where(eq(checkpointSessionsTable.id, waiting.id))
      .returning();

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
