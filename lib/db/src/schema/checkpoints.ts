import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkpointsTable = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("MapPin"),
  description: text("description"),
  location: text("location"),
  order: integer("order").notNull(),
  defaultDurationMinutes: integer("default_duration_minutes").notNull().default(0),
  minDurationMinutes: integer("min_duration_minutes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // Stored as JSON string array: ["full","reduced","survival"]
  energyModes: text("energy_modes").notNull().default('["full","reduced","survival"]'),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertCheckpointSchema = createInsertSchema(checkpointsTable).omit({ id: true });
export type InsertCheckpoint = z.infer<typeof insertCheckpointSchema>;
export type Checkpoint = typeof checkpointsTable.$inferSelect;
