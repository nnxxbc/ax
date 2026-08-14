package com.physical.transitionassistant;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Persistent Morning Alarm — the part that actually wakes the user up.
 *
 * Runs as a foreground service so Android won't kill it mid-ring. Plays the
 * phone's own default alarm sound on a loop with AudioAttributes.USAGE_ALARM
 * (the same audio "stream" the built-in Clock app uses — it rings even if
 * the phone is set to silent/vibrate/Do Not Disturb, unlike a normal
 * notification sound). Posts a full-screen-intent notification that brings
 * MainActivity to the front over the lock screen. Stops only when
 * AlarmBridgePlugin.stopRinging() is called from JS after a successful NFC
 * scan (see dismissAlarmForToday() in home.tsx) — there is deliberately no
 * "dismiss" affordance on the notification itself.
 */
public class AlarmRingService extends Service {
    private static final String TAG = "AlarmRingService";
    private static final String CHANNEL_ID = "native_alarm_ring";
    private static final int NOTIFICATION_ID = 9001;

    private MediaPlayer mediaPlayer;
    private PowerManager.WakeLock wakeLock;
    private Vibrator vibrator;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "Ringing started.");
        boolean soundEnabled = intent == null || intent.getBooleanExtra("sound_enabled", true);
        boolean vibrationEnabled = intent == null || intent.getBooleanExtra("vibration_enabled", true);
        startForeground(NOTIFICATION_ID, buildNotification());
        acquireWakeLock();
        if (soundEnabled) startSound();
        if (vibrationEnabled) startVibration();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "Ringing stopped.");
        stopSound();
        stopVibration();
        releaseWakeLock();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIFICATION_ID);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Morning Alarm", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Wakes you up for your morning routine.");
        // Sound is played manually via MediaPlayer (USAGE_ALARM) below, not by the channel —
        // that's what actually bypasses silent mode/Do Not Disturb (a notification channel
        // has no programmatic DND-bypass API; only the user can grant that via system
        // settings). This channel's own sound/vibration are disabled to avoid a second,
        // non-looping, DND-respecting alert firing alongside the real alarm sound.
        channel.setSound(null, null);
        channel.enableVibration(false);
        nm.createNotificationChannel(channel);
    }

    private android.app.Notification buildNotification() {
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.putExtra("alarm_ringing", true);
        fullScreenIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(this, 0, fullScreenIntent, piFlags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("Wake up")
            .setContentText("Scan your morning tag to dismiss.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .build();
    }

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK, "TransitionAssistant:AlarmRingWakeLock");
        wakeLock.acquire(15 * 60 * 1000L); // 15 min safety cap in case stopRinging is never called
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        wakeLock = null;
    }

    private void startSound() {
        try {
            Uri alarmUri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            }
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            mediaPlayer.setDataSource(this, alarmUri);
            mediaPlayer.setLooping(true);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception e) {
            Log.e(TAG, "Failed to start alarm sound", e);
        }
    }

    private void stopSound() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping media player", e);
            }
            mediaPlayer = null;
        }
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 800, 500};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
            vibrator.vibrate(pattern, 0);
        }
    }

    private void stopVibration() {
        if (vibrator != null) {
            vibrator.cancel();
        }
        vibrator = null;
    }
}
