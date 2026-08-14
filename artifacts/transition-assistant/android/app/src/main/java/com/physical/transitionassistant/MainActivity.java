package com.physical.transitionassistant;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom local plugin — must be registered before super.onCreate().
        registerPlugin(AlarmBridgePlugin.class);
        super.onCreate(savedInstanceState);

        // Enable edge-to-edge
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        showOverLockScreenIfAlarmRinging(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Explicitly notify the bridge of new intents (important for some NFC behaviors)
        this.getBridge().onNewIntent(intent);
        showOverLockScreenIfAlarmRinging(intent);
    }

    /**
     * Persistent Morning Alarm — when brought to the front by
     * AlarmRingService's full-screen-intent notification, wake the screen
     * and show over the lock screen (same behavior as the built-in Clock
     * app's alarm). The existing JS-side isAlarmActiveNow() polling (see
     * home.tsx) takes it from here and renders AlarmLockOverlay — this
     * method only handles getting the screen itself visible.
     */
    private void showOverLockScreenIfAlarmRinging(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("alarm_ringing", false)) return;

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = this.getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            webView.clearCache(true);
        }
    }
}
