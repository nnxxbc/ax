import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, nfcTagsTable, checkpointsTable, checkpointSessionsTable, dailyRoutinesTable, eventLogTable } from "@workspace/db";
import {
  CreateNfcTagBody,
  UpdateNfcTagParams,
  UpdateNfcTagBody,
  DeleteNfcTagParams,
  HandleNfcScanBody,
  SimulateNfcScanBody,
} from "@workspace/api-zod";
import { logEvent } from "../lib/event-logger";
import { processNfcScan } from "../lib/nfc-scan-processor";

const router = Router();

// --- NFC Tag CRUD ---
router.get("/nfc-tags", async (req, res): Promise<void> => {
  const tags = await db.select().from(nfcTagsTable).orderBy(nfcTagsTable.id);
  const checkpoints = await db.select().from(checkpointsTable);
  const cpMap: Record<number, string> = {};
  for (const c of checkpoints) cpMap[c.id] = c.name;
  res.json(
    tags.map((t) => ({
      ...t,
      checkpointName: t.checkpointId ? (cpMap[t.checkpointId] ?? null) : null,
    }))
  );
});

router.post("/nfc-tags", async (req, res): Promise<void> => {
  const parsed = CreateNfcTagBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(nfcTagsTable)
    .values({ ...parsed.data, createdAt: new Date().toISOString() })
    .returning();
  let checkpointName: string | null = null;
  if (row.checkpointId) {
    const [cp] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, row.checkpointId));
    checkpointName = cp?.name ?? null;
  }
  await logEvent(req, "nfc_tag_registered", `NFC tag registered: ${row.tagUid}`, { checkpointId: row.checkpointId });
  res.status(201).json({ ...row, checkpointName });
});

router.patch("/nfc-tags/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const paramsParsed = UpdateNfcTagParams.safeParse({ id: Number(rawId) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateNfcTagBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const [row] = await db
    .update(nfcTagsTable)
    .set(bodyParsed.data)
    .where(eq(nfcTagsTable.id, paramsParsed.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "NFC tag not found" });
    return;
  }
  let checkpointName: string | null = null;
  if (row.checkpointId) {
    const [cp] = await db.select().from(checkpointsTable).where(eq(checkpointsTable.id, row.checkpointId));
    checkpointName = cp?.name ?? null;
  }
  res.json({ ...row, checkpointName });
});

router.delete("/nfc-tags/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = DeleteNfcTagParams.safeParse({ id: Number(rawId) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(nfcTagsTable).where(eq(nfcTagsTable.id, parsed.data.id));
  res.status(204).send();
});

// --- NFC Scan ---
router.post("/nfc/scan", async (req, res): Promise<void> => {
  const parsed = HandleNfcScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // Find checkpoint by tag UID
  const [tag] = await db.select().from(nfcTagsTable).where(eq(nfcTagsTable.tagUid, parsed.data.tagUid));
  if (!tag) {
    res.json({ action: "unknown_tag", sessionId: null, checkpointId: null, checkpointName: null, message: "Tag not registered" });
    return;
  }
  if (!tag.checkpointId) {
    res.json({ action: "no_checkpoint_assigned", sessionId: null, checkpointId: null, checkpointName: null, message: "Tag has no checkpoint assigned" });
    return;
  }
  const result = await processNfcScan(req, tag.checkpointId);
  res.json(result);
});

router.post("/nfc/simulate", async (req, res): Promise<void> => {
  const parsed = SimulateNfcScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await processNfcScan(req, parsed.data.checkpointId);
  res.json(result);
});

export default router;
