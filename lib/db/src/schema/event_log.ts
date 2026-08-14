import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const eventLogTable = pgTable("event_log", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  message: text("message").notNull(),
  checkpointId: integer("checkpoint_id"),
  sessionId: integer("session_id"),
  details: text("details"),
  timestamp: text("timestamp").notNull().default("now()"),
  // Idempotency key for offline sync events (see routes/sync.ts). Nullable
  // because normal server-originated events (e.g. simulator scans) don't
  // have a client-generated id. Unique so retrying a sync event can never
  // create a duplicate — the DB itself enforces the guarantee, not just
  // an application-level check.
  clientEventId: text("client_event_id").unique(),
});

export const insertEventLogSchema = createInsertSchema(eventLogTable).omit({ id: true });
export type InsertEventLog = typeof eventLogTable.$inferInsert;
export type EventLog = typeof eventLogTable.$inferSelect;
