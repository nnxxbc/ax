import { useEffect, useState, useRef, useCallback } from "react";
import {
  useGetTodayRoutine,
  useGetSettings,
  useStartTodayRoutine,
  getGetTodayRoutineQueryKey,
  getGetTodaySummaryQueryKey,
  getGetSettingsQueryKey,
  useSessionAction,
  useListNfcTags,
  getListNfcTagsQueryKey,
  useListCheckpoints,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Battery, BatteryMedium, BatteryWarning, CheckCircle2,
  MapPin, Smartphone, Plus, ChevronDown, ChevronUp,
  Circle, CheckCircle, XCircle, SkipForward, AlertCircle,
  SmartphoneNfc, X, CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import { LucideIcon } from "./checkpoint-icon";
import { nfcService } from "@/services/nfc-service";
import { notificationService } from "@/services/notification-service";
import { alarmService } from "@/services/alarm-service";
import { isAlarmActiveNow, dateKey } from "@/lib/alarm-rules";
import { getJSON, setJSON } from "@/lib/local-store";
import { effectiveEnforcementLevel } from "@/lib/enforcement";
import { useStartFrozenEvent, useAppendFrozenStep, useCompleteFrozenEvent } from "@/lib/frozen-api";
import { advanceFrozenStage } from "@/lib/frozen-protocol-rules";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { processLocalScan, isSessionStuck, type LocalSession } from "@/lib/nfc-state-machine";
import {
  toLocalSession, toUiSession, patchSessionsForUi, resolveCheckpointFromTag,
  cacheSessions, getCachedSessions, getCachedRoutineId,
  cacheCheckpoints, getCachedCheckpoints,
  queueCheckpointScan, flushSyncQueue, recordScanDiagnostics, sendSyncEvent,
} from "@/lib/offline-sync";
import { startBackgroundSync, pendingCount, getQueue } from "@/lib/sync-queue";
import { reconcilePendingSessions } from "@/lib/sync-reconcile";

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

  const requiredMissing = sessions.filter(s => s.isRequired && !["completed", "skipped"].includes(s.status));
  const requiredDone = sessions.filter(s => s.isRequired && ["completed", "skipped"].includes(s.status));
  const optional = sessions.filter(s => !s.isRequired);

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
        <div className="px-4 pb-4 flex flex-col gap-4 animate-in slide-in-from-bottom-2 duration-200 max-h-[60vh] overflow-y-auto">
          {requiredMissing.length > 0 && (
            <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest ml-2 mb-1">Required Missing</p>
                {requiredMissing.map(s => <SessionRow key={s.id} s={s} />)}
            </div>
          )}

          {requiredDone.length > 0 && (
            <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest ml-2 mb-1">Required Completed</p>
                {requiredDone.map(s => <SessionRow key={s.id} s={s} />)}
            </div>
          )}

          {optional.length > 0 && (
            <div className="space-y-1">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest ml-2 mb-1">Optional</p>
                {optional.map(s => <SessionRow key={s.id} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SessionRow({ s }: { s: any }) {
    return (
        <div
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
    // Unknown UID or any station — let the API sort it out
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
    query: {
      queryKey: getGetTodayRoutineQueryKey(),
      refetchInterval: 3000,
      // Bugfix: a background poll can land after a scan updated the UI
      // locally but before the queued sync event has reached the server —
      // without this, that poll's stale response silently reverts the
      // just-completed checkpoint back to its previous state (reported as
      // "scan Out of Bed, briefly see Foam Roller, then it snaps back and
      // I'm stuck"). Protect any session with an unsynced queue entry.
      select: (data: any) => {
        if (!data?.sessions) return data;
        const pendingIds = new Set(
          getQueue()
            .filter((e) => e.syncStatus !== "synced" && e.sessionId)
            .map((e) => e.sessionId as string),
        );
        if (pendingIds.size === 0) return data;
        return { ...data, sessions: reconcilePendingSessions(data.sessions, getCachedSessions(), pendingIds) };
      },
    },
  });
  const { data: settings } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const startRoutine = useStartTodayRoutine();
  const { data: nfcTags } = useListNfcTags({ query: { queryKey: getListNfcTagsQueryKey() } });
  const { data: checkpointsList } = useListCheckpoints({ query: { queryKey: getListCheckpointsQueryKey() } });

  const [completedName, setCompletedName] = useState<string | null>(null);
  const [lastApiError, setLastApiError] = useState<string | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [stuckDialogSession, setStuckDialogSession] = useState<any>(null);
  const dismissedStuckRef = useRef<Set<string>>(new Set());
  const prevInProgressRef = useRef<any>(null);
  const hydratedRef = useRef(false);

  // ── Restart recovery: hydrate from disk BEFORE any network response ──────
  // Runs once, synchronously on first render of this component (i.e. on app
  // boot / after force-close+reopen). If we already have a persisted local
  // session cache and React Query hasn't populated real data yet, seed the
  // cache from disk so the UI shows the correct active session immediately
  // instead of a loading spinner or "no routine" flash while waiting for
  // the network.
  if (!hydratedRef.current) {
    hydratedRef.current = true;
    const existing = queryClient.getQueryData(getGetTodayRoutineQueryKey());
    if (!existing) {
      const cachedSessions = getCachedSessions();
      const cachedRoutineId = getCachedRoutineId();
      if (cachedRoutineId && cachedSessions.length > 0) {
        queryClient.setQueryData(getGetTodayRoutineQueryKey(), {
          id: cachedRoutineId,
          status: "active",
          sessions: cachedSessions,
        });
        console.debug("[Home] Restored session state from local storage after restart.");
      }
    }
    const cachedCps = getCachedCheckpoints();
    if (cachedCps.length > 0 && !queryClient.getQueryData(getListCheckpointsQueryKey())) {
      queryClient.setQueryData(getListCheckpointsQueryKey(), cachedCps);
    }
  }

  // Persist every successful server snapshot to disk so it survives restart.
  useEffect(() => {
    if (routine?.id && routine?.sessions) {
      cacheSessions(routine.id, routine.sessions);
    }
  }, [routine]);

  useEffect(() => {
    if (checkpointsList && checkpointsList.length > 0) {
      cacheCheckpoints(checkpointsList);
    }
  }, [checkpointsList]);

  // Background sync loop — drains the offline queue every 15s and immediately on reconnect.
  useEffect(() => {
    const stop = startBackgroundSync(sendSyncEvent, 15000);
    flushSyncQueue().catch(() => {});
    return stop;
  }, []);

  // Ground-truth sync indicator — reflects the actual queue, not just the
  // event we just fired, so it clears correctly once background retries succeed.
  useEffect(() => {
    const check = () => setSyncPending(pendingCount() > 0);
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  const inProgressSession = routine?.sessions?.find((s: any) => s.status === "in_progress");
  const nextSession = routine?.sessions?.find((s: any) => s.status === "waiting");

  // The checkpoint we're actively waiting on (either in-progress or next waiting)
  const activeCheckpointId: number | null =
    inProgressSession?.checkpointId ?? nextSession?.checkpointId ?? null;

  useEffect(() => {
    notificationService.requestPermissions();
  }, []);

  // Phase 3, Feature 1 — Persistent Morning Alarm. Reschedule the OS-level
  // weekly notifications whenever alarm settings change, and separately
  // track whether the in-app lock overlay should be showing right now
  // (re-checked every 30s since it's purely time-based).
  const [alarmActive, setAlarmActive] = useState(false);
  useEffect(() => {
    if (!settings) return;
    alarmService.requestPermissions();
    alarmService.reschedule(settings).catch((err) => console.error("[Home] alarmService.reschedule failed:", err));
  }, [
    settings?.alarmEnabled,
    settings?.alarmTime,
    settings?.alarmRequiresNfcDismissal,
    settings?.alarmSoundEnabled,
    settings?.alarmVibrationEnabled,
    settings?.alarmTargetCheckpointId,
    JSON.stringify(settings?.alarmDaysOfWeek),
  ]);

  useEffect(() => {
    if (!settings) return;
    const check = () => {
      const now = new Date();
      const dismissedForDate = getJSON<string | null>("alarm_dismissed_date", null);
      setAlarmActive(isAlarmActiveNow(settings, now, dateKey(now), dismissedForDate));
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [settings?.alarmEnabled, settings?.alarmTime, JSON.stringify(settings?.alarmDaysOfWeek)]);

  const dismissAlarmForToday = useCallback(() => {
    setJSON("alarm_dismissed_date", dateKey(new Date()));
    setAlarmActive(false);
    toast.success("Alarm dismissed. Good morning!");
  }, []);

  // Phase 3, Feature 2 — Check-in category has no native "every N minutes"
  // OS trigger available, so it's re-armed opportunistically: on mount, and
  // whenever the app comes back to the foreground.
  useEffect(() => {
    if (!settings) return;
    notificationService.armCheckIn(settings);
    const onVisible = () => {
      if (document.visibilityState === "visible") notificationService.armCheckIn(settings);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [settings?.notifyCheckInsEnabled, settings?.checkInIntervalMinutes, settings?.quietHoursEnabled, settings?.quietHoursStart, settings?.quietHoursEnd]);

  // Phase 3, Feature 2 — Transition reminder: a gentler nudge some minutes
  // after a checkpoint becomes "waiting" (next up) but hasn't been started.
  const prevWaitingIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!settings) return;
    const waitingId = nextSession ? String(nextSession.id) : null;
    if (waitingId !== prevWaitingIdRef.current) {
      prevWaitingIdRef.current = waitingId;
      if (waitingId && nextSession && !inProgressSession) {
        notificationService.scheduleTransitionReminder(
          nextSession.checkpointName ?? "Station",
          settings.transitionReminderDelayMinutes ?? 15,
          settings,
        );
      } else {
        notificationService.cancelTransitionReminder();
      }
    }
  }, [nextSession?.id, inProgressSession, settings]);

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

  // ── Stuck-session detection ─────────────────────────────────────────────
  // A session left in_progress far longer than any real checkpoint should
  // take usually means something technical interrupted the user (app
  // killed, phone died, NFC failure) rather than a 4-hour stretch. Ask,
  // don't silently resolve it either way.
  useEffect(() => {
    if (!inProgressSession?.id) return;
    const key = String(inProgressSession.id) + (inProgressSession.startedAt ?? "");
    if (dismissedStuckRef.current.has(key)) return;
    if (isSessionStuck(toLocalSession(inProgressSession))) {
      setStuckDialogSession(inProgressSession);
    }
  }, [inProgressSession]);

  const handleStuckResolution = (choice: "still_doing_it" | "finished" | "stopped" | "cancel") => {
    const session = stuckDialogSession;
    if (!session) return;
    const key = String(session.id) + (session.startedAt ?? "");
    dismissedStuckRef.current.add(key);
    setStuckDialogSession(null);

    if (choice === "still_doing_it") return; // no-op, keep going

    if (choice === "finished") {
      // Treat exactly like a real completion scan would, without requiring the tag.
      handleLocalCheckpointResolution(session.checkpointId, "completed_via_recovery");
      return;
    }

    if (choice === "stopped" || choice === "cancel") {
      sessionAction.mutate(
        { id: session.id, data: { action: "cancel" } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
            toast(choice === "cancel" ? "Session cancelled." : "Marked as stopped.");
          },
          onError: () => toast.error("Couldn't reach the server, but you can keep using the app — try again later."),
        }
      );
    }
  };

  // ── NFC scan handler — LOCAL-FIRST ──────────────────────────────────────
  // The device decides start/complete/repeat from its own cached session
  // state immediately. The UI updates instantly. The backend is told in
  // the background via the durable sync queue (src/lib/sync-queue.ts) and
  // is never on the critical path — Render being down, slow, or returning
  // HTTP 500 cannot leave the user stuck mid-checkpoint anymore.
  const [earlyWarningDialog, setEarlyWarningDialog] = useState<any>(null);
  const [bedModeDialog, setBedModeDialog] = useState<any>(null);

  // Phase 3, Features 7/8 — Frozen Protocol event tracking. Lifted to Home
  // (rather than owned by the leaf InProgressView) because Home is already
  // the single place session completions are handled (see the "completed"
  // case in applyLocalResult below), which is where a frozen event's
  // recovery-duration/success gets logged.
  const [frozenEventId, setFrozenEventId] = useState<number | null>(null);
  const [frozenStage, setFrozenStage] = useState<1 | 2 | 3 | 4>(1);
  const [frozenDestinationId, setFrozenDestinationId] = useState<number | null>(null);
  const startFrozenEvent = useStartFrozenEvent();
  const appendFrozenStep = useAppendFrozenStep();
  const completeFrozenEvent = useCompleteFrozenEvent();

  useEffect(() => {
    if (inProgressSession?.mode === "frozen" && frozenEventId == null) {
      setFrozenStage(1);
      setFrozenDestinationId(null);
      startFrozenEvent.mutate(
        { bedCheckpointId: inProgressSession.checkpointId, bedSessionId: Number(inProgressSession.id) || undefined },
        { onSuccess: (ev) => setFrozenEventId(ev.id) },
      );
    } else if (inProgressSession?.mode !== "frozen" && frozenEventId != null) {
      // Left frozen mode without going through our own "complete" handling
      // below (e.g. the session was cancelled) — clear tracking so the next
      // frozen session starts its own event rather than appending to a stale one.
      setFrozenEventId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inProgressSession?.id, inProgressSession?.mode]);

  const logFrozenStep = useCallback(
    (step: string) => {
      if (frozenEventId != null) appendFrozenStep.mutate({ id: frozenEventId, step });
    },
    [frozenEventId, appendFrozenStep],
  );

  const applyLocalResult = useCallback(
    (result: ReturnType<typeof processLocalScan>, checkpointId: number) => {
      // 1. Update the UI instantly via the same React Query cache the
      //    existing components already render from — no component below
      //    this needed to change to become local-first. patchSessionsForUi
      //    merges onto the previous full session objects so enrichment
      //    fields (icon, location, isRequired, ...) survive on every
      //    session that didn't actually change.
      const patchedSessions = patchSessionsForUi(routine?.sessions ?? getCachedSessions(), result.sessions);
      queryClient.setQueryData(getGetTodayRoutineQueryKey(), (old: any) => (old ? { ...old, sessions: patchedSessions } : old));
      cacheSessions(routine?.id ?? getCachedRoutineId() ?? "unknown", patchedSessions);

      // 2. Side effects that used to run in the mutation's onSuccess.
      switch (result.action) {
        case "started":
        case "repeat_started":
          if (result.session.checkpointType === "bed") {
            const fullSession = patchedSessions.find((s: any) => String(s.id) === result.session.id) ?? toUiSession(result.session);
            setBedModeDialog({ session: fullSession });
          } else if (result.session.checkpointType === "leaving_home") {
            toast.success("Leaving home recorded. Stay safe!");
          } else {
            toast(`${result.session.checkpointName} started. Park your phone.`);
          }
          notificationService.cancelTransitionReminder();
          if (result.session.targetDurationMinutes) {
            notificationService.scheduleTimerEnd(result.session.checkpointName, result.session.targetDurationMinutes * 60, settings);
          }
          break;
        case "completed":
          notificationService.cancelAll();
          if (result.session.checkpointType === "leaving_home") {
            toast.success("Safe travels! Door locked?");
          } else {
            toast.success(`${result.session.checkpointName} completed!`);
          }
          // Phase 3, Features 7/8 — a frozen session completing via the
          // normal scan-to-complete flow (stage 4 of the protocol) is a
          // successful transition; log it for future Insights.
          if (result.session.mode === "frozen" && frozenEventId != null) {
            completeFrozenEvent.mutate({ id: frozenEventId, destinationCheckpointId: frozenDestinationId });
            setFrozenEventId(null);
            setFrozenStage(1);
            setFrozenDestinationId(null);
          }
          break;
        case "early_complete_warning":
          setEarlyWarningDialog({
            sessionId: result.session.id,
            checkpointName: result.session.checkpointName,
            message: `You've been here a little while — minimum time hasn't passed yet.`,
          });
          return; // nothing to sync — no state changed
      }

      // 3. Durable local persistence + background sync — never required for
      //    the checkpoint to be "real" from the user's perspective.
      setSyncPending(true);
      queueCheckpointScan(checkpointId, result.session.id, result.action, new Date().toISOString());
    },
    [queryClient, routine?.id, settings, frozenEventId, frozenDestinationId, completeFrozenEvent]
  );

  const handleLocalCheckpointResolution = useCallback(
    (checkpointId: number, _reason?: string) => {
      const checkpoints = checkpointsList ?? getCachedCheckpoints();
      const cp = checkpoints.find((c: any) => c.id === checkpointId);
      if (!cp) {
        toast.error("Unknown station — can't resolve locally.");
        return;
      }
      const localCheckpoint = {
        id: cp.id,
        name: cp.name,
        minDurationMinutes: cp.minDurationMinutes ?? 0,
        targetDurationMinutes: cp.defaultDurationMinutes ?? 0,
        completeOnFirstScan: !!cp.completeOnFirstScan,
        checkpointType: cp.type,
      };
      const currentSessions = (routine?.sessions ?? []).map(toLocalSession);
      const result = processLocalScan(currentSessions, localCheckpoint, String(routine?.id ?? getCachedRoutineId() ?? ""));
      applyLocalResult(result, checkpointId);
    },
    [checkpointsList, routine, applyLocalResult]
  );

  const handleScanResult = useCallback(
    (uid: string) => {
      console.debug(`[Home] NFC scan (local-first): UID ${uid}`);
      setLastApiError(null);

      const checkpoints = checkpointsList ?? getCachedCheckpoints();
      const checkpoint = resolveCheckpointFromTag(uid, nfcTags, checkpoints);

      // Phase 3, Feature 1 — a scan that resolves to the configured alarm
      // checkpoint (or any known checkpoint, if none is configured) during
      // the active alarm window dismisses it. This runs as a side effect
      // alongside whatever normal checkpoint processing happens below —
      // the alarm's target tag is very likely also a real routine
      // checkpoint, so this must not swallow or replace that flow.
      if (alarmActive && checkpoint && (!settings?.alarmTargetCheckpointId || checkpoint.id === settings.alarmTargetCheckpointId)) {
        dismissAlarmForToday();
      }

      if (!checkpoint) {
        recordScanDiagnostics(uid, "unknown_tag");
        toast(`Unknown tag: ${uid}`, {
          duration: 5000,
          action: {
            label: "Register",
            onClick: () => {
              window.location.href = `/nfc-tags?uid=${uid}`;
            },
          },
        });
        console.debug("[Home] Unknown tag — not in local tag cache", uid);
        return;
      }

      try {
        const currentSessions = (routine?.sessions ?? []).map(toLocalSession);
        const result = processLocalScan(currentSessions, checkpoint, String(routine?.id ?? getCachedRoutineId() ?? ""));
        console.debug(`[Home] Local decision — action: ${result.action} | checkpoint: ${checkpoint.name}`);
        recordScanDiagnostics(uid, result.action);
        applyLocalResult(result, checkpoint.id);
      } catch (err: any) {
        // A LOCAL failure (bad data, storage error) — genuinely different
        // from a sync failure, and the one case that's still worth a loud
        // error, since nothing was recorded anywhere.
        console.error("[Home] Local scan processing failed:", err);
        setLastApiError(`Local processing error: ${err?.message ?? "unknown"}`);
        toast.error("Something went wrong reading that scan. Try again.");
      }
    },
    [checkpointsList, nfcTags, routine, applyLocalResult, alarmActive, settings, dismissAlarmForToday]
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

  // Phase 3, Feature 1 — while the alarm is active and NFC dismissal is
  // required, the lock overlay takes over the whole screen. This is an
  // early return placed after every hook call in this component (Rules of
  // Hooks), not a wrapping branch — useHomeNfc's listener stays alive
  // underneath since Home itself never unmounts, so the same scan that
  // dismisses the alarm can also complete a real checkpoint via the normal
  // handleScanResult path.
  if (alarmActive && settings?.alarmRequiresNfcDismissal) {
    return <AlarmLockOverlay onEmergencyDismiss={dismissAlarmForToday} />;
  }

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
    return (
      <div className="flex-1 flex flex-col relative">
        {lastApiError && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-destructive text-destructive-foreground p-3 rounded-xl shadow-lg animate-in slide-in-from-top-2">
            <p className="text-xs font-bold uppercase tracking-wider mb-1">Local Error</p>
            <p className="text-sm font-mono break-all">{lastApiError}</p>
            <button
              className="mt-2 text-[10px] underline"
              onClick={() => setLastApiError(null)}
            >
              Dismiss
            </button>
          </div>
        )}
        <EnergyPicker onStart={handleStart} isPending={startRoutine.isPending} />
      </div>
    );
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

  // Phase 3, Feature 5 — resolve enforcement per the checkpoint actually
  // being shown (in-progress or waiting), falling back to the global level.
  const checkpointsForEnforcement = checkpointsList ?? getCachedCheckpoints();
  const inProgressCheckpoint = checkpointsForEnforcement.find((c: any) => c.id === inProgressSession?.checkpointId);
  const nextCheckpoint = checkpointsForEnforcement.find((c: any) => c.id === nextSession?.checkpointId);
  const inProgressEnforcement = effectiveEnforcementLevel(settings?.enforcementLevel, inProgressCheckpoint?.enforcementOverride);
  const nextEnforcement = effectiveEnforcementLevel(settings?.enforcementLevel, nextCheckpoint?.enforcementOverride);

  return (
    <div className="flex-1 flex flex-col relative">
      {lastApiError && (
        <div className="absolute top-4 left-4 right-4 z-50 bg-destructive text-destructive-foreground p-3 rounded-xl shadow-lg animate-in slide-in-from-top-2">
          <p className="text-xs font-bold uppercase tracking-wider mb-1">Local Error</p>
          <p className="text-sm font-mono break-all">{lastApiError}</p>
          <button
            className="mt-2 text-[10px] underline"
            onClick={() => setLastApiError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Non-blocking sync status — the checkpoint is already saved locally;
          this just means the backend hasn't confirmed it yet. Never blocks
          the UI, per Phase 1 requirement #11. */}
      {syncPending && !lastApiError && (
        <div className="absolute top-4 left-4 right-4 z-40 bg-muted/95 backdrop-blur-sm text-muted-foreground text-xs px-3 py-2 rounded-xl shadow-sm flex items-center gap-2 animate-in slide-in-from-top-2">
          <CloudOff size={13} className="shrink-0" />
          <span>Saved on this device. Syncing with server…</span>
        </div>
      )}

      {stuckDialogSession && (
        <StuckSessionDialog session={stuckDialogSession} onChoice={handleStuckResolution} />
      )}

      {inProgressSession ? (
        <>
          <div className="flex-1 flex flex-col">
            <InProgressView
              session={inProgressSession}
              onScanResult={handleScanResult}
              enforcementLevel={inProgressEnforcement}
              frozenStage={frozenStage}
              setFrozenStage={setFrozenStage}
              frozenDestinationId={frozenDestinationId}
              setFrozenDestinationId={setFrozenDestinationId}
              logFrozenStep={logFrozenStep}
              destinationOptions={checkpointsForEnforcement}
            />
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

          {/* Bed mode dialog */}
          {bedModeDialog && (
            <BedModeDialog
              session={bedModeDialog.session}
              onClose={() => setBedModeDialog(null)}
            />
          )}
        </>
      ) : nextSession ? (
        <>
          <div className="flex-1 flex flex-col">
            <WaitingView session={nextSession} freezeThresholdSeconds={freezeThreshold} enforcementLevel={nextEnforcement} />
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

          {bedModeDialog && (
            <BedModeDialog
              session={bedModeDialog.session}
              onClose={() => setBedModeDialog(null)}
            />
          )}
        </>
      ) : (
        <ActiveRoutineEmpty routine={routine} onStart={handleStart} isPending={startRoutine.isPending} />
      )}
    </div>
  );
}

function ActiveRoutineEmpty({ routine, onStart, isPending }: { routine: any, onStart: any, isPending: boolean }) {
  // Active routine but empty/all done
  const allDone = (routine.sessions?.length ?? 0) > 0 &&
    routine.sessions?.every((s: any) => ["completed", "skipped", "missed", "cancelled"].includes(s.status));

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 size={48} className="text-primary" strokeWidth={1.5} />
      </div>
      <h2 className="text-3xl font-semibold mb-2">{allDone ? "All done." : "Ready to start?"}</h2>
      <p className="text-muted-foreground">{allDone ? "You can rest now." : "Choose how much energy you have today."}</p>
      {!allDone && (
        <div className="flex flex-col gap-3 w-full mt-10">
          <EnergyCard title="Full Energy" desc="All stations active." icon={Battery} color="bg-primary/10 text-primary" onClick={() => onStart("full")} disabled={isPending} />
          <EnergyCard title="Reduced" desc="Only the important things." icon={BatteryMedium} color="bg-secondary/10 text-secondary-foreground" onClick={() => onStart("reduced")} disabled={isPending} />
          <EnergyCard title="Survival" desc="Absolute essentials only." icon={BatteryWarning} color="bg-destructive/10 text-destructive" onClick={() => onStart("survival")} disabled={isPending} />
        </div>
      )}
      {allDone && (
        <button className="mt-8 text-sm text-muted-foreground underline underline-offset-4" onClick={() => onStart("full")}>
          Restart routine
        </button>
      )}
    </div>
  );
}

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

function BedModeDialog({
  session,
  onClose,
}: {
  session: any;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();

  const handleAction = (mode: string) => {
    sessionAction.mutate(
      { id: session.id, data: { action: "continue", mode } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          const messages: Record<string, string> = {
            working_from_bed: "Intentional bed work started.",
            resting: "Rest logged. No pressure.",
            frozen: "Transition support active.",
          };
          toast.success(messages[mode] ?? "Bed mode set.");
          onClose();
        },
      }
    );
  };

  return (
    <DialogPrimitive.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[90%] max-w-sm translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-xl rounded-3xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <h2 className="text-xl font-bold mb-2">Bed Station</h2>
          <p className="text-sm text-muted-foreground mb-6">How are we using the bed right now?</p>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => handleAction("working_from_bed")}
              className="rounded-2xl h-14 bg-primary/10 text-primary hover:bg-primary/20 border-none"
            >
              Working from bed
            </Button>
            <Button
              onClick={() => handleAction("resting")}
              variant="outline"
              className="rounded-2xl h-14"
            >
              Just resting
            </Button>
            <Button
              onClick={() => handleAction("frozen")}
              variant="outline"
              className="rounded-2xl h-14 border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              I am frozen / stuck
            </Button>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Stuck-session recovery ─────────────────────────────────────────────────
// A session left in_progress far longer than reasonable (Phase 1 requirement
// #8) — asks what actually happened instead of silently guessing, and never
// erases anything without a clear action from the user.

function StuckSessionDialog({ session, onChoice }: { session: any; onChoice: (choice: "still_doing_it" | "finished" | "stopped" | "cancel") => void }) {
  const startedAt = session.startedAt ? new Date(session.startedAt) : null;
  const hoursAgo = startedAt ? Math.round((Date.now() - startedAt.getTime()) / (60 * 60 * 1000)) : null;

  return (
    <DialogPrimitive.Root open={true} onOpenChange={(open) => !open && onChoice("still_doing_it")}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[90%] max-w-sm translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-xl rounded-3xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
          <h2 className="text-xl font-bold mb-2">Still on {session.checkpointName}?</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {hoursAgo != null ? `You started this ${hoursAgo === 0 ? "less than an hour" : `${hoursAgo} hour${hoursAgo === 1 ? "" : "s"}`} ago.` : "This session has been active for a while."}
            {" "}What happened?
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => onChoice("still_doing_it")} className="rounded-2xl h-12">Still doing it</Button>
            <Button variant="outline" className="rounded-2xl h-12" onClick={() => onChoice("finished")}>Finished but forgot to scan</Button>
            <Button variant="outline" className="rounded-2xl h-12" onClick={() => onChoice("stopped")}>Stopped</Button>
            <Button variant="ghost" className="rounded-2xl h-10 text-muted-foreground" onClick={() => onChoice("cancel")}>Cancel session</Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Phase 3, Feature 1 — the in-app half of the persistent morning alarm.
 * The OS notification alone can be swiped away; this full-screen overlay
 * re-asserts itself whenever the app is opened during the alarm window,
 * until dismissed via NFC (normal flow, see handleScanResult) or the
 * emergency fallback below (same 5-second-hold pattern as Phase 1's
 * EmergencyUnlock, since a persistent lock must never become a real trap).
 */
function AlarmLockOverlay({ onEmergencyDismiss }: { onEmergencyDismiss: () => void }) {
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
        console.warn("[AlarmLockOverlay] Emergency dismiss used.");
        onEmergencyDismiss();
      }
    }, TICK_MS);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col items-center justify-center px-8 text-center animate-in fade-in duration-300">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <AlertCircle size={40} className="text-primary" strokeWidth={1.5} />
      </div>
      <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">Morning Alarm</p>
      <h1 className="text-3xl font-bold tracking-tight mb-4">Time to get up.</h1>
      <p className="text-sm text-muted-foreground mb-12 max-w-xs">
        Scan your morning tag to dismiss.
      </p>

      <button
        className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center active:scale-95 transition-transform"
        style={{
          background: holding
            ? `conic-gradient(hsl(var(--destructive)) ${progress * 360}deg, hsl(var(--muted)) 0deg)`
            : undefined,
        }}
        onPointerDown={start}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        aria-label="Emergency dismiss — hold 5 seconds"
      >
        <AlertCircle size={20} className={holding ? "text-destructive-foreground" : "text-muted-foreground"} />
      </button>
      <p className="text-[10px] text-muted-foreground/70 mt-3 uppercase tracking-wider">Hold 5s — emergency dismiss</p>
    </div>
  );
}

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

function WaitingView({ session, freezeThresholdSeconds, enforcementLevel }: { session: any; freezeThresholdSeconds: number; enforcementLevel: string }) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();
  const [elapsed, setElapsed] = useState(0);
  const [freezeDismissed, setFreezeDismissed] = useState(false);

  useEffect(() => { setFreezeDismissed(false); setElapsed(0); }, [session.id]);

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

  const name: string = session.checkpointName ?? "Station";
  const parts = name.split(/\s*\+\s*/);
  const isNative = nfcService.isNative();

  const showSkip = enforcementLevel !== "strict";

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

      {showSkip && (
        <div className="flex items-center justify-center pb-6 pt-3">
          <button className="text-sm text-muted-foreground underline underline-offset-4 active:opacity-60" onClick={handleSkip} disabled={sessionAction.isPending}>
            Skip this one
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Phase 3, Features 7/8 — the Frozen Protocol. Four deliberately tiny
 * stages, in order: reduce demand -> change body state -> choose a
 * destination -> complete via NFC (stage 4 doesn't have its own "done"
 * button — it reuses the exact same scan-the-tag-again mechanic every
 * other in-progress checkpoint already uses, via useHomeNfc/handleScanResult
 * at the Home level; this component only guides the first three stages and
 * then gets out of the way). Every meaningful choice is logged via logStep
 * for Feature 8's future-Insights data, but nothing here blocks on that —
 * if the log call fails, the protocol still proceeds locally.
 */
const BODY_STATE_ACTIONS = [
  { key: "wiggle_toes", label: "Wiggle your toes" },
  { key: "feet_on_floor", label: "Put both feet on the floor" },
  { key: "sit_up", label: "Sit up" },
  { key: "one_deep_breath", label: "Take one deep breath" },
];

function FrozenProtocolView({
  session,
  stage,
  setStage,
  destinationId,
  setDestinationId,
  logStep,
  destinationOptions,
}: {
  session: any;
  stage: 1 | 2 | 3 | 4;
  setStage: (s: 1 | 2 | 3 | 4) => void;
  destinationId: number | null;
  setDestinationId: (id: number | null) => void;
  logStep: (step: string) => void;
  destinationOptions: any[];
}) {
  const otherStations = destinationOptions.filter((c: any) => c.id !== session.checkpointId);

  const advance = (step: string, event: Parameters<typeof advanceFrozenStage>[1]) => {
    logStep(step);
    setStage(advanceFrozenStage(stage, event));
  };

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-500 bg-primary/[0.03]">
      <div className="flex justify-center pt-8 pb-2">
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-destructive bg-destructive/10 px-4 py-1.5 rounded-full">
          Transition Support
        </span>
      </div>

      {/* 4-dot stage progress */}
      <div className="flex justify-center gap-1.5 pt-3">
        {[1, 2, 3, 4].map((s) => (
          <span key={s} className={`w-1.5 h-1.5 rounded-full ${s <= stage ? "bg-destructive" : "bg-border"}`} />
        ))}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {stage === 1 && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3">Stage 1 of 4</p>
            <h1 className="text-3xl font-bold tracking-tight mb-4">You're stuck. That's okay.</h1>
            <p className="text-sm text-muted-foreground mb-10 max-w-xs">
              Nothing needs to happen fast. This isn't about the whole routine — just the next thirty seconds.
            </p>
            <button
              onClick={() => advance("stage1:acknowledged", "stage1_acknowledged")}
              className="w-full max-w-xs h-14 rounded-2xl bg-primary text-primary-foreground font-bold active:scale-[0.98] transition-transform"
            >
              Okay
            </button>
          </>
        )}

        {stage === 2 && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3">Stage 2 of 4</p>
            <h1 className="text-2xl font-bold tracking-tight mb-6">Just move one thing.</h1>
            <div className="flex flex-col gap-3 w-full max-w-xs mb-4">
              {BODY_STATE_ACTIONS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => advance(`stage2:${a.key}`, "stage2_action_done")}
                  className="bg-card border border-border/60 rounded-2xl px-4 py-4 text-sm font-semibold text-foreground shadow-sm active:scale-[0.98] transition-transform"
                >
                  {a.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => advance("stage2:too_hard", "stage2_too_hard")}
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              Even that's too hard right now
            </button>
          </>
        )}

        {stage === 3 && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3">Stage 3 of 4</p>
            <h1 className="text-2xl font-bold tracking-tight mb-6">Where are you headed?</h1>
            <div className="flex flex-col gap-3 w-full max-w-xs mb-4 max-h-[40vh] overflow-y-auto no-scrollbar">
              {otherStations.map((cp: any) => (
                <button
                  key={cp.id}
                  onClick={() => {
                    setDestinationId(cp.id);
                    advance(`stage3:destination:${cp.id}`, "stage3_destination_chosen");
                  }}
                  className={`rounded-2xl px-4 py-4 text-sm font-semibold text-left transition-transform active:scale-[0.98] ${
                    destinationId === cp.id ? "bg-primary/10 text-primary border border-primary/30" : "bg-card border border-border/60 text-foreground shadow-sm"
                  }`}
                >
                  {cp.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setDestinationId(null);
                advance("stage3:destination:unspecified", "stage3_unspecified");
              }}
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              Not sure yet
            </button>
          </>
        )}

        {stage === 4 && (
          <>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground mb-3">Stage 4 of 4</p>
            <h1 className="text-2xl font-bold tracking-tight mb-6">Ready when you are.</h1>
            <div className="w-full max-w-xs rounded-3xl border-2 border-dashed border-border p-6 flex flex-col items-center gap-2 mb-4">
              <Smartphone size={28} className="text-muted-foreground" strokeWidth={1.5} />
              <p className="font-bold tracking-widest text-xs uppercase text-primary">Scan to clear</p>
              <p className="text-sm text-muted-foreground text-center">
                Scan the <strong>same NFC tag</strong> again once you're up.
              </p>
            </div>
            <button
              onClick={() => setStage(advanceFrozenStage(stage, "stage4_back"))}
              className="text-xs text-muted-foreground underline underline-offset-4"
            >
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function InProgressView({
  session,
  onScanResult: _onScanResult,
  enforcementLevel,
  frozenStage,
  setFrozenStage,
  frozenDestinationId,
  setFrozenDestinationId,
  logFrozenStep,
  destinationOptions,
}: {
  session: any;
  onScanResult?: (uid: string) => void;
  enforcementLevel: string;
  frozenStage?: 1 | 2 | 3 | 4;
  setFrozenStage?: (s: 1 | 2 | 3 | 4) => void;
  frozenDestinationId?: number | null;
  setFrozenDestinationId?: (id: number | null) => void;
  logFrozenStep?: (step: string) => void;
  destinationOptions?: any[];
}) {
  const sessionAction = useSessionAction();
  const queryClient = useQueryClient();

  const isFrozen = session.mode === "frozen";
  const isFocused = enforcementLevel === "focused";

  if (isFrozen) {
    return (
      <FrozenProtocolView
        session={session}
        stage={frozenStage ?? 1}
        setStage={setFrozenStage ?? (() => {})}
        destinationId={frozenDestinationId ?? null}
        setDestinationId={setFrozenDestinationId ?? (() => {})}
        logStep={logFrozenStep ?? (() => {})}
        destinationOptions={destinationOptions ?? []}
      />
    );
  }

  const serverTargetMins = isFrozen ? 0 : (session.targetDurationMinutes || session.checkpointDefaultDurationMinutes || 0);
  const minMins = isFrozen ? 0 : (session.minDurationMinutes || session.checkpointMinDurationMinutes || 0);

  const [localAddedMins, setLocalAddedMins] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const lastServerTargetRef = useRef(serverTargetMins);

  useEffect(() => {
    const start = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  useEffect(() => {
    if (serverTargetMins > lastServerTargetRef.current) {
      const diff = serverTargetMins - lastServerTargetRef.current;
      setLocalAddedMins(prev => Math.max(0, prev - diff));
    }
    lastServerTargetRef.current = serverTargetMins;
  }, [serverTargetMins]);

  useEffect(() => { setLocalAddedMins(0); lastServerTargetRef.current = serverTargetMins; }, [session.id]);

  const totalTargetSecs = (serverTargetMins + localAddedMins) * 60;
  const isZeroDuration = serverTargetMins === 0 && localAddedMins === 0;
  const displaySecs = isZeroDuration ? elapsed : Math.max(0, totalTargetSecs - elapsed);
  const countingDown = !isZeroDuration;
  const minElapsed = elapsed >= minMins * 60;
  const targetReached = isZeroDuration ? false : elapsed >= totalTargetSecs;
  const showReturnScan = minElapsed || targetReached;

  const handleExtend = (mins: number) => {
    setLocalAddedMins(prev => prev + mins);
    sessionAction.mutate(
      { id: session.id, data: { action: "extend_time", additionalMinutes: mins } },
      {
        onSuccess: (updatedSession) => {
            const totalRemainingSecs = (updatedSession.targetDurationMinutes || 0) * 60 - elapsed;
            // Note: settings isn't threaded into this leaf component, so this
            // extend-time reschedule doesn't re-check quiet hours — matches
            // the original session's gating, which was already applied when
            // the timer was first scheduled from applyLocalResult() above.
            notificationService.scheduleTimerEnd(session.checkpointName, totalRemainingSecs);
        },
        onError: () => {
          setLocalAddedMins(prev => Math.max(0, prev - mins));
          toast.error("Failed to add time");
        }
      }
    );
  };

  const handleDismiss = () => {
    sessionAction.mutate({ id: session.id, data: { action: "cancel" } }, {
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
            toast("Transition dismissed.");
        }
    });
  };

  const name: string = session.checkpointName ?? "Station";
  const parts = name.split(/\s*\+\s*/);

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-500 bg-primary/[0.03] relative">
      {isFocused && (
        <button
            onClick={handleDismiss}
            className="absolute top-8 right-6 p-2 rounded-full bg-muted/50 text-muted-foreground hover:bg-muted active:scale-95 transition-all z-10"
        >
            <X size={20} />
        </button>
      )}

      <div className="flex justify-center pt-8 pb-2">
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary bg-primary/10 px-4 py-1.5 rounded-full">
          In Progress
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <LucideIcon name={session.checkpointIcon} size={32} className="text-primary" strokeWidth={1.5} />
        </div>

        <h1 className="font-extrabold tracking-tight leading-none mb-8" style={{ fontSize: "clamp(2.5rem, 12vw, 4.5rem)" }}>
          {parts.map((part, i) => (
            <span key={i} className="block">
              {i > 0 && <span className="block text-2xl text-muted-foreground font-normal my-1">+</span>}
              {part.toUpperCase()}
            </span>
          ))}
        </h1>

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
    </div>
  );
}
