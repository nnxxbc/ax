import { useEffect, useState, useRef } from "react";
import {
  useGetTodayRoutine,
  useStartTodayRoutine,
  getGetTodayRoutineQueryKey,
  getGetTodaySummaryQueryKey,
  useSessionAction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Battery, BatteryMedium, BatteryWarning, CheckCircle2, MapPin, Smartphone, Plus } from "lucide-react";
import { toast } from "sonner";
import { LucideIcon } from "./checkpoint-icon";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(secs: number) {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

// ─── Home ─────────────────────────────────────────────────────────────────────

export function Home() {
  const queryClient = useQueryClient();
  const { data: routine, isLoading } = useGetTodayRoutine({
    query: { queryKey: getGetTodayRoutineQueryKey(), refetchInterval: 3000 },
  });
  const startRoutine = useStartTodayRoutine();

  // track flash when a session completes
  const [completedName, setCompletedName] = useState<string | null>(null);
  const prevInProgressRef = useRef<any>(null);

  const inProgressSession = routine?.sessions?.find((s: any) => s.status === "in_progress");
  const nextSession = routine?.sessions?.find((s: any) => s.status === "waiting");

  // detect transition: in_progress → gone → show flash
  useEffect(() => {
    const prev = prevInProgressRef.current;
    if (prev && !inProgressSession) {
      setCompletedName(prev.checkpointName ?? "Station");
      const t = setTimeout(() => setCompletedName(null), 2000);
      return () => clearTimeout(t);
    }
    prevInProgressRef.current = inProgressSession ?? null;
  }, [inProgressSession]);

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

  // brief completion flash
  if (completedName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300 text-center bg-primary/5">
        <div className="w-28 h-28 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={56} className="text-primary" strokeWidth={1.5} />
        </div>
        <p className="text-sm font-bold tracking-widest uppercase text-muted-foreground mb-2">Complete</p>
        <h2 className="text-3xl font-semibold tracking-tight">{completedName}</h2>
      </div>
    );
  }

  // no routine / abandoned → energy mode picker
  if (!routine || routine.status === "abandoned") {
    return <EnergyPicker onStart={handleStart} isPending={startRoutine.isPending} />;
  }

  // routine completed
  if (routine.status === "completed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={48} className="text-primary" strokeWidth={1.5} />
        </div>
        <h2 className="text-3xl font-semibold mb-2">All done.</h2>
        <p className="text-muted-foreground">You can rest now.</p>
        <button
          className="mt-12 text-sm text-muted-foreground underline underline-offset-4"
          onClick={() => handleStart("full")}
        >
          Restart routine
        </button>
      </div>
    );
  }

  if (inProgressSession) {
    return <InProgressView session={inProgressSession} />;
  }

  if (nextSession) {
    return <WaitingView session={nextSession} />;
  }

  // active routine, all sessions done / empty
  const allDone =
    routine.sessions.length > 0 &&
    routine.sessions.every((s: any) =>
      ["completed", "skipped", "missed", "cancelled"].includes(s.status)
    );

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 size={48} className="text-primary" strokeWidth={1.5} />
      </div>
      <h2 className="text-3xl font-semibold mb-2">{allDone ? "All done." : "Ready to start?"}</h2>
      <p className="text-muted-foreground">
        {allDone ? "You can rest now." : "Choose how much energy you have today."}
      </p>
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

