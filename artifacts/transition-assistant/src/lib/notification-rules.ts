/**
 * notification-rules.ts — pure logic for Phase 3's Unified Notification
 * System (Feature 2) and Quiet Hours (Feature 3). No I/O, no Capacitor
 * imports, so it can run under plain `node --experimental-strip-types`
 * the same way nfc-state-machine.ts does.
 */

export type NotificationCategory =
  | "timer"
  | "transitionReminder"
  | "missedCheckpoint"
  | "checkIn"
  | "alarm";

export interface NotificationSettingsSlice {
  notifyTimerEnabled?: boolean;
  notifyTransitionRemindersEnabled?: boolean;
  notifyMissedCheckpointEnabled?: boolean;
  notifyCheckInsEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string; // "HH:MM"
  quietHoursEnd?: string; // "HH:MM"
  notificationsEnabled?: boolean; // legacy master switch, Phase 1/pre-Phase-3
}

/** Parses "HH:MM" into minutes since midnight. Returns null if malformed. */
export function parseHHMM(value: string | undefined | null): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Quiet hours support overnight windows (e.g. 23:00 -> 08:00) where
 * start > end wraps past midnight, as well as same-day windows.
 * `nowMinutes` and the bounds are all minutes-since-midnight, [0, 1440).
 */
export function isWithinQuietHours(
  nowMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean {
  if (startMinutes === endMinutes) return false; // zero-width window = never quiet
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Overnight wrap, e.g. 23:00 -> 08:00
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * The category master switch, e.g. notifyTimerEnabled.
 */
function categoryEnabled(category: NotificationCategory, settings: NotificationSettingsSlice): boolean {
  // Legacy top-level toggle from Phase 1/pre-Phase-3 settings still acts as
  // a global kill switch layered under the per-category ones.
  if (settings.notificationsEnabled === false) return false;
  switch (category) {
    case "timer":
      return settings.notifyTimerEnabled !== false;
    case "transitionReminder":
      return settings.notifyTransitionRemindersEnabled !== false;
    case "missedCheckpoint":
      return settings.notifyMissedCheckpointEnabled !== false;
    case "checkIn":
      return settings.notifyCheckInsEnabled === true; // opt-in, default off
    case "alarm":
      return true; // alarms are never silenced by the category system
  }
}

/**
 * Decides whether a notification in `category` should actually fire right
 * now, given quiet hours. The morning alarm always bypasses quiet hours by
 * design (it IS the wake-up mechanism); every other category is suppressed
 * during the configured window.
 */
export function shouldNotify(
  category: NotificationCategory,
  settings: NotificationSettingsSlice,
  now: Date = new Date(),
): boolean {
  if (!categoryEnabled(category, settings)) return false;
  if (category === "alarm") return true;
  if (!settings.quietHoursEnabled) return true;

  const start = parseHHMM(settings.quietHoursStart);
  const end = parseHHMM(settings.quietHoursEnd);
  if (start == null || end == null) return true; // malformed config -> fail open, don't silently eat notifications

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return !isWithinQuietHours(nowMinutes, start, end);
}
