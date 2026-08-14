package com.physical.transitionassistant;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * JS-facing bridge for the Persistent Morning Alarm's native half. See
 * src/lib/alarm-bridge.ts for the TypeScript side and
 * src/services/alarm-service.ts for how home.tsx/settings-alarm.tsx use it.
 *
 * schedule/cancel drive AlarmManager (survives app close + reboot, via
 * AlarmScheduler + BootReceiver). stopRinging is called once the existing
 * NFC-scan-matches-target-checkpoint logic in home.tsx succeeds — that is
 * the ONLY way the native ringing stops, matching "it needs to stop just
 * when I touch the tag nfc". testRing lets the alarm be verified on-device
 * immediately instead of waiting for a real morning.
 */
@CapacitorPlugin(name = "AlarmBridge")
public class AlarmBridgePlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        int hour = call.getInt("hour", 7);
        int minute = call.getInt("minute", 0);
        boolean requiresNfc = call.getBoolean("requiresNfc", true);
        boolean soundEnabled = call.getBoolean("soundEnabled", true);
        boolean vibrationEnabled = call.getBoolean("vibrationEnabled", true);

        List<Integer> days = new ArrayList<>();
        JSArray daysArray = call.getArray("days");
        if (daysArray != null) {
            try {
                for (Object o : daysArray.toList()) {
                    days.add(((Number) o).intValue());
                }
            } catch (JSONException e) {
                call.reject("Invalid 'days' array", e);
                return;
            }
        }

        Context ctx = getContext();
        AlarmScheduler.saveConfig(ctx, enabled, days, hour, minute, requiresNfc, soundEnabled, vibrationEnabled);
        AlarmScheduler.scheduleFromSavedConfig(ctx);
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Context ctx = getContext();
        AlarmScheduler.cancelAll(ctx);
        AlarmScheduler.saveConfig(ctx, false, new ArrayList<>(), 7, 0, true, true, true);
        call.resolve();
    }

    @PluginMethod
    public void stopRinging(PluginCall call) {
        Context ctx = getContext();
        ctx.stopService(new Intent(ctx, AlarmRingService.class));
        call.resolve();
    }

    @PluginMethod
    public void testRing(PluginCall call) {
        Context ctx = getContext();
        Intent intent = new Intent(ctx, AlarmRingService.class);
        intent.putExtra("day", -1);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
        call.resolve();
    }
}
