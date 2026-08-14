import { registerPlugin } from "@capacitor/core";

/**
 * TypeScript side of the native AlarmBridge plugin
 * (android/app/src/main/java/com/physical/transitionassistant/AlarmBridgePlugin.java).
 *
 * This exists because @capacitor/local-notifications can't do what a real
 * "wakes you up even with the phone locked, and only stops when you scan
 * the tag" alarm needs: a full-screen-intent notification, a foreground
 * service looping the alarm sound on the AudioAttributes.USAGE_ALARM
 * stream (bypasses silent/Do Not Disturb, unlike a normal notification
 * sound), and control that only home.tsx's NFC-match logic can stop.
 *
 * On any platform other than Android this plugin is simply absent —
 * callers in alarm-service.ts already guard every call with try/catch so
 * iOS/web builds degrade gracefully to "no native alarm" rather than
 * throwing.
 */
export interface AlarmBridgePlugin {
  /** (Re)schedules the recurring native alarm. Replaces any previous schedule. */
  schedule(options: {
    enabled: boolean;
    /** 0=Sunday..6=Saturday, matching this app's convention everywhere else. */
    days: number[];
    hour: number;
    minute: number;
    requiresNfc: boolean;
    soundEnabled: boolean;
    vibrationEnabled: boolean;
  }): Promise<void>;
  /** Cancels every scheduled occurrence. */
  cancel(): Promise<void>;
  /** Stops the native ringing (sound, vibration, wake lock, notification) right now. */
  stopRinging(): Promise<void>;
  /** Starts ringing immediately, for on-device testing without waiting for a real morning. */
  testRing(): Promise<void>;
}

const AlarmBridge = registerPlugin<AlarmBridgePlugin>("AlarmBridge");

export default AlarmBridge;
