import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Phase 3, Feature 7/8 — Frozen Protocol events. One row per time the user
// enters the frozen state from the Bed checkpoint. stepsAttempted is stored
// as a JSON string array (each entry e.g. "stage1:wiggle_toes:done") rather
// than a separate table — this is simple interaction logging for future
// Insights, not a system that needs relational querying into individual steps.
export const frozenEventsTable = pgTable("frozen_events", {
  id: serial("id").primaryKey(),
  bedCheckpointId: integer("bed_checkpoint_id").notNull(),
  bedSessionId: integer("bed_session_id"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  destinationCheckpointId: integer("destination_checkpoint_id"),
  stepsAttempted: text("steps_attempted").notNull().default("[]"), // JSON string[]
  tooHardCount: integer("too_hard_count").notNull().default(0),
  successfulTransition: boolean("successful_transition").notNull().default(false),
  recoveryDurationSeconds: integer("recovery_duration_seconds"),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertFrozenEventSchema = createInsertSchema(frozenEventsTable).omit({ id: true });
export type InsertFrozenEvent = typeof frozenEventsTable.$inferInsert;
export type FrozenEvent = typeof frozenEventsTable.$inferSelect;
