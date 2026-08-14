import { useRef, useState } from "react";
import { Unlock } from "lucide-react";
import { toast } from "sonner";
import { queueEmergencyUnlock } from "@/lib/offline-sync";

/**
 * Emergency Unlock — Phase 1 requirement #9.
 *
 * Strict enforcement mode intentionally makes navigation hard to reach
 * while a checkpoint is active. That's a product decision; it must never
 * become a trap because the app itself misbehaves (a stuck session, a
 * rendering bug, anything). This control is rendered OUTSIDE the
 * pointer-events-none nav wrapper so it's always tappable regardless of
 * enforcement state, requires a deliberate 5-second hold (so it can't be
 * triggered by accident or defeat the point of strict mode for normal
 * use), and is fully local — it works with zero network connectivity and
 * still logs the bypass for later sync so there's an audit trail.
 */
export function EmergencyUnlock({ onUnlock }: { onUnlock: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const HOLD_MS = 5000;
  const TICK_MS = 100;

  const clear = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setHolding(false);
    setProgress(0);
  };

  const start = () => {
    setHolding(true);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(1, elapsed / HOLD_MS);
      setProgress(pct);
      if (pct >= 1) {
        clear();
        queueEmergencyUnlock(null);
        toast.success("Emergency unlock — navigation restored.");
        console.warn("[EmergencyUnlock] Bypass used.");
        onUnlock();
      }
    }, TICK_MS);
  };

  return (
    <button
      className="fixed bottom-3 right-3 z-[60] w-11 h-11 rounded-full bg-background/90 border border-border shadow-md flex items-center justify-center active:scale-95 transition-transform"
      style={{
        // Visual hold progress ring — pure CSS conic-gradient, no extra deps.
        background: holding
          ? `conic-gradient(hsl(var(--destructive)) ${progress * 360}deg, hsl(var(--background) / 0.9) 0deg)`
          : undefined,
      }}
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      aria-label="Emergency unlock — hold 5 seconds"
      title="Emergency unlock — hold 5 seconds"
    >
      <Unlock size={18} className={holding ? "text-destructive-foreground" : "text-muted-foreground"} />
    </button>
  );
}
