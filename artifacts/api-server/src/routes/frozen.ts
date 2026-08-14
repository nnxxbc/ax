import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, frozenEventsTable } from "@workspace/db";

const router = Router();

// Phase 3, Features 7/8 — Frozen Protocol event logging. Hand-rolled for the
// same reason as thoughts.ts: brand-new resource, no orval codegen available.

router.post("/frozen-events", async (req, res): Promise<void> => {
  const bedCheckpointId = Number(req.body?.bedCheckpointId);
  if (!Number.isInteger(bedCheckpointId)) {
    res.status(400).json({ error: "bedCheckpointId is required" });
    return;
  }
  const bedSessionId =
    req.body?.bedSessionId !== undefined && req.body?.bedSessionId !== null
      ? Number(req.body.bedSessionId)
      : null;
  const [row] = await db
    .insert(frozenEventsTable)
    .values({
      bedCheckpointId,
      bedSessionId,
      startedAt: new Date().toISOString(),
      stepsAttempted: "[]",
      tooHardCount: 0,
      successfulTransition: false,
      createdAt: new Date().toISOString(),
    })
    .returning();
  res.status(201).json({ ...row, stepsAttempted: JSON.parse(row.stepsAttempted) });
});

router.patch("/frozen-events/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db.select().from(frozenEventsTable).where(eq(frozenEventsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Frozen event not found" });
    return;
  }

  const updates: Record<string, unknown> = {};

  // Append-only step log: client sends the single step string just attempted,
  // e.g. "stage1:wiggle_toes", "stage2:sit_up", "too_hard".
  if (typeof req.body?.appendStep === "string") {
    let steps: string[] = [];
    try {
      steps = JSON.parse(existing.stepsAttempted);
    } catch {
      steps = [];
    }
    steps.push(req.body.appendStep);
    updates.stepsAttempted = JSON.stringify(steps);
    // Matches "too_hard" and namespaced variants like "stage2:too_hard".
    if (req.body.appendStep === "too_hard" || req.body.appendStep.endsWith(":too_hard")) {
      updates.tooHardCount = existing.tooHardCount + 1;
    }
  }

  if (req.body?.destinationCheckpointId !== undefined) {
    updates.destinationCheckpointId = req.body.destinationCheckpointId;
  }

  if (req.body?.complete === true) {
    const startedAtMs = new Date(existing.startedAt).getTime();
    updates.completedAt = new Date().toISOString();
    updates.successfulTransition = true;
    updates.recoveryDurationSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.round((Date.now() - startedAtMs) / 1000))
      : null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [row] = await db
    .update(frozenEventsTable)
    .set(updates)
    .where(eq(frozenEventsTable.id, id))
    .returning();
  let stepsAttempted: string[] = [];
  try {
    stepsAttempted = JSON.parse(row.stepsAttempted);
  } catch {
    stepsAttempted = [];
  }
  res.json({ ...row, stepsAttempted });
});

router.get("/frozen-events", async (req, res): Promise<void> => {
  const rows = await db.select().from(frozenEventsTable);
  rows.sort((a, b) => b.id - a.id);
  res.json(
    rows.map((row) => {
      let stepsAttempted: string[] = [];
      try {
        stepsAttempted = JSON.parse(row.stepsAttempted);
      } catch {
        stepsAttempted = [];
      }
      return { ...row, stepsAttempted };
    })
  );
});

export default router;
