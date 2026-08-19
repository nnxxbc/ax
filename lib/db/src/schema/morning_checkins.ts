import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Morning Check-In — a 10-20 second daily pulse taken right after the user
// gets out of bed, inserted between the "Out of Bed" and "Foam Roller /
// Stretch" checkpoints (see the trigger in home.tsx's applyLocalResult,
// keyed off the "Out of Bed" checkpoint completing).
//
// One row per calendar day — `date` has a UNIQUE constraint, and the POST
// route is idempotent on it (returns the existing row instead of erroring
// or duplicating on a retry/replay).
//
// This is intentionally NOT a clinical or risk-scoring table:
// `impactScore` is a self-reported 0-5 "how much did this affect you"
// rating for the *whole* morning (never per-stressor, never a diagnostic
// or suicide-risk metric). Kept flat/simple so a future adaptive-routine
// feature can later correlate it with checkpoint completion / missed
// checkpoints / movement history for personal pattern insight — see
// Insights work — without this table needing to change shape.
export const morningCheckinsTable = pgTable("morning_checkins", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(), // YYYY-MM-DD, Asia/Tokyo — one check-in per morning
  // Stored as a JSON string array of option keys, e.g. ["nightmare","work_stress"].
  // Empty array ("[]") when everythingIsGood or status is "skipped".
  selectedEvents: text("selected_events").notNull().default("[]"),
  // Free text, only ever populated when "other" is one of the selected events.
  otherText: text("other_text"),
  // 0-5 overall impact for the whole morning. Null when everythingIsGood,
  // or when the check-in was skipped.
  impactScore: integer("impact_score"),
  everythingIsGood: boolean("everything_is_good").notNull().default(false),
  status: text("status").notNull().default("completed"), // completed | skipped
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertMorningCheckinSchema = createInsertSchema(morningCheckinsTable).omit({ id: true });
export type InsertMorningCheckin = typeof morningCheckinsTable.$inferInsert;
export type MorningCheckin = typeof morningCheckinsTable.$inferSelect;
