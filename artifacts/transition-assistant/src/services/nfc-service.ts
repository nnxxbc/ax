/**
 * NFCService — clean abstraction over @capgo/capacitor-nfc (Capacitor v8)
 *
 * Architecture:
 *   React UI → NFCService → Capacitor NFC plugin → Android NFC reader mode → physical tag
 *
 * In web / Replit dev mode there is no native plugin. Simulation still works
 * through simulateScan(), which goes through the same onTag callback path.
 *
 * Client-side debounce: 1 500 ms per UID (server also guards with 2 000 ms).
 */

import type { PluginListenerHandle } from "@capacitor/core";

// ─── API shape we need from @capgo/capacitor-nfc ────────────────────────────
// Declared locally so web bundles never hard-require the native module.
interface NfcTag {
  id?: number[]; // byte array — the physical UID
  techTypes?: string[];
  type?: string | null;
}
interface NfcEvent {
  type: "tag" | "ndef" | "ndef-mime" | "ndef-formatable";
  tag: NfcTag;
}
interface StartScanningOptions {
  invalidateAfterFirstRead?: boolean;
  alertMessage?: string;
  androidReaderModeFlags?: number;
}
interface NfcPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  getStatus(): Promise<{ status: string }>;
  startScanning(options?: StartScanningOptions): Promise<void>;
  stopScanning(): Promise<void>;
  showSettings(): Promise<void>;
  addListener(
    event: "nfcEvent",
    handler: (ev: NfcEvent) => void
  ): Promise<PluginListenerHandle>;
}

// ─── NFC availability states ─────────────────────────────────────────────────
export type NfcAvailability =
  | "native_available"   // NFC hardware present AND enabled — ready to scan
  | "native_disabled"    // NFC hardware present but turned off in Android settings
  | "native_unsupported" // device has no NFC hardware
  | "web_simulation";    // running in a web browser — simulation-only mode

// ─── Singleton plugin reference ───────────────────────────────────────────────
let _plugin: NfcPlugin | null | undefined = undefined; // undefined = not yet resolved

async function resolvePlugin(): Promise<{ instance: NfcPlugin | null }> {
  if (_plugin !== undefined) return { instance: _plugin };

  const isNative =
    typeof window !== "undefined" &&
    "Capacitor" in window &&
    (window as any).Capacitor?.isNativePlatform?.() === true;

  if (!isNative) {
    _plugin = null;
    return { instance: null };
  }

  try {
    const mod = await import("@capgo/capacitor-nfc");
    _plugin = (mod as any).CapacitorNfc as NfcPlugin;
    console.debug("[NFCService] Plugin loaded:", _plugin ? "ok" : "null");
  } catch (err) {
    console.warn("[NFCService] Could not load @capgo/capacitor-nfc:", err);
    _plugin = null;
  }
  return { instance: _plugin };
}

// ─── NFCService ───────────────────────────────────────────────────────────────
class NFCService {
  private _listener: PluginListenerHandle | null = null;
  private _scanning = false;
  private _lastScanTime = new Map<string, number>();
  private readonly DEBOUNCE_MS = 1500;

  /** For the diagnostics screen — is a reader session currently open? */
  isScanning(): boolean {
    return this._scanning;
  }

  /** True when running inside the Capacitor Android/iOS shell */
  isNative(): boolean {
    return (
      typeof window !== "undefined" &&
      "Capacitor" in window &&
      (window as any).Capacitor?.isNativePlatform?.() === true
    );
  }

  /** Query NFC hardware and enabled state */
  async getAvailability(): Promise<NfcAvailability> {
    const native = this.isNative();
    console.debug("[NFCService] getAvailability - isNative:", native);

    if (!native) return "web_simulation";

    const { instance: plugin } = await resolvePlugin();
    if (!plugin) {
      console.warn("[NFCService] Native platform but plugin not resolved");
      return "native_unsupported";
    }

    try {
      const { supported } = await plugin.isSupported();
      if (!supported) return "native_unsupported";
      const { status } = await plugin.getStatus();
      return status === "NFC_DISABLED" ? "native_disabled" : "native_available";
    } catch {
      return "native_unsupported";
    }
  }

