import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Grid, Calendar, Sparkles, Settings } from "lucide-react";
import { useGetSettings, getGetSettingsQueryKey, useGetTodayRoutine, getGetTodayRoutineQueryKey, useListCheckpoints, getListCheckpointsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { EmergencyUnlock } from "./emergency-unlock";
import { QuickCaptureFab } from "@/components/thought-capture/quick-capture-fab";
import { effectiveEnforcementLevel } from "@/lib/enforcement";
import { nfcService } from "@/services/nfc-service";
import { dispatchScan } from "@/lib/nfc-scan-bridge";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  console.log(`[AppLayout] Rendering. Location: ${location}`);
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: routine } = useGetTodayRoutine({
    query: { queryKey: getGetTodayRoutineQueryKey(), refetchInterval: 5000 },
  });
  const { data: checkpointsList } = useListCheckpoints({ query: { queryKey: getListCheckpointsQueryKey() } });

  const inProgressSession = routine?.sessions?.find((s: any) => s.status === "in_progress");
  const inProgress = !!inProgressSession;

  // Phase 3, Feature 5 — a per-checkpoint enforcement override (set on the
  // Stations edit screen) takes precedence over the global settings level
  // while that specific checkpoint is the one in progress.
  const activeCheckpoint = (Array.isArray(checkpointsList) ? checkpointsList : []).find(
    (c: any) => c.id === inProgressSession?.checkpointId,
  );
  const effectiveLevel = effectiveEnforcementLevel(settings?.enforcementLevel, activeCheckpoint?.enforcementOverride);
  const isStrict = effectiveLevel === "strict";
  const isFocused = effectiveLevel === "focused";

  // Phase 1 requirement #9 — strict mode must never trap the user because
  // of an app bug. A 5s hold on the always-present EmergencyUnlock control
  // clears this for as long as the current session stays active; it
  // re-engages automatically once a new checkpoint starts, so it can't
  // quietly disable strict mode forever by accident.
  const [emergencyUnlocked, setEmergencyUnlocked] = useState(false);
  useEffect(() => {
    if (!inProgress) setEmergencyUnlocked(false);
  }, [inProgress]);

  const showNav = !isFocused || !inProgress;
  const navDisabled = isStrict && inProgress && !emergencyUnlocked;

  // The NFC reader is owned here, app-wide, because AppLayout never
  // unmounts while the app is open — unlike a per-page effect (the old
  // approach), this means scanning a tag works from any screen, not just
  // Home. Without this, a scan made while on Settings/Stations/etc. hit no
  // listener at all and Android fell back to showing its own "No supported
  // application for this NFC Tag" toast, even for a perfectly valid,
  // already-registered station tag. See nfc-scan-bridge.ts — Home
  // registers itself as the live handler while it's the visible screen and
  // still owns all the actual scan-reaction UI (Bed Station dialog, alarm
  // dismissal, etc); this effect only ever starts/stops the physical
  // reader itself.
  //
  // Re-asserted on every route change (except while the NFC Tags screen
  // itself is open) rather than once on mount: nfc-tags.tsx registers a
  // *new* tag by calling nfcService.startScanning() directly with its own
  // one-shot callback — it has to, registration needs a different
  // response to a scan than the normal app flow — but that call silently
  // takes over the single shared reader session and, on close, only stops
  // it, never hands it back. Left as a one-time effect, that permanently
  // orphaned the app-wide listener the moment anyone ever opened NFC Tags:
  // every scan after that got no listener at all and fell through to
  // Android's own "No supported application for this NFC Tag" toast, even
  // for a tag that was perfectly valid and already registered. Re-running
  // this on every navigation away from that screen means the reader always
  // gets handed back, instead of staying lost for the rest of the session.
  useEffect(() => {
    if (!nfcService.isNative()) return;
    if (location === "/nfc-tags") return;
    nfcService.startScanning(dispatchScan);
    return () => {
      nfcService.stopScanning();
    };
  }, [location]);

  // Keep the screen on for the whole time a checkpoint is in progress —
  // Karen reported the phone sleeping mid-task. Dynamically imported so a
  // web build never pulls in native-only code, same pattern as nfc-service.
  // Only acquired/released on inProgress transitions, not every render, so
  // it can't fight with itself or leak a wake lock past the checkpoint.
  useEffect(() => {
    if (!nfcService.isNative()) return;
    let cancelled = false;
    (async () => {
      try {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        if (cancelled) return;
        if (inProgress) {
          await KeepAwake.keepAwake();
        } else {
          await KeepAwake.allowSleep();
        }
      } catch (err) {
        console.warn("[AppLayout] KeepAwake toggle failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inProgress]);

  // Belt-and-suspenders: release the wake lock on unmount so a crash or
  // force-close mid-checkpoint can never leave the screen stuck on.
  useEffect(() => {
    return () => {
      if (!nfcService.isNative()) return;
      import("@capacitor-community/keep-awake")
        .then(({ KeepAwake }) => KeepAwake.allowSleep())
        .catch(() => {});
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-[430px] min-h-[100dvh] bg-background flex flex-col relative shadow-2xl shadow-black/5 sm:border-x sm:border-border/50">
      {/* Scrollable content area */}
      <main className="flex-1 overflow-y-auto pb-[108px] no-scrollbar relative flex flex-col pt-safe">
        {children}
      </main>

      {/* Fixed Bottom Navigation */}
      {showNav && (
        <nav className={`fixed bottom-0 left-0 right-0 h-[88px] glass-panel border-t border-border flex items-center justify-around px-2 z-50 rounded-t-[2rem] max-w-[430px] mx-auto pb-safe transition-opacity ${navDisabled ? "opacity-40 grayscale pointer-events-none" : ""}`}>
          <NavItem icon={Home}     label="Home"       path="/"            isActive={location === "/"} />
          <NavItem icon={Grid}     label="Stations"   path="/checkpoints" isActive={location === "/checkpoints"} />
          <NavItem icon={Calendar} label="History"    path="/history"     isActive={location === "/history"} />
          <NavItem icon={Sparkles} label="Insights"   path="/insights"    isActive={location === "/insights"} />
          <NavItem icon={Settings} label="Settings"   path="/settings"    isActive={["/settings", "/nfc-tags", "/checkpoints"].includes(location)} />
        </nav>
      )}

      {/* Always reachable regardless of enforcement state — see emergency-unlock.tsx */}
      {isStrict && inProgress && !emergencyUnlocked && (
        <EmergencyUnlock onUnlock={() => setEmergencyUnlocked(true)} />
      )}

      {/* Phase 3, Feature 4 — global capture entry point. Hidden during a
          strict-mode navigation lock so it doesn't undermine that mode's
          intent; the morning alarm's full-screen overlay (rendered inside
          Home, z-[80]) already visually covers this regardless. */}
      <QuickCaptureFab hidden={navDisabled} />
    </div>
  );
}

function NavItem({ icon: Icon, label, path, isActive }: { icon: React.ElementType; label: string; path: string; isActive: boolean }) {
  return (
    <Link
      href={path}
      className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all active:scale-95 group relative touch-none outline-none"
    >
      <div
        className={cn(
          "flex flex-col items-center justify-center transition-all duration-300",
          isActive ? "text-primary translate-y-[-2px]" : "text-muted-foreground group-hover:text-foreground"
        )}
      >
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
        <span
          className={cn(
            "text-[10px] mt-1 font-medium transition-all duration-300",
            isActive ? "opacity-100" : "opacity-0 translate-y-1"
          )}
        >
          {label}
        </span>
        {isActive && <span className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full" />}
      </div>
    </Link>
  );
}
