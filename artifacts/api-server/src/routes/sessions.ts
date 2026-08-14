import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, checkpointSessionsTable, checkpointsTable } from "@workspace/db";
import { SessionActionParams, SessionActionBody } from "@workspace/api-zod";
import { enrichSession, updateRoutineCompletionStatus } from "../lib/routine-helpers";
import { logEvent } from "../lib/event-logger";

const router = Router();

router.post("/sessions/:id/action", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = SessionActionParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = SessionActionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(checkpointSessionsTable)
    .where(eq(checkpointSessionsTable.id, paramsParsed.data.id));
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const [cp] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, session.checkpointId));
  const cpName = cp?.name ?? "Unknown";
  const { action, reason, mode } = bodyParsed.data;
  const now = new Date().toISOString();
  let updates: Record<string, unknown> = {};

  if (mode) updates.mode = mode;

  switch (action) {
    case "start":
      updates = { status: "in_progress", startedAt: now };
      await logEvent(req, "session_started", `${cpName} started`, { checkpointId: session.checkpointId, sessionId: session.id });
      break;
    case "complete":
    case "complete_anyway": {
      const elapsed = session.startedAt
        ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000)
        : 0;
      updates = {
        status: "completed",
        completedAt: now,
        durationMinutes: elapsed,
        overrideReason: action === "complete_anyway" ? (reason ?? "early override") : null,
      };
      await logEvent(req, "session_completed", `${cpName} completed${action === "complete_anyway" ? " (override)" : ""}`, {
        checkpointId: session.checkpointId,
        sessionId: session.id,
      });
      break;
    }
    case "skip":
      updates = { status: "skipped", completedAt: now, skipReason: reason ?? null };
      await logEvent(req, "session_skipped", `${cpName} skipped`, { checkpointId: session.checkpointId, sessionId: session.id });
      break;
    case "miss":
      updates = { status: "missed" };
      await logEvent(req, "session_missed", `${cpName} marked as missed`, { checkpointId: session.checkpointId, sessionId: session.id });
      break;
    case "cancel":
      updates = { status: "cancelled" };
      await logEvent(req, "session_cancelled", `${cpName} cancelled`, { checkpointId: session.checkpointId, sessionId: session.id });
      break;
    case "continue":
      // No-op — user chose to continue
      await logEvent(req, "session_continued", `${cpName} — user chose to continue`, { checkpointId: session.checkpointId, sessionId: session.id });
      break;
    case "extend_time": {
      const addMins = typeof bodyParsed.data.additionalMinutes === "number" ? bodyParsed.data.additionalMinutes : 0;
      const current = session.targetDurationMinutes ?? 0;
      updates = { targetDurationMinutes: current + addMins };
      await logEvent(req, "session_extended", `${cpName} extended by ${addMins} min`, { checkpointId: session.checkpointId, sessionId: session.id });
      break;
    }
  }

  if (Object.keys(updates).length > 0) {
    const [updated] = await db
      .update(checkpointSessionsTable)
      .set(updates)
      .where(eq(checkpointSessionsTable.id, session.id))
      .returning();

    if (updates.status === "completed" || updates.status === "skipped") {
      await updateRoutineCompletionStatus(session.routineId);
    }

    res.json(await enrichSession(updated));
    return;
  }

  res.json(await enrichSession(session));
});

// Deletes a single session row outright — for cleaning up stray/duplicate
// sessions (e.g. from the isRepeatable scan-guard bug where a re-scan of a
// one-time checkpoint used to create an extra row). Unlike the "cancel"
// action above, this actually removes the row so it stops cluttering the
// routine list, rather than just changing its status.
router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(checkpointSessionsTable).where(eq(checkpointSessionsTable.id, id));
  res.status(204).send();
});

export default router;
