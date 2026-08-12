import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const dailyRoutinesTable = pgTable("daily_routines", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(), // YYYY-MM-DD
  energyMode: text("energy_mode").notNull().default("full"), // full | reduced | survival
  status: text("status").notNull().default("active"), // active | completed | abandoned
  createdAt: text("created_at").notNull().default("now()"),
});

export const insertDailyRoutineSchema = createInsertSchema(dailyRoutinesTable).omit({ id: true });
export type InsertDailyRoutine = z.infer<typeof insertDailyRoutineSchema>;
export type DailyRoutine = typeof dailyRoutinesTable.$inferSelect;
