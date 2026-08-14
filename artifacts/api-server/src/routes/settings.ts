import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getOrCreateSettings } from "../lib/routine-helpers";

const router = Router();

// alarmDaysOfWeek is stored as a JSON string column (same convention as
// checkpoints.energyModes) but exposed to clients as a real array.
function serializeSettings(row: typeof settingsTable.$inferSelect) {
  let alarmDaysOfWeek: number[] = [1, 2, 3, 4, 5];
  try {
    alarmDaysOfWeek = JSON.parse(row.alarmDaysOfWeek);
  } catch {
    // fall back to default above
  }
  return { ...row, alarmDaysOfWeek };
}

router.get("/settings", async (req, res): Promise<void> => {
  res.json(serializeSettings(await getOrCreateSettings()));
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { alarmDaysOfWeek, ...rest } = parsed.data;
  const updates: Record<string, unknown> = { ...rest };
  if (alarmDaysOfWeek) updates.alarmDaysOfWeek = JSON.stringify(alarmDaysOfWeek);
  const current = await getOrCreateSettings();
  const [updated] = await db
    .update(settingsTable)
    .set(updates)
    .where(eq(settingsTable.id, current.id))
    .returning();
  res.json(serializeSettings(updated));
});

export default router;
