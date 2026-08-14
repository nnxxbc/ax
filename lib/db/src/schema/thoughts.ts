import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Phase 3, Feature 4 — Thought Capture. A low-friction "RAM dump": capture
// first, organize later (or never). category is optional by design — the
// fastest flow is open → type → save, with no required fields beyond content.
export const thoughtsTable = pgTable("thoughts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  // category: thought | task | idea | worry | reminder | null (uncategorized)
  category: text("category"),
  // status: inbox | converted | archived
  status: text("status").notNull().default("inbox"),
  convertedCheckpointId: integer("converted_checkpoint_id"),
  convertedTaskId: integer("converted_task_id"),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertThoughtSchema = createInsertSchema(thoughtsTable).omit({ id: true });
export type InsertThought = typeof thoughtsTable.$inferInsert;
export type Thought = typeof thoughtsTable.$inferSelect;
