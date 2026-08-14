import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, thoughtsTable } from "@workspace/db";

const router = Router();

// Phase 3, Feature 4 — Thought Capture. Deliberately hand-rolled (no orval
// hooks / zod validators) since this is a brand-new resource and codegen
// isn't runnable in this environment — see phase3 report for details.
// Validation here is intentionally minimal/manual to match that constraint.

router.get("/thoughts", async (req, res): Promise<void> => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : undefined;
  const rows = statusFilter
    ? await db.select().from(thoughtsTable).where(eq(thoughtsTable.status, statusFilter))
    : await db.select().from(thoughtsTable);
  rows.sort((a, b) => b.id - a.id);
  res.json(rows);
});

router.post("/thoughts", async (req, res): Promise<void> => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  const category = typeof req.body?.category === "string" ? req.body.category : null;
  const [row] = await db
    .insert(thoughtsTable)
    .values({
      content,
      category,
      status: "inbox",
      createdAt: new Date().toISOString(),
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/thoughts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.content === "string") updates.content = req.body.content;
  if (typeof req.body?.category === "string" || req.body?.category === null) {
    updates.category = req.body.category;
  }
  if (typeof req.body?.status === "string") {
    if (!["inbox", "converted", "archived"].includes(req.body.status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    updates.status = req.body.status;
  }
  if (req.body?.convertedCheckpointId !== undefined) {
    updates.convertedCheckpointId = req.body.convertedCheckpointId;
  }
  if (req.body?.convertedTaskId !== undefined) {
    updates.convertedTaskId = req.body.convertedTaskId;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }
  const [row] = await db.update(thoughtsTable).set(updates).where(eq(thoughtsTable.id, id)).returning();
  if (!row) {
    res.status(404).json({ error: "Thought not found" });
    return;
  }
  res.json(row);
});

router.delete("/thoughts/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(thoughtsTable).where(eq(thoughtsTable.id, id));
  res.status(204).send();
});

export default router;