function WaitingView({ session }: { session: any }) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();

  const handleSkip = () => {
    sessionAction.mutate(
      { id: session.id, data: { action: "skip" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
          toast("Station skipped.");
        },
      }
    );
  };

  // For simulation fallback: start manually
  const handleStartManual = () => {
    sessionAction.mutate(
      { id: session.id, data: { action: "start" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        },
      }
    );
  };

  const name: string = session.checkpointName ?? "Station";
  const parts = name.split(/\s*\+\s*/);

  return (
    <div className="flex-1 flex flex-col animate-in slide-in-from-bottom-4 duration-500">
      {/* status pill */}
      <div className="flex justify-center pt-8 pb-2">
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-muted-foreground bg-muted px-4 py-1.5 rounded-full">
          Next Stop
        </span>
      </div>

      {/* main content — centred */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        {/* icon */}
        <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-6">
          <LucideIcon name={session.checkpointIcon} size={40} className="text-primary" strokeWidth={1.5} />
        </div>

        {/* station name — very large */}
        <h1 className="text-5xl font-bold tracking-tight leading-none mb-6">
          {parts.map((part, i) => (
            <span key={i}>
              {i > 0 && <span className="block text-3xl text-muted-foreground font-light my-1">+</span>}
              {part.toUpperCase()}
            </span>
          ))}
        </h1>

        {/* location */}
        {session.checkpointLocation && (
          <div className="flex items-center gap-1.5 text-muted-foreground text-sm mb-8">
            <MapPin size={14} />
            <span>{session.checkpointLocation}</span>
          </div>
        )}

        {/* NFC instruction */}
        <p className="text-base text-muted-foreground">
          Go to this station and scan your NFC tag.
        </p>
      </div>

      {/* subtle simulation fallback */}
      <div className="flex items-center justify-center gap-6 pb-8 pt-4">
        <button
          className="text-sm text-muted-foreground underline underline-offset-4 active:opacity-60"
          onClick={handleStartManual}
          disabled={sessionAction.isPending}
        >
          Start without NFC
        </button>
        <span className="text-muted-foreground/40">·</span>
        <button
          className="text-sm text-muted-foreground underline underline-offset-4 active:opacity-60"
          onClick={handleSkip}
          disabled={sessionAction.isPending}
        >
          Skip this one
        </button>
      </div>
    </div>
  );
}

// ─── In-progress view ─────────────────────────────────────────────────────────

function InProgressView({ session }: { session: any }) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();
  const targetMins: number = session.targetDurationMinutes ?? session.defaultDurationMinutes ?? 0;
  const minMins: number = session.minDurationMinutes ?? 0;

  // local added-minutes (optimistic before API confirms)
  const [addedMins, setAddedMins] = useState(0);
  // elapsed seconds
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.startedAt]);

  // reset added mins when session changes
  useEffect(() => { setAddedMins(0); }, [session.id]);

  const totalTargetSecs = (targetMins + addedMins) * 60;
  const isZeroDuration = targetMins === 0 && addedMins === 0;

  // if target is 0, count UP; otherwise count DOWN
  const displaySecs = isZeroDuration ? elapsed : Math.max(0, totalTargetSecs - elapsed);
  const countingDown = !isZeroDuration;
  const minElapsed = elapsed >= minMins * 60;
  const targetReached = isZeroDuration ? true : elapsed >= totalTargetSecs;
  const showReturnScan = minElapsed || targetReached;

  const handleExtend = (mins: number) => {
    setAddedMins((prev) => prev + mins);
    sessionAction.mutate(
      { id: session.id, data: { action: "extend_time", additionalMinutes: mins } },
      { onError: () => setAddedMins((prev) => prev - mins) }
    );
  };

  const handleCompleteManual = () => {
    sessionAction.mutate(
      { id: session.id, data: { action: "complete" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        },
      }
    );
  };

  const name: string = session.checkpointName ?? "Station";
  const parts = name.split(/\s*\+\s*/);

  return (
    <div className="flex-1 flex flex-col animate-in fade-in duration-500 bg-primary/[0.03]">
      {/* top status pill */}
      <div className="flex justify-center pt-8 pb-2">
        <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-primary bg-primary/10 px-4 py-1.5 rounded-full">
          In Progress
        </span>
      </div>

      {/* main scrollable content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* icon */}
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <LucideIcon name={session.checkpointIcon} size={32} className="text-primary" strokeWidth={1.5} />
        </div>

        {/* task name — DOMINANT */}
        <h1 className="text-5xl font-extrabold tracking-tight leading-none mb-8" style={{ fontSize: "clamp(2.5rem, 12vw, 4.5rem)" }}>
          {parts.map((part, i) => (
            <span key={i} className="block">
              {i > 0 && <span className="block text-2xl text-muted-foreground font-normal my-1">+</span>}
              {part.toUpperCase()}
            </span>
          ))}
        </h1>

        {/* timer */}
        <div className="mb-2">
          <span className="font-light tabular-nums text-primary" style={{ fontSize: "clamp(3.5rem, 16vw, 6rem)", lineHeight: 1 }}>
            {fmtTime(displaySecs)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {countingDown ? (targetReached ? "Time's up" : "Remaining") : "Elapsed"}
        </p>

        {/* +time buttons */}
        <div className="flex gap-3 mb-10">
          {[5, 10, 30].map((m) => (
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

      {/* manual complete fallback — very subtle */}
      <div className="flex justify-center pb-8 pt-4">
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
