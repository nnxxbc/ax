import { useEffect, useState, useRef, useCallback } from "react";
import {
  useGetTodayRoutine,
  useGetSettings,
  useStartTodayRoutine,
  getGetTodayRoutineQueryKey,
  getGetTodaySummaryQueryKey,
  getGetSettingsQueryKey,
  useSessionAction,
  useHandleNfcScan,
  useListNfcTags,
  getListNfcTagsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Battery, BatteryMedium, BatteryWarning, CheckCircle2,
  MapPin, Smartphone, Plus, ChevronDown, ChevronUp,
  Circle, CheckCircle, XCircle, SkipForward, AlertCircle,
  SmartphoneNfc,
} from "lucide-react";
import { toast } from "sonner";
import { LucideIcon } from "./checkpoint-icon";
import { nfcService } from "@/services/nfc-service";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

function statusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle size={14} className="text-primary shrink-0" />;
    case "in_progress": return <Circle size={14} className="text-primary shrink-0 animate-pulse" />;
    case "skipped": return <SkipForward size={14} className="text-muted-foreground shrink-0" />;
    case "missed": return <XCircle size={14} className="text-destructive shrink-0" />;
    default: return <Circle size={14} className="text-border shrink-0" />;
  }
}

// ─── Compact routine overview ─────────────────────────────────────────────────

