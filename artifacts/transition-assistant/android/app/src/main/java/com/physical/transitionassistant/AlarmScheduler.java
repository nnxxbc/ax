package com.physical.transitionassistant;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Persistent Morning Alarm — shared scheduling logic used by both the
 * Capacitor plugin (JS-triggered) and BootReceiver (device-reboot
 * re-arming). Persists the alarm config to SharedPreferences so it's
 * available even before the JS layer / Capacitor bridge has started.
 *
 * One AlarmManager.setExactAndAllowWhileIdle() per enabled weekday
 * (request code 1000 + day, day = 0..6, Sunday=0 to match this app's own
 * convention everywhere else). Exact alarms don't repeat on their own, so
 * AlarmReceiver re-arms the same weekday's alarm for +7 days every time it
 * fires — this is the standard Android pattern for a recurring exact alarm.
 */
public class AlarmScheduler {
    private static final String TAG = "AlarmScheduler";
    private static final String PREFS = "alarm_prefs";
    private static final String KEY_ENABLED = "alarm_enabled";
    private static final String KEY_DAYS = "alarm_days"; // comma-separated 0..6
    private static final String KEY_HOUR = "alarm_hour";
    private static final String KEY_MINUTE = "alarm_minute";
    private static final String KEY_REQUIRES_NFC = "alarm_requires_nfc";
    private static final String KEY_SOUND_ENABLED = "alarm_sound_enabled";
    private static final String KEY_VIBRATION_ENABLED = "alarm_vibration_enabled";
    private static final int REQUEST_CODE_BASE = 1000;

    public static class Config {
        public boolean enabled;
        public List<Integer> days = new ArrayList<>();
        public int hour;
        public int minute;
        public boolean requiresNfc;
        public boolean soundEnabled = true;
        public boolean vibrationEnabled = true;
    }

    public static void saveConfig(
        Context ctx, boolean enabled, List<Integer> days, int hour, int minute,
        boolean requiresNfc, boolean soundEnabled, boolean vibrationEnabled
    ) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        e.putBoolean(KEY_ENABLED, enabled);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < days.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append(days.get(i));
        }
        e.putString(KEY_DAYS, sb.toString());
        e.putInt(KEY_HOUR, hour);
        e.putInt(KEY_MINUTE, minute);
        e.putBoolean(KEY_REQUIRES_NFC, requiresNfc);
        e.putBoolean(KEY_SOUND_ENABLED, soundEnabled);
        e.putBoolean(KEY_VIBRATION_ENABLED, vibrationEnabled);
        e.apply();
    }

    public static Config loadConfig(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        Config c = new Config();
        c.enabled = p.getBoolean(KEY_ENABLED, false);
        c.hour = p.getInt(KEY_HOUR, 7);
        c.minute = p.getInt(KEY_MINUTE, 0);
        c.requiresNfc = p.getBoolean(KEY_REQUIRES_NFC, true);
        c.soundEnabled = p.getBoolean(KEY_SOUND_ENABLED, true);
        c.vibrationEnabled = p.getBoolean(KEY_VIBRATION_ENABLED, true);
        String daysStr = p.getString(KEY_DAYS, "");
        if (daysStr != null && !daysStr.isEmpty()) {
            for (String s : daysStr.split(",")) {
                try {
                    c.days.add(Integer.parseInt(s.trim()));
                } catch (NumberFormatException ignored) {}
            }
        }
        return c;
    }

    /** Cancels every scheduled weekday alarm (request codes 1000..1006). */
    public static void cancelAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int day = 0; day < 7; day++) {
            PendingIntent pi = alarmPendingIntent(ctx, day);
            am.cancel(pi);
        }
    }

    /** Re-arms alarms for every enabled day from the currently persisted config. */
    public static void scheduleFromSavedConfig(Context ctx) {
        Config c = loadConfig(ctx);
        cancelAll(ctx);
        if (!c.enabled || c.days.isEmpty()) {
            Log.i(TAG, "Alarm disabled or no days configured — nothing scheduled.");
            return;
        }
        for (int day : c.days) {
            scheduleNextOccurrence(ctx, day, c.hour, c.minute);
        }
    }

    /** Re-arms just one weekday's alarm for 7 days from now — called by AlarmReceiver after firing. */
    public static void rescheduleForNextWeek(Context ctx, int day, int hour, int minute) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, 7);
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        setExact(am, ctx, day, cal.getTimeInMillis());
    }

    private static void scheduleNextOccurrence(Context ctx, int day, int hour, int minute) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long triggerAt = nextOccurrenceMillis(day, hour, minute);
        setExact(am, ctx, day, triggerAt);
    }

    private static void setExact(AlarmManager am, Context ctx, int day, long triggerAtMillis) {
        PendingIntent pi = alarmPendingIntent(ctx, day);
        try {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
            Log.i(TAG, "Scheduled alarm for day=" + day + " at " + triggerAtMillis);
        } catch (SecurityException se) {
            // Missing exact-alarm permission on this OS version/device — fall back to inexact,
            // still far better than nothing.
            Log.w(TAG, "Exact alarm not permitted, falling back to inexact for day=" + day, se);
            am.set(AlarmManager.RTC_WAKEUP, triggerAtMillis, pi);
        }
    }

    private static PendingIntent alarmPendingIntent(Context ctx, int day) {
        Intent intent = new Intent(ctx, AlarmReceiver.class);
        intent.putExtra("day", day);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE_BASE + day, intent, flags);
    }

    /** Calendar.DAY_OF_WEEK is Sunday=1..Saturday=7; this app's convention is Sunday=0..Saturday=6. */
    private static long nextOccurrenceMillis(int appDay, int hour, int minute) {
        int calendarDay = appDay + 1; // 0..6 -> 1..7
        Calendar cal = Calendar.getInstance();
        Calendar now = (Calendar) cal.clone();
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        int currentCalendarDay = cal.get(Calendar.DAY_OF_WEEK);
        int daysUntil = calendarDay - currentCalendarDay;
        if (daysUntil < 0) daysUntil += 7;
        if (daysUntil == 0 && cal.getTimeInMillis() <= now.getTimeInMillis()) {
            daysUntil = 7; // today's time already passed — next week
        }
        cal.add(Calendar.DAY_OF_YEAR, daysUntil);
        return cal.getTimeInMillis();
    }
}
