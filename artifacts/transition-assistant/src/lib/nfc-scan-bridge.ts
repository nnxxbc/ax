import { getJSON, setJSON } from "./local-store";

/**
 * nfc-scan-bridge.ts — routes NFC scans to Home's full-featured handler
 * regardless of which screen is currently showing.
 *
 * The NFC reader itself is started exactly once, app-wide, in
 * app-layout.tsx (which never unmounts while the app is open) — NOT inside
 * Home. That fixes a real bug: previously the reader was only ever started
 * from inside Home's own effect, so scanning a tag while on any other
 * screen (Settings, Stations, ...) meant nothing in the app was listening
 * at all — Android would fall back to its own tag-dispatch and show "No
 * supported application for this NFC Tag", even though the tag was
 * perfectly valid.
 *
 * Home still owns the actual scan *processing* (handleScanResult) — all of
 * its rich, page-specific reactions (Bed Station dialog, alarm dismissal,
 * Frozen Protocol stage tracking, early-complete warnings) stay exactly as
 * they were. It just registers itself here while mounted instead of
 * calling nfcService.startScanning() directly, so there's only ever one
 * real reader session, with no ownership race between Home and the layout.
 */

type ScanHandler = (uid: string) => void;
let activeHomeHandler: ScanHandler | null = null;

/** Home calls this on mount/unmount so a scan reaches it directly, with no extra hop, whenever it's the visible screen. */
export function registerHomeScanHandler(handler: ScanHandler | null) {
  activeHomeHandler = handler;
}

const PENDING_KEY = "pending_nfc_scan";

/** The single app-wide NFC listener (app-layout.tsx) calls this for every scan. */
export function dispatchScan(uid: string) {
  if (activeHomeHandler) {
    activeHomeHandler(uid);
    return;
  }
  // Home isn't mounted right now (user is on some other screen) — stash
  // the scan and navigate to Home, which will pick it up on mount and
  // process it for real through the exact same handleScanResult path.
  setJSON(PENDING_KEY, uid);
  window.location.href = "/";
}

/** Home calls this once on mount to pick up a scan that arrived while it wasn't the visible screen. */
export function takePendingScan(): string | null {
  const uid = getJSON<string | null>(PENDING_KEY, null);
  if (uid) setJSON(PENDING_KEY, null);
  return uid;
}
