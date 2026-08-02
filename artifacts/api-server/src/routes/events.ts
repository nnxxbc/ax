import { Router } from "express";
import { desc } from "drizzle-orm";
import { db, eventLogTable, checkpointsTable } from "@workspace/db";

const router = Router();

router.get("/events", async (req, res): Promise<void> => {
  const events = await db
    .select()
    .from(eventLogTable)
    .orderBy(desc(eventLogTable.id))
    .limit(200);
  const checkpoints = await db.select().from(checkpointsTable);
  const cpMap: Record<number, string> = {};
  for (const c of checkpoints) cpMap[c.id] = c.name;
  res.json(
    events.map((e) => ({
      ...e,
      checkpointName: e.checkpointId ? (cpMap[e.checkpointId] ?? null) : null,
    }))
  );
});

router.post("/events/clear", async (req, res): Promise<void> => {
  await db.delete(eventLogTable);
  res.status(204).send();
});

export default router;
