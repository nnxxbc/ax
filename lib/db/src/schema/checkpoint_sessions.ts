import { pgTable, serial, text, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const checkpointSessionsTable = pgTable("checkpoint_sessions", {
  id: serial("id").primaryKey(),
  routineId: integer("routine_id").notNull(),
  checkpointId: integer("checkpoint_id").notNull(),
  status: text("status").notNull().default("waiting"), // waiting | in_progress | completed | missed | skipped | cancelled
  order: integer("order").notNull(),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  durationMinutes: real("duration_minutes"),
  targetDurationMinutes: real("target_duration_minutes"),
  minDurationMinutes: real("min_duration_minutes"),
  skipReason: text("skip_reason"),
  overrideReason: text("override_reason"),
  // mode: for special checkpoints (e.g. bed: 'working_from_bed' | 'frozen')
  mode: text("mode"),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertCheckpointSessionSchema = createInsertSchema(checkpointSessionsTable).omit({ id: true });
export type InsertCheckpointSession = typeof checkpointSessionsTable.$inferInsert;
export type CheckpointSession = typeof checkpointSessionsTable.$inferSelect;
