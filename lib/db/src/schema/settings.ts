import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  alarmTime: text("alarm_time"), // HH:MM
  alarmEnabled: boolean("alarm_enabled").notNull().default(false),
  freezeInterventionDelayMinutes: integer("freeze_intervention_delay_minutes").notNull().default(5),
  freezeEscalationDelayMinutes: integer("freeze_escalation_delay_minutes").notNull().default(3),
  // Seconds of inactivity on the waiting screen before freeze intervention triggers
  freezeStuckThresholdSeconds: integer("freeze_stuck_threshold_seconds").notNull().default(30),
  strictModeEnabled: boolean("strict_mode_enabled").notNull().default(false),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  vibrationEnabled: boolean("vibration_enabled").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(false),
  defaultEnergyMode: text("default_energy_mode").notNull().default("full"),
  simulationModeEnabled: boolean("simulation_mode_enabled").notNull().default(true),
  developerModeEnabled: boolean("developer_mode_enabled").notNull().default(false),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
