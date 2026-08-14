package com.physical.transitionassistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Re-arms the persistent morning alarm after a device reboot (or app
 * update) — AlarmManager's exact alarms are cleared by the OS on both
 * events, and without this the alarm would silently stop firing until the
 * user happened to reopen the app.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.i(TAG, "Boot/update detected — re-arming alarm from saved config.");
        AlarmScheduler.scheduleFromSavedConfig(context);
    }
}
