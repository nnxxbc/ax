import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, morningCheckinsTable } from "@workspace/db";
import { getTodayDateString } from "../lib/routine-helpers";

const router = Router();

// Morning Check-In — hand-rolled (no orval codegen / zod validators, same
// as thoughts.ts and frozen.ts) since this is a brand-new resource.
//
// Deliberately simple: the whole point is "detect -> record -> continue
// moving", so the server never blocks or rejects a check-in over a missing
// optional field — it just stores whatever valid shape it's given and
// falls back to safe defaults otherwise.

const VALID_EVENT_KEYS = new Set([
  "nightmare",
  "conflict",
  "work_stress",
  "relationship_stress",
  "home_stress",
  "poor_sleep",
  "overthinking",
  "freeze_shutdown",
  "other",
]);

router.get("/morning-checkins/today", async (_req, res): Promise<void> => {
  const today = getTodayDateString();
  const [row] = await db.select().from(morningCheckinsTable).where(eq(morningCheckinsTable.date, today));
  res.json(row ?? null);
});

/**
 * Idempotent create — one check-in per morning. Shared by the direct POST
 * route below and the offline sync replay handler (routes/sync.ts), the
 * same way processNfcScan() is shared between live and replayed scans.
 * If today's check-in is already recorded (a retried request, a queued
 * event replayed twice, or the screen somehow got triggered twice), the
 * existing row is returned rather than erroring or duplicating it.
 */
export async function recordMorningCheckin(body: any) {
  const today = getTodayDateString();

  const [existing] = await db.select().from(morningCheckinsTable).where(eq(morningCheckinsTable.date, today));
  if (existing) return existing;

  const status = body?.status === "skipped" ? "skipped" : "completed";
  const everythingIsGood = status === "completed" && !!body?.everythingIsGood;

  let selectedEvents: string[] = [];
  if (status === "completed" && !everythingIsGood && Array.isArray(body?.selectedEvents)) {
    selectedEvents = body.selectedEvents.filter(
      (e: unknown): e is string => typeof e === "string" && VALID_EVENT_KEYS.has(e),
    );
  }

  const otherText =
    selectedEvents.includes("other") && typeof body?.otherText === "string"
      ? body.otherText.trim().slice(0, 280) || null
      : null;

  let impactScore: number | null = null;
  if (status === "completed" && !everythingIsGood && body?.impactScore != null) {
    const n = Number(body.impactScore);
    if (Number.isInteger(n) && n >= 0 && n <= 5) impactScore = n;
  }

  try {
    const [row] = await db
      .insert(morningCheckinsTable)
      .values({
        date: today,
        selectedEvents: JSON.stringify(selectedEvents),
        otherText,
        impactScore,
        everythingIsGood,
        status,
        createdAt: new Date().toISOString(),
      })
      .returning();
    return row;
  } catch (err: any) {
    // Concurrent request already inserted today's row — treat as success.
    if (err?.code === "23505") {
      const [row] = await db.select().from(morningCheckinsTable).where(eq(morningCheckinsTable.date, today));
      return row;
    }
    throw err;
  }
}

router.post("/morning-checkins", async (req, res): Promise<void> => {
  const row = await recordMorningCheckin(req.body);
  res.status(201).json(row);
});

export default router;
