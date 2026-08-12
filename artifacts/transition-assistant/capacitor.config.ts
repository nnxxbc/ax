import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for Physical Transition Assistant.
 *
 * Build flow:
 *   1.  BASE_PATH=/ pnpm --filter @workspace/transition-assistant run build
 *   2.  npx cap sync android          (copies dist/public → android/app/src/main/assets/public)
 *   3.  npx cap open android          (opens Android Studio)
 *   4.  Build / run on device in Android Studio, OR:
 *       npx cap run android --target <DEVICE_ID>
 *
 * Environment:
 *   For development with a running API server on the same network, set
 *   VITE_API_BASE_URL=http://<SERVER_IP>:8080 before building, then point
 *   the Capacitor server.url at that host during hot-reload.
 *   Remove server.url before building the production APK.
 */
const config: CapacitorConfig = {
  appId: "com.physical.transitionassistant",
  appName: "Transition Assistant",
  webDir: "dist/public",
  server: {
    androidScheme: "http",
  },

  // ── Android-specific settings ─────────────────────────────────────────────
  android: {
    // Allow cleartext HTTP to the local dev server (remove for prod)
    allowMixedContent: true,
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  plugins: {
    // @capawesome-team/capacitor-nfc — no per-plugin config required;
    // permissions are declared in AndroidManifest.xml (see docs below).
  },

  /*
   * ── Android permissions required (add to android/app/src/main/AndroidManifest.xml) ──
   *
   *  <uses-permission android:name="android.permission.NFC" />
   *  <uses-feature android:name="android.hardware.nfc" android:required="false" />
   *
   * The plugin handles foreground NFC reader mode internally.
   * NDEF writing is NOT needed — the app reads UIDs only.
   *
   * ── Build the Android APK ────────────────────────────────────────────────
   *
   *  # 1. Build the web assets (from the monorepo root)
   *  BASE_PATH=/ pnpm --filter @workspace/transition-assistant run build
   *
   *  # 2. Sync to Android
   *  cd artifacts/transition-assistant
   *  npx cap sync android
   *
   *  # 3. Open in Android Studio
   *  npx cap open android
   *
   *  # 4. Or run directly on a connected device
   *  npx cap run android
   *
   * ── Install on OPPO Reno9 A ─────────────────────────────────────────────
   *
   *  adb install android/app/build/outputs/apk/debug/app-debug.apk
   *
   *  Or in Android Studio: Run → Run 'app' with device selected.
   *
   * ── Note on offline / API server ────────────────────────────────────────
   *
   *  The current architecture uses a PostgreSQL + Express API server for ALL
   *  state. The Capacitor APK needs network access to reach that server.
   *  For true offline-first, the state machine would need to be moved into
   *  the app (e.g. SQLite via @capacitor-community/sqlite). That is a
   *  future architectural change — see replit.md for details.
   */
};

export default config;
