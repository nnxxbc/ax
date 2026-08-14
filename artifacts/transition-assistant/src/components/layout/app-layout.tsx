import * as React from "react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, Grid, Calendar, Sparkles, Settings } from "lucide-react";
import { useGetSettings, getGetSettingsQueryKey, useGetTodayRoutine, getGetTodayRoutineQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { EmergencyUnlock } from "./emergency-unlock";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  console.log(`[AppLayout] Rendering. Location: ${location}`);
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: routine } = useGetTodayRoutine({
    query: { queryKey: getGetTodayRoutineQueryKey(), refetchInterval: 5000 },
  });

  const inProgress = routine?.sessions?.some((s: any) => s.status === "in_progress");
  const isStrict = settings?.enforcementLevel === "strict";
  const isFocused = settings?.enforcementLevel === "focused";

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
