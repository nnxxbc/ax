# Building the Android APK

## Prerequisites

- Node.js 18+ / pnpm installed
- Android Studio installed (includes Android SDK and build tools)
- Java JDK 17+
- `adb` available in PATH (for device install)
- An Android phone with NFC (tested: OPPO Reno9 A)
- USB debugging enabled on the device

---

## Step 1 — Build the web assets

The app must be built with `BASE_PATH=/` when targeting Capacitor (not the Replit dev prefix).

From the **monorepo root**:

```bash
BASE_PATH=/ pnpm --filter @workspace/transition-assistant run build
```

This outputs to `artifacts/transition-assistant/dist/public/`.

---

## Step 2 — Point the app at the API server

The Capacitor APK needs to reach the Express API server. Set `VITE_API_BASE_URL` before building:

```bash
VITE_API_BASE_URL=http://YOUR_SERVER_IP:8080 \
BASE_PATH=/ \
pnpm --filter @workspace/transition-assistant run build
```

> **Note:** The current architecture requires a running API server (PostgreSQL + Express).
> For true offline-first, the state machine would need to be moved into the app using
> something like @capacitor-community/sqlite. That is a future architectural change.

---

## Step 3 — Create the Android project (first time only)

```bash
cd artifacts/transition-assistant
npx cap add android
```

This creates the `android/` directory.

---

## Step 4 — Add Android permissions

Edit `artifacts/transition-assistant/android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Inside <manifest> -->
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

The `android:required="false"` means the app will still install on non-NFC devices —
NFC features gracefully fall back to simulation mode.

---

## Step 5 — Sync web assets to Android

```bash
cd artifacts/transition-assistant
npx cap sync android
```

This copies `dist/public/` into `android/app/src/main/assets/public`.

---

## Step 6 — Open in Android Studio

```bash
npx cap open android
```

In Android Studio:
- Select your OPPO Reno9 A as the target device (enable USB debugging first)
- Click **Run → Run 'app'** or press `Shift+F10`

---

## Step 7 — Install on OPPO Reno9 A

**Via Android Studio:** select the device from the dropdown and click Run.

**Via adb:**
```bash
# Debug APK (after building in Android Studio):
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or install + launch immediately:
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.physical.transitionassistant/.MainActivity
```

---

## How NFC works in the app

### Architecture

```
Physical NFC tag (NTAG213)
  ↓
Android NFC reader mode (via @capgo/capacitor-nfc plugin)
  ↓
Capacitor WebView bridge
  ↓
NFCService abstraction (src/services/nfc-service.ts)
  ↓
React home page NFC listener (useHomeNfc hook)
  ↓
POST /api/nfc/scan { tagUid }
  ↓
Server: look up UID → checkpointId
  ↓
processNfcScan() → state machine (WAITING → IN_PROGRESS → COMPLETED)
```

### NFC bridge details

- Plugin: `@capgo/capacitor-nfc` v8 (Capacitor v8)
- Event: `nfcEvent` — fires for every tag detection
- Tag UID: `event.tag.id` — `number[]` byte array, normalized to `"04:8A:23:91:XX:XX:XX"`
- Session type: NDEF (default) — reads UID even from blank NTAG213 tags
- Session stays open (`invalidateAfterFirstRead: false`) so the same tag can be used for both start and complete scans
- Client-side debounce: 1 500 ms per UID
- Server-side debounce: 2 000 ms per checkpointId

### Scanning states

- **WAITING session**: NFC listener is active, expects any registered tag
- **IN_PROGRESS session**: NFC listener is active, same tag completes the session
- **Wrong tag scanned**: shows "Wrong station." toast, no API call
- **Unknown tag**: calls API → returns `unknown_tag` action → shows toast

### Simulation mode

The NFC Simulator page (tap a station card) uses `POST /api/nfc/simulate` which goes through the same `processNfcScan()` server function. It produces identical state transitions to a physical NFC scan.

---

## Android lifecycle notes

- NFC reader mode is active only while the app is in the foreground (Android limitation)
- App state is preserved through Capacitor's WebView lifecycle
- Timer `elapsed` is always calculated from `startedAt` timestamp (not a JS interval),
  so it restores correctly after the app resumes from background

---

## Android permissions summary

```xml
<!-- Required -->
<uses-permission android:name="android.permission.NFC" />

<!-- Declare as not-required so non-NFC devices can still install -->
<uses-feature android:name="android.hardware.nfc" android:required="false" />

<!-- Allow HTTP to local dev server (remove for prod) -->
<!-- Configured via android:allowMixedContent in capacitor.config.ts -->
```

---

## What still needs native Android work (future)

1. **Offline-first state**: The current architecture requires a PostgreSQL + Express server.
   Moving state into the APK requires `@capacitor-community/sqlite` and a client-side
   state machine. This is a significant architectural change.

2. **Background NFC**: Android does not allow NFC in background apps. The current
   implementation correctly handles this (NFC stops when the app is backgrounded).

3. **Alarm / notifications**: The `scheduleNotification` and `triggerAlarm` stubs in
   the API server are designed to be replaced with `@capacitor/local-notifications`.

4. **Push notifications**: Not implemented — would require `@capacitor/push-notifications`.

5. **iOS NFC**: The `@capgo/capacitor-nfc` plugin supports iOS, but requires an Apple
   Developer account and the NFC entitlement. UIDs from iOS require `iosSessionType: 'tag'`.
