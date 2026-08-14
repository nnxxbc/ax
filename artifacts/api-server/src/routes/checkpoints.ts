import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, checkpointsTable, nfcTagsTable } from "@workspace/db";
import {
  CreateCheckpointBody,
  UpdateCheckpointParams,
  UpdateCheckpointBody,
  GetCheckpointParams,
  DeleteCheckpointParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/checkpoints", async (req, res): Promise<void> => {
  const rows = await db.select().from(checkpointsTable).orderBy(checkpointsTable.order);
  const nfcTags = await db.select().from(nfcTagsTable);
  const tagByCheckpoint: Record<number, number> = {};
  for (const t of nfcTags) {
    if (t.checkpointId) tagByCheckpoint[t.checkpointId] = t.id;
  }
  res.json(
    rows.map((c) => {
      let modes = ["full", "reduced", "survival"];
      try {
          modes = JSON.parse(c.energyModes);
      } catch (e) {
          req.log.error({ err: e, checkpointId: c.id }, "Failed to parse energyModes");
      }
      let days: number[] = [];
      try {
        days = JSON.parse(c.daysOfWeek ?? "[]");
      } catch (e) {
        req.log.error({ err: e, checkpointId: c.id }, "Failed to parse daysOfWeek");
      }
      return {
        ...c,
        energyModes: modes,
        daysOfWeek: days,
        nfcTagId: tagByCheckpoint[c.id] ?? null,
      };
    })
  );
});

router.post("/checkpoints", async (req, res): Promise<void> => {
  const parsed = CreateCheckpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { energyModes, daysOfWeek, ...rest } = parsed.data;
  const [row] = await db
    .insert(checkpointsTable)
    .values({
      ...rest,
      energyModes: JSON.stringify(energyModes ?? ["full", "reduced", "survival"]),
      daysOfWeek: JSON.stringify(daysOfWeek ?? []),
      createdAt: new Date().toISOString(),
    })
    .returning();
  res.status(201).json({ ...row, energyModes: JSON.parse(row.energyModes), daysOfWeek: JSON.parse(row.daysOfWeek), nfcTagId: null });
});

router.get("/checkpoints/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = GetCheckpointParams.safeParse({ id: Number(raw) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, parsed.data.id));
  if (!row) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }
  const [tag] = await db.select().from(nfcTagsTable).where(eq(nfcTagsTable.checkpointId, parsed.data.id));
  res.json({ ...row, energyModes: JSON.parse(row.energyModes), daysOfWeek: JSON.parse(row.daysOfWeek ?? "[]"), nfcTagId: tag?.id ?? null });
});

router.patch("/checkpoints/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = UpdateCheckpointParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateCheckpointBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const { energyModes, daysOfWeek, ...rest } = bodyParsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (energyModes) updates.energyModes = JSON.stringify(energyModes);
  if (daysOfWeek !== undefined) updates.daysOfWeek = JSON.stringify(daysOfWeek ?? []);
  const [row] = await db
    .update(checkpointsTable)
    .set(updates)
    .where(eq(checkpointsTable.id, paramsParsed.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Checkpoint not found" });
    return;
  }
  const [tag] = await db.select().from(nfcTagsTable).where(eq(nfcTagsTable.checkpointId, row.id));
  res.json({ ...row, energyModes: JSON.parse(row.energyModes), daysOfWeek: JSON.parse(row.daysOfWeek ?? "[]"), nfcTagId: tag?.id ?? null });
});

router.delete("/checkpoints/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = DeleteCheckpointParams.safeParse({ id: Number(rawId) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(checkpointsTable).where(eq(checkpointsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
