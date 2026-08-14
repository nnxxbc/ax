/**
 * alarm-rules.ts — pure logic for Phase 3 Feature 1, the persistent morning
 * alarm. No I/O, no Capacitor imports — runs under
 * `node --experimental-strip-types` like the rest of this app's pure logic.
 *
 * Two responsibilities:
 *  1. Map the (day-of-week[], "HH:MM") settings shape into Capacitor
 *     LocalNotifications' `Weekday` enum (Sunday=1..Saturday=7) + hour/minute.
 *  2. Decide, given "now" and a "last dismissed" date, whether the in-app
 *     full-screen alarm lock overlay should currently be showing. This is
 *     the client-side half of "persistent... impossible to sleep through":
 *     the OS notification alone can be swiped away, so once the user opens
 *     the app during the alarm window, the lock overlay re-asserts itself
 *     until they dismiss it via NFC (or the emergency fallback).
 */

import { parseHHMM } from "./notification-rules.ts";

export interface AlarmSettingsSlice {
  alarmEnabled?: boolean;
  alarmTime?: string | null; // "HH:MM"
  alarmDaysOfWeek?: number[]; // 0=Sunday..6=Saturday
  alarmRequiresNfcDismissal?: boolean;
}

/** 0=Sunday..6=Saturday -> Capacitor's Weekday enum value (Sunday=1..Saturday=7). */
export function dayOfWeekToCapacitorWeekday(day: number): number {
  return (((day % 7) + 7) % 7) + 1;
}

export interface ParsedAlarmTime {
  hour: number;
  minute: number;
}

export function parseAlarmTime(value: string | undefined | null): ParsedAlarmTime | null {
  const mins = parseHHMM(value ?? undefined);
  if (mins == null) return null;
  return { hour: Math.floor(mins / 60), minute: mins % 60 };
}

/**
 * How long after the scheduled time the in-app lock overlay keeps asserting
 * itself if not yet dismissed. Chosen generously (2 hours) since this is a
 * "make it impossible to accidentally sleep through" feature, not a precise
 * timer — the user dismisses it explicitly via NFC scan or emergency escape.
 */
export const ALARM_ACTIVE_WINDOW_MINUTES = 120;

/**
 * `todayKey` and `dismissedForDateKey` should both be plain "YYYY-MM-DD"
 * strings in local time — the caller owns deriving those from `now` /
 * persisted state so this function stays a pure comparison.
 */
export function isAlarmActiveNow(
  settings: AlarmSettingsSlice,
  now: Date,
  todayKey: string,
  dismissedForDateKey: string | null,
): boolean {
  if (!settings.alarmEnabled) return false;
  if (dismissedForDateKey === todayKey) return false;

  const days = settings.alarmDaysOfWeek ?? [1, 2, 3, 4, 5];
  if (!days.includes(now.getDay())) return false;

  const time = parseAlarmTime(settings.alarmTime);
  if (!time) return false;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const alarmMinutes = time.hour * 60 + time.minute;
  return nowMinutes >= alarmMinutes && nowMinutes < alarmMinutes + ALARM_ACTIVE_WINDOW_MINUTES;
}

/** "YYYY-MM-DD" in local time, used as the dismissal-tracking key. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
