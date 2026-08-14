import { LocalNotifications } from "@capacitor/local-notifications";
import { parseAlarmTime, type AlarmSettingsSlice } from "@/lib/alarm-rules";
import AlarmBridge from "@/lib/alarm-bridge";

/**
 * Phase 3, Feature 1 — Persistent Morning Alarm.
 *
 * Real native alarm, via the AlarmBridge Capacitor plugin (see
 * android/.../AlarmBridgePlugin.java + AlarmScheduler/AlarmRingService).
 * This replaced an earlier @capacitor/local-notifications-only version
 * that could schedule real OS notifications but had no way to: play sound
 * that bypasses silent/Do Not Disturb, wake the screen, show over the lock
 * screen, or guarantee it only stops via the app's own NFC-match logic —
 * @capacitor/local-notifications has no API surface for any of that, it's
 * a plain notification-scheduling plugin. AlarmBridge uses
 * AlarmManager.setExactAndAllowWhileIdle() + a foreground service playing
 * the phone's own alarm sound on the USAGE_ALARM audio stream + a
 * full-screen-intent notification — the same mechanism the built-in Clock
 * app's alarms use.
 *
 * LocalNotifications is still used here for exactly one thing: triggering
 * Android 13+'s POST_NOTIFICATIONS permission prompt, since without it no
 * notification (native or Capacitor) can be shown at all. It no longer
 * schedules the alarm itself.
 */
class AlarmService {
  async requestPermissions() {
    try {
      const perm = await LocalNotifications.requestPermissions();
      return perm.display === "granted";
    } catch (err) {
      console.log("[AlarmService] requestPermissions skipped:", err);
      return false;
    }
  }

  /**
   * Rebuilds the native alarm schedule from scratch. Cheap and idempotent —
   * call any time alarm-related settings change. Wrapped in try/catch since
   * AlarmBridge is Android-only; other platforms simply won't have it.
   */
  async reschedule(settings: AlarmSettingsSlice) {
    try {
      if (!settings.alarmEnabled) {
        await AlarmBridge.cancel();
        return;
      }

      const time = parseAlarmTime(settings.alarmTime);
      if (!time) {
        console.warn("[AlarmService] alarmEnabled but alarmTime is missing/invalid — not scheduling.");
        await AlarmBridge.cancel();
        return;
      }

      const days = settings.alarmDaysOfWeek && settings.alarmDaysOfWeek.length > 0 ? settings.alarmDaysOfWeek : [1, 2, 3, 4, 5];

      await AlarmBridge.schedule({
        enabled: true,
        days,
        hour: time.hour,
        minute: time.minute,
        requiresNfc: !!settings.alarmRequiresNfcDismissal,
        soundEnabled: settings.alarmSoundEnabled !== false,
        vibrationEnabled: settings.alarmVibrationEnabled !== false,
      });
    } catch (err) {
      // Android-only plugin; safe no-op on other platforms.
      console.log("[AlarmService] reschedule skipped:", err);
    }
  }

  async cancelAll() {
    try {
      await AlarmBridge.cancel();
    } catch (err) {
      console.log("[AlarmService] cancelAll skipped:", err);
    }
  }

  /** Called once the NFC scan that dismisses the alarm succeeds — the only way native ringing stops. */
  async stopRinging() {
    try {
      await AlarmBridge.stopRinging();
    } catch (err) {
      console.log("[AlarmService] stopRinging skipped:", err);
    }
  }

  /** Rings immediately, for on-device verification without waiting for a real morning. */
  async testRing() {
    await AlarmBridge.testRing();
  }
}

export const alarmService = new AlarmService();
