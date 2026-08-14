import { LocalNotifications } from "@capacitor/local-notifications";
import {
  dayOfWeekToCapacitorWeekday,
  parseAlarmTime,
  type AlarmSettingsSlice,
} from "@/lib/alarm-rules";

/**
 * Phase 3, Feature 1 — Persistent Morning Alarm.
 *
 * Important, tested-in-the-sandbox limitation (documented in the final
 * report): this schedules real OS-level repeating local notifications via
 * @capacitor/local-notifications' `schedule.on` weekday/hour/minute trigger
 * (Android's AlarmManager under the hood), which DOES survive reboots and
 * fires reliably without the app running. What it can NOT do without custom
 * native Android code (which this environment cannot build or test) is:
 *   - draw a full-screen Activity over the lock screen the way a real Clock
 *     app alarm does
 *   - force full volume / bypass silent mode
 *   - keep re-alerting if swiped away
 *
 * The mitigation, matching the decision from the Phase 3 audit: pair a
 * high-priority, ongoing (non-swipeable-on-Android when `ongoing: true`)
 * ID range 100-106, one per weekday, so each weekday's schedule can be
 * updated independently without disturbing the others.
 */

const ALARM_CHANNEL_ID = "transition_assistant_alarm";
const ALARM_ID_BASE = 100;

function alarmIdForDay(day: number): number {
  return ALARM_ID_BASE + (((day % 7) + 7) % 7);
}

class AlarmService {
  async requestPermissions() {
    const perm = await LocalNotifications.requestPermissions();
    return perm.display === "granted";
  }

  private async ensureChannel(settings: AlarmSettingsSlice & { alarmSoundEnabled?: boolean; alarmVibrationEnabled?: boolean }) {
    try {
      await LocalNotifications.createChannel({
        id: ALARM_CHANNEL_ID,
        name: "Morning Alarm",
        description: "Persistent morning wake-up alarm",
        importance: 5, // MAX — heads-up + bypasses most Do Not Disturb configs
        sound: settings.alarmSoundEnabled === false ? undefined : "default",
        vibration: settings.alarmVibrationEnabled !== false,
        visibility: 1,
      });
    } catch (err) {
      // Android-only API; safe no-op on other platforms.
      console.log("[AlarmService] createChannel skipped:", err);
    }
  }

  async cancelAll() {
    const ids = Array.from({ length: 7 }, (_, i) => ({ id: ALARM_ID_BASE + i }));
    await LocalNotifications.cancel({ notifications: ids });
  }

  /**
   * Rebuilds the full week of alarm notifications from scratch. Cheap and
   * idempotent — call any time alarm-related settings change.
   */
  async reschedule(
    settings: AlarmSettingsSlice & {
      alarmSoundEnabled?: boolean;
      alarmVibrationEnabled?: boolean;
    },
  ) {
    await this.cancelAll();
    if (!settings.alarmEnabled) return;

    const time = parseAlarmTime(settings.alarmTime);
    if (!time) {
      console.warn("[AlarmService] alarmEnabled but alarmTime is missing/invalid — not scheduling.");
      return;
    }

    const days = settings.alarmDaysOfWeek && settings.alarmDaysOfWeek.length > 0 ? settings.alarmDaysOfWeek : [1, 2, 3, 4, 5];
    await this.ensureChannel(settings);

    const notifications = days.map((day) => ({
      id: alarmIdForDay(day),
      title: "Wake up",
      body: settings.alarmRequiresNfcDismissal
        ? "Scan your morning tag to dismiss."
        : "Time to start your morning routine.",
      schedule: {
        on: { weekday: dayOfWeekToCapacitorWeekday(day), hour: time.hour, minute: time.minute },
        allowWhileIdle: true,
      },
      channelId: ALARM_CHANNEL_ID,
      ongoing: !!settings.alarmRequiresNfcDismissal,
      autoCancel: !settings.alarmRequiresNfcDismissal,
      extra: {
        kind: "morning_alarm",
        requiresNfc: !!settings.alarmRequiresNfcDismissal,
        targetCheckpointId: settings.alarmTargetCheckpointId ?? null,
      },
    }));

    await LocalNotifications.schedule({ notifications });
  }
}

export const alarmService = new AlarmService();
