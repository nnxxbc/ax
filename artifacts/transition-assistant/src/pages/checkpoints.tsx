import { useState } from "react";
import {
  useListCheckpoints,
  useUpdateCheckpoint,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Clock, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { LucideIcon } from "./checkpoint-icon";

// Minute presets (all checkpoints)
const MINUTE_PRESETS = [0, 5, 10, 15, 20, 25, 30, 45, 60];

// Second presets shown only for sub-minute capable checkpoints (Out of Bed)
const SECOND_PRESETS = [
  { label: "10s", value: 10 / 60 },
  { label: "15s", value: 15 / 60 },
  { label: "30s", value: 30 / 60 },
  { label: "45s", value: 45 / 60 },
  { label: "60s", value: 60 / 60 },
];

function isSubMinuteCapable(name: string) {
  return name.toLowerCase().includes("out of bed") || name.toLowerCase().includes("bed");
}

function displayDuration(mins: number) {
  if (mins === 0) return "No timer";
  if (mins < 1) return `${Math.round(mins * 60)}s`;
  return `${mins} min`;
}

function isCloseTo(a: number, b: number, eps = 0.02) {
  return Math.abs(a - b) < eps;
}

export function Checkpoints() {
  const queryClient = useQueryClient();
  const { data: checkpoints, isLoading } = useListCheckpoints({
    query: { queryKey: getListCheckpointsQueryKey() },
  });
  const updateCheckpoint = useUpdateCheckpoint();
  const [editing, setEditing] = useState<any | null>(null);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  const sorted = [...(Array.isArray(checkpoints) ? checkpoints : [])].sort((a, b) => a.order - b.order);

  const handleSave = (id: number, mins: number) => {
    updateCheckpoint.mutate(
      {
        id,
        data: {
          defaultDurationMinutes: mins,
          minDurationMinutes: Math.min(mins, editing?.minDurationMinutes ?? mins),
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
          toast.success("Duration saved");
          setEditing(null);
        },
        onError: () => toast.error("Failed to save"),
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col pb-8">
      <div className="pt-8 pb-4 px-6">
        <h1 className="text-3xl font-bold tracking-tight">Checkpoints</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Tap a station to change its default duration.
        </p>
      </div>

      <div className="flex flex-col gap-1 px-4">
        {sorted.map(cp => (
          <button
            key={cp.id}
            className="w-full flex items-center gap-4 bg-card border border-border/40 rounded-2xl px-4 py-4 shadow-sm active:scale-[0.98] transition-transform hover:border-primary/30 text-left"
            onClick={() => setEditing(cp)}
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <LucideIcon name={cp.icon} size={22} className="text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base truncate">{cp.name}</p>
              <p className="text-sm text-muted-foreground">{displayDuration(cp.defaultDurationMinutes)}</p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground/50 shrink-0" />
          </button>
        ))}
      </div>

      {editing && (
        <DurationSheet
          checkpoint={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          isPending={updateCheckpoint.isPending}
        />
      )}
    </div>
  );
}

function DurationSheet({
  checkpoint,
  onSave,
  onClose,
  isPending,
}: {
  checkpoint: any;
  onSave: (id: number, mins: number) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [selected, setSelected] = useState<number>(checkpoint.defaultDurationMinutes ?? 0);
  const subMinute = isSubMinuteCapable(checkpoint.name);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[430px] bg-background rounded-t-[2rem] shadow-2xl animate-in slide-in-from-bottom-4 duration-300 pb-10">
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* title row */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LucideIcon name={checkpoint.icon} size={20} className="text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">{checkpoint.name}</p>
              <p className="text-xs text-muted-foreground">Default duration</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted active:scale-95">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* current selection display */}
        <div className="flex items-center justify-center gap-2 py-3">
          <Clock size={20} className="text-primary" />
          <span className="text-3xl font-bold text-primary">{displayDuration(selected)}</span>
        </div>

        {/* seconds presets — only for sub-minute capable stations */}
        {subMinute && (
          <>
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground text-center mb-2">Seconds</p>
            <div className="grid grid-cols-5 gap-2 px-6 mb-3">
              {SECOND_PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => setSelected(p.value)}
                  className={`rounded-xl py-3 text-sm font-semibold transition-all active:scale-95 ${
                    isCloseTo(selected, p.value)
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted text-foreground hover:bg-muted/80"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground text-center mb-2">Minutes</p>
          </>
        )}

        {/* minute presets */}
        <div className="grid grid-cols-3 gap-3 px-6 py-2">
          {MINUTE_PRESETS.map(m => (
            <button
              key={m}
              onClick={() => setSelected(m)}
              className={`rounded-2xl py-4 text-base font-semibold transition-all active:scale-95 ${
                isCloseTo(selected, m)
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              {m === 0 ? "No timer" : `${m} min`}
            </button>
          ))}
        </div>

        {/* save */}
        <div className="px-6 pt-4">
          <button
            onClick={() => onSave(checkpoint.id, selected)}
            disabled={isPending}
            className="w-full bg-primary text-primary-foreground font-semibold text-lg rounded-[2rem] py-5 active:scale-[0.98] transition-transform disabled:opacity-60 shadow-lg shadow-primary/20"
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