  /** Open Android NFC system settings */
  async openNfcSettings(): Promise<void> {
    const { instance: plugin } = await resolvePlugin();
    if (plugin) await plugin.showSettings().catch(() => {});
  }

  /**
   * Normalise a byte-array UID to "XX:XX:XX:..." uppercase hex string.
   * e.g. [0x04, 0x8a, 0x23, 0x91] → "04:8A:23:91"
   */
  normalizeUid(bytes: number[]): string {
    return bytes
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(":");
  }

  private isDebounced(uid: string): boolean {
    const now = Date.now();
    const last = this._lastScanTime.get(uid) ?? 0;
    if (now - last < this.DEBOUNCE_MS) {
      console.debug(
        `[NFCService] Debounced: ${uid} (${now - last}ms since last)`
      );
      return true;
    }
    this._lastScanTime.set(uid, now);
    return false;
  }

  /**
   * Start the NFC reader and call onTag with a normalised UID whenever a
   * non-debounced tag is detected.
   * No-op in web/simulation mode — use simulateScan() there.
   */
  async startScanning(onTag: (uid: string) => void): Promise<void> {
    const isNative = this.isNative();
    console.debug("[NFCService] startScanning - isNative:", isNative);

    const { instance: plugin } = await resolvePlugin();
    if (!plugin) {
      console.debug("[NFCService] startScanning: web mode or plugin not resolved");
      return;
    }

    // Clean up any prior session first
    await this._stopSession();

    this._listener = await plugin.addListener("nfcEvent", (event) => {
      console.debug("[NFCService] Received plugin event:", event);
      const tag = event.tag;
      if (!tag?.id || (Array.isArray(tag.id) && tag.id.length === 0)) {
        console.debug("[NFCService] Tag event but no UID — ignoring");
        return;
      }

      const uid = Array.isArray(tag.id) ? this.normalizeUid(tag.id) : tag.id;
      const tech = tag.techTypes?.join(", ") ?? event.type;

      console.debug(
        `[NFCService] Detected — UID: ${uid} | Tech: ${tech} | ${new Date().toISOString()}`
      );

      if (this.isDebounced(uid)) return;

      onTag(uid);
    });

    try {
      // Android flags: NFC_A | NFC_B | NFC_F | NFC_V | NO_PLATFORM_SOUNDS | SKIP_NDEF_CHECK
      // 1 | 2 | 4 | 8 | 256 | 128 = 399
      // This set of flags is the most aggressive for capturing raw UIDs and
      // preventing the Android system from trying its own dispatch.
      await plugin.startScanning({
        invalidateAfterFirstRead: false,
        alertMessage: "Hold near station tag",
        androidReaderModeFlags: 399,
      });
      this._scanning = true;
      console.debug("[NFCService] Scanning started with flags: 399");
    } catch (err) {
      console.error("[NFCService] startScanning failed:", err);
    }
  }

  /** Stop the active scan session and remove all listeners */
  async stopScanning(): Promise<void> {
    await this._stopSession();
  }

  private async _stopSession(): Promise<void> {
    if (this._listener) {
      await this._listener.remove().catch(() => {});
      this._listener = null;
    }

    if (this._scanning) {
      const { instance: plugin } = await resolvePlugin();
      if (plugin) {
        await plugin.stopScanning().catch(() => {});
      }
      this._scanning = false;
      console.debug("[NFCService] Scanning stopped");
    }
  }

  /**
   * Simulate a scan with an explicit UID string.
   * Uses the same debounce/callback path as a real tag — so the simulator
   * exercises the identical state machine as production.
   */
  simulateScan(uid: string, onTag: (uid: string) => void): void {
    if (this.isDebounced(uid)) return;
    console.debug(`[NFCService] Simulated — UID: ${uid}`);
    onTag(uid);
  }

  /**
   * Clear debounce state for a specific UID (or all UIDs).
   * Call after completing a session so the same tag can be used again.
   */
  clearDebounce(uid?: string): void {
    if (uid) {
      this._lastScanTime.delete(uid);
    } else {
      this._lastScanTime.clear();
    }
  }
}

// Singleton exported for use everywhere
export const nfcService = new NFCService();
