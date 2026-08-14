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
  // enforcement_level: off | soft | focused | strict
  enforcementLevel: text("enforcement_level").notNull().default("off"),
  simulationModeEnabled: boolean("simulation_mode_enabled").notNull().default(true),
  developerModeEnabled: boolean("developer_mode_enabled").notNull().default(false),

  // ── Morning alarm (Phase 3) ────────────────────────────────────────────
  // alarmTime / alarmEnabled already existed above, unused until now.
  alarmDaysOfWeek: text("alarm_days_of_week").notNull().default("[1,2,3,4,5]"), // JSON array, 0=Sun..6=Sat
  alarmRequiresNfcDismissal: boolean("alarm_requires_nfc_dismissal").notNull().default(false),
  alarmTargetCheckpointId: integer("alarm_target_checkpoint_id"),
  alarmSoundEnabled: boolean("alarm_sound_enabled").notNull().default(true),
  alarmVibrationEnabled: boolean("alarm_vibration_enabled").notNull().default(true),

  // ── Unified notification preferences (Phase 3) ─────────────────────────
  notifyTimerEnabled: boolean("notify_timer_enabled").notNull().default(true),
  notifyTransitionRemindersEnabled: boolean("notify_transition_reminders_enabled").notNull().default(true),
  transitionReminderDelayMinutes: integer("transition_reminder_delay_minutes").notNull().default(15),
  notifyMissedCheckpointEnabled: boolean("notify_missed_checkpoint_enabled").notNull().default(true),
  notifyCheckInsEnabled: boolean("notify_check_ins_enabled").notNull().default(false),
  checkInIntervalMinutes: integer("check_in_interval_minutes").notNull().default(120),

  // ── Quiet hours (Phase 3) ───────────────────────────────────────────────
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(false),
  quietHoursStart: text("quiet_hours_start").notNull().default("23:00"), // HH:MM
  quietHoursEnd: text("quiet_hours_end").notNull().default("08:00"), // HH:MM
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = typeof settingsTable.$inferInsert;
export type Settings = typeof settingsTable.$inferSelect;
