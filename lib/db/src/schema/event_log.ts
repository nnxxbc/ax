import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventLogTable = pgTable("event_log", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  checkpointId: integer("checkpoint_id"),
  sessionId: integer("session_id"),
  details: text("details"),
  timestamp: text("timestamp").notNull().default("now()"),
});

export const insertEventLogSchema = createInsertSchema(eventLogTable).omit({ id: true });
export type InsertEventLog = z.infer<typeof insertEventLogSchema>;
export type EventLog = typeof eventLogTable.$inferSelect;
