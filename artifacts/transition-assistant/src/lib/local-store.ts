/**
 * local-store.ts — durable on-device key/value storage.
 *
 * Uses plain `window.localStorage`. This is intentional, not a shortcut:
 * Capacitor's Android WebView backs localStorage with on-disk storage
 * (separate from the HTTP cache that MainActivity.clearCache() clears),
 * so it survives app close, Android process death, and phone restart —
 * exactly what Phase 1 requires — with zero new native plugins, zero
 * `npx cap sync`, and it already works identically in the Replit web
 * preview. Adding @capacitor/preferences or a SQLite plugin would add
 * native build risk for no reliability benefit at this data volume
 * (a handful of sessions + a short event queue).
 *
 * If this ever needs to survive an app UNINSTALL (it doesn't need to —
 * that's a deliberate user action, not a failure mode Phase 1 targets),
 * that's when a native plugin would earn its keep.
 */

const PREFIX = "ta_v1_"; // namespaced + versioned so a future shape change can migrate cleanly

function isAvailable(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function getJSON<T>(key: string, fallback: T): T {
  if (!isAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[local-store] Failed to read "${key}":`, err);
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): boolean {
  if (!isAvailable()) return false;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Most likely quota exceeded — should never happen at this data volume,
    // but never let a storage write crash the NFC flow.
    console.error(`[local-store] Failed to write "${key}":`, err);
    return false;
  }
}

export function remove(key: string): void {
  if (!isAvailable()) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch (err) {
    console.error(`[local-store] Failed to remove "${key}":`, err);
  }
}

export function isHealthy(): boolean {
  if (!isAvailable()) return false;
  try {
    const testKey = PREFIX + "__health_check__";
    window.localStorage.setItem(testKey, "1");
    const ok = window.localStorage.getItem(testKey) === "1";
    window.localStorage.removeItem(testKey);
    return ok;
  } catch {
    return false;
  }
}

/** Stable per-install device id, generated once and persisted. */
export function getDeviceId(): string {
  const existing = getJSON<string | null>("device_id", null);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setJSON("device_id", id);
  return id;
}
