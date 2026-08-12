import { pgTable, serial, text, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkpointsTable = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("MapPin"),
  description: text("description"),
  location: text("location"),
  order: serial("order").notNull(),
  // Stored as decimal minutes — supports sub-minute values (e.g. 0.5 = 30s)
  defaultDurationMinutes: real("default_duration_minutes").notNull().default(0),
  minDurationMinutes: real("min_duration_minutes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  // When true, the first NFC scan both starts AND completes this checkpoint
  completeOnFirstScan: boolean("complete_on_first_scan").notNull().default(false),
  // Stored as JSON string array: ["full","reduced","survival"]
  energyModes: text("energy_modes").notNull().default('["full","reduced","survival"]'),
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertCheckpointSchema = createInsertSchema(checkpointsTable).omit({ id: true });
export type InsertCheckpoint = z.infer<typeof insertCheckpointSchema>;
export type Checkpoint = typeof checkpointsTable.$inferSelect;
