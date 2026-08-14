package com.physical.transitionassistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Fires when AlarmManager's exact alarm goes off for a given weekday.
 * Starts the foreground ringing service (sound + wake screen + full-screen
 * notification) and immediately re-arms the same weekday for next week,
 * since Android's exact alarms are one-shot.
 */
public class AlarmReceiver extends BroadcastReceiver {
    private static final String TAG = "AlarmReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        int day = intent.getIntExtra("day", -1);
        Log.i(TAG, "Alarm fired for day=" + day);

        AlarmScheduler.Config cfg = AlarmScheduler.loadConfig(context);

        Intent serviceIntent = new Intent(context, AlarmRingService.class);
        serviceIntent.putExtra("day", day);
        serviceIntent.putExtra("sound_enabled", cfg.soundEnabled);
        serviceIntent.putExtra("vibration_enabled", cfg.vibrationEnabled);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }

        if (day >= 0) {
            AlarmScheduler.rescheduleForNextWeek(context, day, cfg.hour, cfg.minute);
        }
    }
}
