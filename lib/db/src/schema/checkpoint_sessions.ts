import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
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
  durationMinutes: integer("duration_minutes"),
  targetDurationMinutes: integer("target_duration_minutes"),
  minDurationMinutes: integer("min_duration_minutes"),
  skipReason: text("skip_reason"),
  overrideReason: text("override_reason"),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertCheckpointSessionSchema = createInsertSchema(checkpointSessionsTable).omit({ id: true });
export type InsertCheckpointSession = z.infer<typeof insertCheckpointSessionSchema>;
export type CheckpointSession = typeof checkpointSessionsTable.$inferSelect;