function RoutineOverview({ sessions }: { sessions: any[] }) {
  const [open, setOpen] = useState(false);
  const sorted = [...sessions].sort((a, b) => a.order - b.order);
  const doneCount = sessions.filter(s => ["completed", "skipped"].includes(s.status)).length;

  return (
    <div className="border-t border-border/50 bg-card/50">
      <button
        className="w-full flex items-center justify-between px-5 py-3 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold uppercase tracking-widest">
          Routine · {doneCount}/{sessions.length}
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-0.5 animate-in slide-in-from-bottom-2 duration-200">
          {sorted.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-2.5 px-2 py-1.5 rounded-xl ${
                s.status === "in_progress" ? "bg-primary/10" : ""
              }`}
            >
              {statusIcon(s.status)}
              <span
                className={`text-sm font-medium flex-1 truncate ${
                  s.status === "completed" || s.status === "skipped"
                    ? "line-through text-muted-foreground/50"
                    : s.status === "in_progress"
                    ? "text-primary"
                    : "text-foreground"
                }`}
              >
                {s.checkpointName}
              </span>
              {s.targetDurationMinutes != null && s.targetDurationMinutes > 0 && s.status === "waiting" && (
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {s.targetDurationMinutes < 1
                    ? `${Math.round(s.targetDurationMinutes * 60)}s`
                    : `${s.targetDurationMinutes}m`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Freeze intervention overlay ──────────────────────────────────────────────

const FREEZE_REASONS = [
  { key: "tired",       label: "I'M TIRED",       response: "Let's make the next step smaller." },
  { key: "overwhelmed", label: "I'M OVERWHELMED",  response: "Forget the whole task. Just move to the station." },
  { key: "distracted",  label: "I'M DISTRACTED",   response: "Put your phone on the station." },
  { key: "unknown",     label: "I DON'T KNOW",     response: "Just stand up." },
] as const;

function FreezeOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [response, setResponse] = useState<string | null>(null);

  if (response) {
    return (
      <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 text-center animate-in fade-in duration-300">
        <p className="text-2xl font-semibold tracking-tight mb-6">{response}</p>
        <button
          className="text-sm text-muted-foreground underline underline-offset-4"
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center px-8 text-center animate-in fade-in duration-300">
      <AlertCircle size={40} className="text-muted-foreground mb-6" strokeWidth={1.5} />
      <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">Still here?</p>
      <p className="text-lg text-foreground mb-8">What's making this difficult?</p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {FREEZE_REASONS.map(r => (
          <button
            key={r.key}
            onClick={() => setResponse(r.response)}
            className="bg-muted hover:bg-muted/80 active:scale-[0.98] transition-all rounded-2xl px-4 py-4 text-sm font-bold tracking-wide text-foreground"
          >
            {r.label}
          </button>
        ))}
      </div>

      <button
        className="mt-6 text-xs text-muted-foreground/60 underline underline-offset-4"
        onClick={onDismiss}
      >
        I'm fine, close this
      </button>
    </div>
  );
}

// ─── NFC scan hook ────────────────────────────────────────────────────────────
// Manages the NFC scan lifecycle for the home page.
// Starts scanning when there's an active session, stops when there isn't.
// Validates the UID against the expected checkpoint BEFORE calling the API
// to prevent accidentally mutating the wrong station.

interface UseHomeNfcOptions {
  /** checkpointId we expect right now (waiting or in_progress) */
  expectedCheckpointId: number | null;
  /** called when a valid (non-debounced, correct-checkpoint or unknown) UID arrives */
  onScan: (uid: string) => void;
  /** called when a known-wrong station is scanned */
  onWrongStation: () => void;
  /** tags list from API (for local UID→checkpoint resolution) */
  nfcTags: Array<{ tagUid: string; checkpointId?: number | null }> | undefined;
}

function useHomeNfc({ expectedCheckpointId, onScan, onWrongStation, nfcTags }: UseHomeNfcOptions) {
  const isNative = nfcService.isNative();

  // Keep fresh refs so the callback closure doesn't go stale
  const expectedRef = useRef(expectedCheckpointId);
  const tagsRef = useRef(nfcTags);
  const onScanRef = useRef(onScan);
  const onWrongRef = useRef(onWrongStation);

  useEffect(() => { expectedRef.current = expectedCheckpointId; }, [expectedCheckpointId]);
  useEffect(() => { tagsRef.current = nfcTags; }, [nfcTags]);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { onWrongRef.current = onWrongStation; }, [onWrongStation]);

  const handleTag = useCallback((uid: string) => {
    const expected = expectedRef.current;
    const tags = tagsRef.current ?? [];

    // Resolve the UID to a checkpointId using the local tag cache
    const match = tags.find(t => t.tagUid === uid);

    if (match && match.checkpointId && expected && match.checkpointId !== expected) {
      // Known tag but wrong station — block the API call
      console.debug(
        `[HomeNFC] Wrong station — expected checkpointId ${expected}, scanned UID ${uid} → checkpoint ${match.checkpointId}`
      );
      onWrongRef.current();
      return;
    }

    // Unknown UID or correct station — let the API sort it out
    onScanRef.current(uid);
  }, []);

  useEffect(() => {
    if (!isNative || !expectedCheckpointId) {
      nfcService.stopScanning();
      return;
    }

    nfcService.startScanning(handleTag);

    return () => {
      nfcService.stopScanning();
    };
  }, [isNative, expectedCheckpointId, handleTag]);
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export function Home() {
  const queryClient = useQueryClient();
  const { data: routine, isLoading } = useGetTodayRoutine({
    query: { queryKey: getGetTodayRoutineQueryKey(), refetchInterval: 3000 },
  });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const startRoutine = useStartTodayRoutine();
  const handleNfcScan = useHandleNfcScan();
  const { data: nfcTags } = useListNfcTags({ query: { queryKey: getListNfcTagsQueryKey() } });

  const [completedName, setCompletedName] = useState<string | null>(null);
  const prevInProgressRef = useRef<any>(null);

  const inProgressSession = routine?.sessions?.find((s: any) => s.status === "in_progress");
  const nextSession = routine?.sessions?.find((s: any) => s.status === "waiting");

  // The checkpoint we're actively waiting on (either in-progress or next waiting)
  const activeCheckpointId: number | null =
    inProgressSession?.checkpointId ?? nextSession?.checkpointId ?? null;

  useEffect(() => {
    const prev = prevInProgressRef.current;
    if (prev && !inProgressSession) {
      setCompletedName(prev.checkpointName ?? "Station");
      const t = setTimeout(() => setCompletedName(null), 1800);
      return () => clearTimeout(t);
    }
    prevInProgressRef.current = inProgressSession ?? null;
    return undefined;
  }, [inProgressSession]);

  // ── NFC scan handler ───────────────────────────────────────────────────────
  const [earlyWarningDialog, setEarlyWarningDialog] = useState<any>(null);

  const handleScanResult = useCallback(
    (uid: string) => {
      console.debug(`[Home] Calling POST /api/nfc/scan with UID: ${uid}`);
      handleNfcScan.mutate(
        { data: { tagUid: uid } },
        {
          onSuccess: (result: any) => {
            console.debug(
              `[Home] Scan result — action: ${result.action} | checkpoint: ${result.checkpointName} | state: ${result.session?.status ?? "n/a"}`
            );

            switch (result.action) {
              case "started":
                toast(`${result.checkpointName} started. Park your phone.`);
                break;
              case "completed":
                // Routine polling will update state; completion flash shows automatically
                break;
              case "early_complete_warning":
                setEarlyWarningDialog(result);
                return; // don't invalidate yet
              case "unknown_tag":
                toast("No station assigned to this tag.", { duration: 2000 });
                console.debug("[Home] Unknown tag — reason: no mapping");
                return;
              case "no_checkpoint_assigned":
                toast("Tag has no station assigned.", { duration: 2000 });
                return;
              case "debounced":
                console.debug("[Home] Scan debounced by server");
                return;
              default:
                break;
            }

            queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
          },
          onError: () => {
            console.debug("[Home] Scan API error — reason: network/server");
          },
        }
      );
    },
    [handleNfcScan, queryClient]
  );

  const handleWrongStation = useCallback(() => {
    toast("Wrong station.", { duration: 2000 });
    console.debug("[Home] Wrong station — reason: wrong station");
  }, []);

  // Activate the NFC listener whenever there's an active session
  useHomeNfc({
    expectedCheckpointId: activeCheckpointId,
    onScan: handleScanResult,
    onWrongStation: handleWrongStation,
    nfcTags,
  });

  // ── Early-complete session action ──────────────────────────────────────────
  const sessionAction = useSessionAction();

  const handleCompleteAnyway = () => {
    if (!earlyWarningDialog?.sessionId) { setEarlyWarningDialog(null); return; }
    sessionAction.mutate(
      { id: earlyWarningDialog.sessionId, data: { action: "complete_anyway", reason: "early override via NFC" } },
      {
        onSuccess: () => {
          toast("Completed early.");
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
          setEarlyWarningDialog(null);
        },
        onError: () => toast.error("Failed to complete"),
      }
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const handleStart = (mode: "full" | "reduced" | "survival") => {
    startRoutine.mutate(
      { data: { energyMode: mode } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
          toast.success(`Routine started — ${mode} mode`);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Completion flash
  if (completedName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300 text-center bg-primary/5">
        <div className="w-28 h-28 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={56} className="text-primary" strokeWidth={1.5} />
        </div>
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground mb-3">Complete</p>
        <h2 className="text-3xl font-bold tracking-tight">{completedName}</h2>
      </div>
    );
  }

  // No routine → energy picker
  if (!routine || routine.status === "abandoned") {
    return <EnergyPicker onStart={handleStart} isPending={startRoutine.isPending} />;
  }

  // Routine completed
  if (routine.status === "completed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={48} className="text-primary" strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-semibold mb-2">All done.</h2>
        <p className="text-muted-foreground">You can rest now.</p>
        <button className="mt-12 text-sm text-muted-foreground underline underline-offset-4" onClick={() => handleStart("full")}>
          Restart routine
        </button>
      </div>
    );
  }

  const freezeThreshold = settings?.freezeStuckThresholdSeconds ?? 30;

  if (inProgressSession) {
    return (
      <>
        <div className="flex-1 flex flex-col">
          <InProgressView session={inProgressSession} onScanResult={handleScanResult} />
          {routine.sessions?.length > 0 && <RoutineOverview sessions={routine.sessions} />}
        </div>

        {/* Early complete warning dialog */}
        {earlyWarningDialog && (
          <EarlyCompleteDialog
            dialog={earlyWarningDialog}
            onKeepGoing={() => setEarlyWarningDialog(null)}
            onCompleteAnyway={handleCompleteAnyway}
            isPending={sessionAction.isPending}
          />
        )}
      </>
    );
  }

  if (nextSession) {
    return (
      <>
        <div className="flex-1 flex flex-col">
          <WaitingView session={nextSession} freezeThresholdSeconds={freezeThreshold} />
          {routine.sessions?.length > 0 && <RoutineOverview sessions={routine.sessions} />}
        </div>

        {earlyWarningDialog && (
          <EarlyCompleteDialog
            dialog={earlyWarningDialog}
            onKeepGoing={() => setEarlyWarningDialog(null)}
            onCompleteAnyway={handleCompleteAnyway}
            isPending={sessionAction.isPending}
          />
        )}
      </>
    );
  }

  // Active routine but empty/all done
  const allDone = routine.sessions.length > 0 &&
    routine.sessions.every((s: any) => ["completed", "skipped", "missed", "cancelled"].includes(s.status));

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 size={48} className="text-primary" strokeWidth={1.5} />
      </div>
      <h2 className="text-3xl font-semibold mb-2">{allDone ? "All done." : "Ready to start?"}</h2>
      <p className="text-muted-foreground">{allDone ? "You can rest now." : "Choose how much energy you have today."}</p>
      {!allDone && (
        <div className="flex flex-col gap-3 w-full mt-10">
          <EnergyCard title="Full Energy" desc="All stations active." icon={Battery} color="bg-primary/10 text-primary" onClick={() => handleStart("full")} disabled={startRoutine.isPending} />
          <EnergyCard title="Reduced" desc="Only the important things." icon={BatteryMedium} color="bg-secondary/10 text-secondary-foreground" onClick={() => handleStart("reduced")} disabled={startRoutine.isPending} />
          <EnergyCard title="Survival" desc="Absolute essentials only." icon={BatteryWarning} color="bg-destructive/10 text-destructive" onClick={() => handleStart("survival")} disabled={startRoutine.isPending} />
        </div>
      )}
      {allDone && (
        <button className="mt-8 text-sm text-muted-foreground underline underline-offset-4" onClick={() => handleStart("full")}>
          Restart routine
        </button>
      )}
    </div>
  );
}

// ─── Early-complete warning dialog ────────────────────────────────────────────

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

function EarlyCompleteDialog({
  dialog,
  onKeepGoing,
  onCompleteAnyway,
  isPending,
}: {
  dialog: any;
  onKeepGoing: () => void;
  onCompleteAnyway: () => void;
  isPending: boolean;
}) {
  return (
    <DialogPrimitive.Root open={true} onOpenChange={(open) => !open && onKeepGoing()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[90%] max-w-sm translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-xl rounded-3xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <h2 className="text-xl font-bold mb-2">Too fast?</h2>
          <p className="text-sm text-muted-foreground mb-6">{dialog?.message}</p>
          <div className="flex flex-col gap-3">
            <Button onClick={onKeepGoing} className="rounded-2xl h-12">Keep going</Button>
            <Button
              variant="outline"
              className="rounded-2xl h-12"
              onClick={onCompleteAnyway}
              disabled={isPending}
            >
              Complete anyway
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Energy picker ────────────────────────────────────────────────────────────

function EnergyPicker({ onStart, isPending }: { onStart: (m: "full" | "reduced" | "survival") => void; isPending: boolean }) {
  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in zoom-in duration-500">
      <div className="mt-8 mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Good morning.</h1>
        <p className="text-muted-foreground text-lg mt-2">How are we feeling today?</p>
      </div>
      <div className="flex flex-col gap-4">
        <EnergyCard title="Full Energy" desc="Ready for everything. All stations active." icon={Battery} color="bg-primary/10 text-primary" onClick={() => onStart("full")} disabled={isPending} />
        <EnergyCard title="Reduced" desc="A bit lower today. Only the important things." icon={BatteryMedium} color="bg-secondary/10 text-secondary-foreground" onClick={() => onStart("reduced")} disabled={isPending} />
        <EnergyCard title="Survival" desc="Bare minimum. Absolute essentials only." icon={BatteryWarning} color="bg-destructive/10 text-destructive" onClick={() => onStart("survival")} disabled={isPending} />
      </div>
    </div>
  );
}

function EnergyCard({ title, desc, icon: Icon, color, onClick, disabled }: any) {
  return (
    <button
      className="w-full text-left bg-card border border-border/50 rounded-3xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all p-5 flex items-center gap-4 disabled:opacity-60"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={28} />
      </div>
      <div className="flex-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground leading-snug mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

// ─── Waiting view ─────────────────────────────────────────────────────────────

function WaitingView({ session, freezeThresholdSeconds }: { session: any; freezeThresholdSeconds: number }) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();
  const [elapsed, setElapsed] = useState(0);
  const [freezeDismissed, setFreezeDismissed] = useState(false);

  // Reset freeze dismissed state when session changes
  useEffect(() => { setFreezeDismissed(false); setElapsed(0); }, [session.id]);

  // Count seconds on this waiting screen
  useEffect(() => {
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [session.id]);

  const showFreeze = !freezeDismissed && elapsed >= freezeThresholdSeconds && freezeThresholdSeconds > 0;

  const handleSkip = () => {
    sessionAction.mutate({ id: session.id, data: { action: "skip" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        toast("Station skipped.");
      },
    });
  };

  const handleStartManual = () => {
    sessionAction.mutate({ id: session.id, data: { action: "start" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
      },
    });
  };

  const name: string = session.checkpointName ?? "Station";
  const parts = name.split(/\s*\+\s*/);
  const isNative = nfcService.isNative();

  return (
    <div className="flex-1 flex flex-col animate-in slide-in-from-bottom-4 duration-500 relative">
      {showFreeze && <FreezeOverlay onDismiss={() => setFreezeDismissed(true)} />}

      {/* status pill */}
      <div className="flex justify-center pt-8 pb-2">
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground bg-muted px-4 py-1.5 rounded-full">
          Next Stop
        </span>
      </div>

      {/* main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {/* icon */}
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
          <LucideIcon name={session.checkpointIcon} size={40} className="text-primary" strokeWidth={1.5} />
        </div>

        {/* station name — very large */}
        <h1 className="font-bold tracking-tight leading-none mb-6" style={{ fontSize: "clamp(2.8rem, 13vw, 4.5rem)" }}>
          {parts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="block text-3xl text-muted-foreground font-light my-1">+</span>}
              {part.toUpperCase()}
            </span>
          ))}
        </h1>

        {/* location */}
        {session.checkpointLocation && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-6">
            <MapPin size={14} />
            <span>{session.checkpointLocation}</span>
          </div>
        )}

        {/* NFC instruction — adapts to native vs web */}
        {isNative ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <SmartphoneNfc size={16} className="shrink-0" />
            <span>Hold phone near the station tag.</span>
          </div>
        ) : (
          <p className="text-base text-muted-foreground">
            Go to this station and scan your NFC tag.
          </p>
        )}
      </div>

      {/* subtle simulation fallback */}
      <div className="flex items-center justify-center gap-6 pb-6 pt-3">
        <button className="text-sm text-muted-foreground underline underline-offset-4 active:opacity-60" onClick={handleStartManual} disabled={sessionAction.isPending}>
          Start without NFC
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button className="text-sm text-muted-foreground underline underline-offset-4 active:opacity-60" onClick={handleSkip} disabled={sessionAction.isPending}>
          Skip this one
        </button>
      </div>
    </div>
  );
}

// ─── In-progress view ─────────────────────────────────────────────────────────

function InProgressView({ session, onScanResult: _onScanResult }: { session: any; onScanResult?: (uid: string) => void }) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();
  // targetDurationMinutes may be decimal (e.g. 0.5 = 30s)
  const targetMins: number = session.targetDurationMinutes ?? session.defaultDurationMinutes ?? 0;
  const minMins: number = session.minDurationMinutes ?? 0;

  const [addedMins, setAddedMins] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Restore elapsed from startedAt timestamp (handles app resume correctly)
  useEffect(() => {
    const start = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  useEffect(() => { setAddedMins(0); }, [session.id]);

  const totalTargetSecs = (targetMins + addedMins) * 60;
  const isZeroDuration = targetMins === 0 && addedMins === 0;
  const displaySecs = isZeroDuration ? elapsed : Math.max(0, totalTargetSecs - elapsed);
  const countingDown = !isZeroDuration;
  const minElapsed = elapsed >= minMins * 60;
  const targetReached = isZeroDuration ? false : elapsed >= totalTargetSecs;
  const showReturnScan = minElapsed || targetReached;

  const handleExtend = (mins: number) => {
    setAddedMins(prev => prev + mins);
    sessionAction.mutate(
      { id: session.id, data: { action: "extend_time", additionalMinutes: mins } },
      { onError: () => setAddedMins(prev => prev - mins) }
    );
  };

  const handleCompleteManual = () => {
    sessionAction.mutate({ id: session.id, data: { action: "complete" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
      },
    });
  };

  const name: string = session.checkpointName ?? "Station";
  const parts = name.split(/\s*\+\s*/);

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-500 bg-primary/[0.03]">
      {/* status pill */}
      <div className="flex justify-center pt-8 pb-2">
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary bg-primary/10 px-4 py-1.5 rounded-full">
          In Progress
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* icon */}
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <LucideIcon name={session.checkpointIcon} size={32} className="text-primary" strokeWidth={1.5} />
        </div>

        {/* task name — DOMINANT */}
        <h1 className="font-extrabold tracking-tight leading-none mb-8" style={{ fontSize: "clamp(2.5rem, 12vw, 4.5rem)" }}>
          {parts.map((part, i) => (
            <span key={i} className="block">
              {i > 0 && <span className="block text-2xl text-muted-foreground font-normal my-1">+</span>}
              {part.toUpperCase()}
            </span>
          ))}
        </h1>

        {/* timer */}
        {targetReached ? (
          <div className="mb-6 text-center">
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-1">Time's Up</p>
            <p className="font-light tabular-nums text-muted-foreground" style={{ fontSize: "clamp(3rem, 14vw, 5rem)", lineHeight: 1 }}>
              {fmtTime(elapsed)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Continue until you're ready.</p>
          </div>
        ) : (
          <div className="mb-2">
            <span className="font-light tabular-nums text-primary" style={{ fontSize: "clamp(3.5rem, 16vw, 6rem)", lineHeight: 1 }}>
              {fmtTime(displaySecs)}
            </span>
          </div>
        )}
        {!targetReached && (
          <p className="text-sm text-muted-foreground mb-6">
            {countingDown ? "Remaining" : "Elapsed"}
          </p>
        )}

        {/* +time buttons */}
        <div className="flex gap-3 mb-8">
          {[5, 10, 30].map(m => (
            <button
              key={m}
              onClick={() => handleExtend(m)}
              className="flex items-center gap-1 bg-card border border-border/60 rounded-2xl px-4 py-2.5 text-sm font-semibold text-foreground shadow-sm active:scale-95 transition-transform hover:border-primary/40"
            >
              <Plus size={13} strokeWidth={2.5} />
              {m} min
            </button>
          ))}
        </div>

        {/* park / return instruction */}
        <div className="w-full max-w-xs rounded-3xl border-2 border-dashed border-border p-5 flex flex-col items-center gap-2">
          <Smartphone size={28} className="text-muted-foreground" strokeWidth={1.5} />
          {showReturnScan ? (
            <>
              <p className="font-bold tracking-widest text-xs uppercase text-primary">Return &amp; Scan</p>
              <p className="text-sm text-muted-foreground text-center">
                Scan the <strong>same NFC tag</strong> again to complete.
              </p>
            </>
          ) : (
            <>
              <p className="font-bold tracking-widest text-xs uppercase text-muted-foreground">Park Your Phone</p>
              <p className="text-sm text-muted-foreground text-center">Leave it here and do your task.</p>
            </>
          )}
        </div>
      </div>

      {/* manual complete fallback */}
      <div className="flex justify-center pb-6 pt-3">
        <button
          className="text-xs text-muted-foreground/60 underline underline-offset-4 active:opacity-60"
          onClick={handleCompleteManual}
          disabled={sessionAction.isPending}
        >
          Complete without NFC
        </button>
      </div>
    </div>
  );
}
