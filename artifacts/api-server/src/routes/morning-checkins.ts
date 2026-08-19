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
 * Upsert — one row per morning, but Karen can register a check-in more
 * than once a day (she forgot, wants to redo it, or things changed later
 * in the morning) — a later submission UPDATES today's row instead of
 * being silently dropped, so opening the check-in again actually does
 * something. Shared by the direct POST route below and the offline sync
 * replay handler (routes/sync.ts), the same way processNfcScan() is
 * shared between live and replayed scans. Retry-safety for the *same*
 * queued event is handled a layer up in routes/sync.ts (clientEventId /
 * event_log dedup) before this ever runs — this function only decides
 * insert-vs-update for today's date.
 */
export async function recordMorningCheckin(body: any) {
  const today = getTodayDateString();

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

  const values = {
    selectedEvents: JSON.stringify(selectedEvents),
    otherText,
    impactScore,
    everythingIsGood,
    status,
  };

  const [existing] = await db.select().from(morningCheckinsTable).where(eq(morningCheckinsTable.date, today));

  if (existing) {
    const [row] = await db
      .update(morningCheckinsTable)
      .set(values)
      .where(eq(morningCheckinsTable.id, existing.id))
      .returning();
    return row;
  }

  try {
    const [row] = await db
      .insert(morningCheckinsTable)
      .values({ date: today, ...values, createdAt: new Date().toISOString() })
      .returning();
    return row;
  } catch (err: any) {
    // Concurrent request already inserted today's row — update it instead.
    if (err?.code === "23505") {
      const [row] = await db
        .update(morningCheckinsTable)
        .set(values)
        .where(eq(morningCheckinsTable.date, today))
        .returning();
      return row;
    }
    throw err;
  }
}

router.post("/morning-checkins", async (req, res): Promise<void> => {
  const row = await recordMorningCheckin(req.body);
  res.json(row);
});

export default router;
