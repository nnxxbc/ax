import { useState } from "react";
import {
  useListCheckpoints,
  useUpdateCheckpoint,
  useCreateCheckpoint,
  useDeleteCheckpoint,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Clock, ChevronRight, ChevronUp, ChevronDown, X, Plus, Trash2, SmartphoneNfc, Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { LucideIcon } from "./checkpoint-icon";
import { Button } from "@/components/ui/button";

// Minute presets
const MINUTE_PRESETS = [0, 5, 10, 15, 20, 25, 30, 45, 60];

// Day-of-week picker, 0=Sunday..6=Saturday — mirrors settings-alarm.tsx's DAYS.
const DAYS = [
  { day: 0, label: "S" },
  { day: 1, label: "M" },
  { day: 2, label: "T" },
  { day: 3, label: "W" },
  { day: 4, label: "T" },
  { day: 5, label: "F" },
  { day: 6, label: "S" },
];
const DAY_ABBREV = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDaysOfWeek(daysOfWeek: number[] | undefined | null) {
  if (!daysOfWeek || daysOfWeek.length === 0) return null;
  return [...daysOfWeek].sort().map((d) => DAY_ABBREV[d]).join(", ");
}

// Second presets for sub-minute capable
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
  const createCheckpoint = useCreateCheckpoint();
  const updateCheckpoint = useUpdateCheckpoint();
  const deleteCheckpoint = useDeleteCheckpoint();
  const [editing, setEditing] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  const sorted = [...(Array.isArray(checkpoints) ? checkpoints : [])].sort((a, b) => a.order - b.order);

  const handleSave = (id: number | null, data: any) => {
    if (id) {
      updateCheckpoint.mutate(
        { id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
            toast.success("Checkpoint updated");
            setEditing(null);
          },
          onError: () => toast.error("Failed to update"),
        }
      );
    } else {
      createCheckpoint.mutate(
        { data: { ...data, order: sorted.length + 1, icon: data.icon || "MapPin" } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
            toast.success("Checkpoint created");
            setIsAdding(false);
          },
          onError: () => toast.error("Failed to create"),
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this checkpoint? History will be preserved but the checkpoint itself will be gone.")) return;
    deleteCheckpoint.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
          toast.success("Checkpoint deleted");
          setEditing(null);
        },
        onError: () => toast.error("Failed to delete"),
      }
    );
  };

  const handleReorder = (id: number, direction: "up" | "down") => {
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    if (a.order === b.order) return;
    updateCheckpoint.mutate(
      { id: a.id, data: { order: b.order } },
      { onError: () => toast.error("Failed to reorder") }
    );
    updateCheckpoint.mutate(
      { id: b.id, data: { order: a.order } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() }),
        onError: () => toast.error("Failed to reorder"),
      }
    );
  };

  return (
    <div className="flex-1 flex flex-col pb-8">
      <div className="pt-8 pb-4 px-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Checkpoints</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Manage your daily routine stations.
          </p>
        </div>
        <Button size="icon" className="rounded-full" onClick={() => setIsAdding(true)}>
          <Plus />
        </Button>
      </div>

      <div className="flex flex-col gap-2 px-4">
        {sorted.map((cp, idx) => {
          const dayLabel = formatDaysOfWeek(cp.daysOfWeek);
          return (
          <div
            key={cp.id}
            className={`w-full flex items-stretch gap-2 bg-card border rounded-2xl pr-2 shadow-sm transition-all ${
                cp.isActive ? "border-border/40 hover:border-primary/30" : "opacity-60 border-dashed border-border/60 grayscale"
            }`}
          >
            <button
              className="flex-1 flex items-center gap-4 px-4 py-4 text-left active:scale-[0.98] transition-all min-w-0"
              onClick={() => setEditing(cp)}
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cp.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <LucideIcon name={cp.icon} size={22} strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-base truncate">{cp.name}</p>
                  {cp.isRequired && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">Required</span>}
                  {cp.type !== 'standard' && <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">{cp.type.replace('_', ' ')}</span>}
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                  <span>{displayDuration(cp.defaultDurationMinutes)}</span>
                  {dayLabel && <span className="text-primary font-medium truncate">• {dayLabel}</span>}
                </p>
              </div>
              <ChevronRight size={18} className="text-muted-foreground/50 shrink-0" />
            </button>
            <div className="flex flex-col justify-center gap-0.5 shrink-0">
              <button
                aria-label="Move up"
                disabled={idx === 0}
                onClick={() => handleReorder(cp.id, "up")}
                className="p-1 rounded-lg text-muted-foreground disabled:opacity-20 hover:bg-muted active:scale-95"
              >
                <ChevronUp size={16} />
              </button>
              <button
                aria-label="Move down"
                disabled={idx === sorted.length - 1}
                onClick={() => handleReorder(cp.id, "down")}
                className="p-1 rounded-lg text-muted-foreground disabled:opacity-20 hover:bg-muted active:scale-95"
              >
                <ChevronDown size={16} />
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {(editing || isAdding) && (
        <EditSheet
          checkpoint={editing}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => { setEditing(null); setIsAdding(false); }}
          isPending={updateCheckpoint.isPending || createCheckpoint.isPending || deleteCheckpoint.isPending}
        />
      )}
    </div>
  );
}

function EditSheet({
  checkpoint,
  onSave,
  onDelete,
  onClose,
  isPending,
}: {
  checkpoint: any | null;
  onSave: (id: number | null, data: any) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(checkpoint?.name ?? "");
  const [desc, setDesc] = useState(checkpoint?.description ?? "");
  const [duration, setDuration] = useState<number>(checkpoint?.defaultDurationMinutes ?? 0);
  const [isRequired, setIsRequired] = useState<boolean>(checkpoint?.isRequired ?? true);
  const [isRepeatable, setIsRepeatable] = useState<boolean>(checkpoint?.isRepeatable ?? true);
  const [isActive, setIsActive] = useState<boolean>(checkpoint?.isActive ?? true);
  const [icon, setIcon] = useState(checkpoint?.icon ?? "MapPin");
  const [type, setType] = useState<string>(checkpoint?.type ?? "standard");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(checkpoint?.daysOfWeek ?? []);

  const subMinute = isSubMinuteCapable(name);

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  };

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    onSave(checkpoint?.id ?? null, {
      name,
      description: desc || null,
      defaultDurationMinutes: duration,
      minDurationMinutes: duration, // keeping them sync'd for simplicity in user UI
      isRequired,
      isRepeatable,
      isActive,
      icon,
      type,
      daysOfWeek,
      energyModes: checkpoint?.energyModes ?? ["full", "reduced", "survival"],
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full max-w-[430px] bg-background rounded-t-[2rem] shadow-2xl animate-in slide-in-from-bottom-4 duration-300 pb-10 max-h-[90vh] overflow-y-auto">
        {/* drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* title row */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LucideIcon name={icon} size={20} className="text-primary" strokeWidth={1.5} />
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">{checkpoint ? "Edit Station" : "New Station"}</p>
              <p className="text-xs text-muted-foreground">{checkpoint ? checkpoint.name : "Create a new routine stop"}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted active:scale-95">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 space-y-6">
          {/* Name & Desc */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Station Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Drink Water"
                className="w-full h-12 bg-muted/50 border-none rounded-2xl px-4 text-base focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Description</label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What should you do here?"
                className="w-full h-20 bg-muted/50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
             <ToggleButton
                label="Required"
                active={isRequired}
                onClick={() => setIsRequired(!isRequired)}
                description="Needs to be done for cycle"
             />
             <ToggleButton
                label="Repeatable"
                active={isRepeatable}
                onClick={() => setIsRepeatable(!isRepeatable)}
                description="Can be done multiple times"
             />
          </div>

          {/* Type Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Station Type</label>
            <div className="grid grid-cols-3 gap-2">
                {[
                    { key: 'standard', label: 'Standard', icon: 'Circle' },
                    { key: 'bed', label: 'Bed', icon: 'Bed' },
                    { key: 'leaving_home', label: 'Home/Door', icon: 'LogOut' },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setType(t.key)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border transition-all ${
                            type === t.key ? "bg-primary/5 border-primary/30 text-primary" : "bg-card border-border/40 text-muted-foreground"
                        }`}
                    >
                        <LucideIcon name={t.icon} size={18} />
                        <span className="text-[10px] font-bold uppercase tracking-tight">{t.label}</span>
                    </button>
                ))}
            </div>
          </div>

          {/* Days of week */}
          <div className="space-y-2">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Days</label>
              <span className="text-xs font-medium text-muted-foreground">
                {daysOfWeek.length === 0 ? "Every day" : formatDaysOfWeek(daysOfWeek)}
              </span>
            </div>
            <div className="flex gap-2">
              {DAYS.map(({ day, label }) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`flex-1 h-9 rounded-full text-xs font-bold transition-colors ${
                    daysOfWeek.includes(day) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground ml-1">Leave all unselected to run every day.</p>
          </div>

          {/* Duration */}
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Default Duration</label>
                <span className="text-sm font-bold text-primary">{displayDuration(duration)}</span>
            </div>

            {subMinute && (
              <div className="grid grid-cols-5 gap-2">
                {SECOND_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setDuration(p.value)}
                    className={`rounded-xl py-2.5 text-xs font-semibold transition-all ${
                      isCloseTo(duration, p.value) ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              {MINUTE_PRESETS.map(m => (
                <button
                  key={m}
                  onClick={() => setDuration(m)}
                  className={`rounded-xl py-3 text-sm font-semibold transition-all ${
                    isCloseTo(duration, m) ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m === 0 ? "None" : `${m}m`}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 flex flex-col gap-3">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="w-full bg-primary text-primary-foreground font-bold text-lg rounded-3xl py-4 active:scale-[0.98] transition-all shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {isPending ? "Saving…" : checkpoint ? "Save Changes" : "Create Station"}
            </button>

            {checkpoint && (
              <div className="flex gap-3">
                <Button
                    variant="outline"
                    className="flex-1 rounded-2xl h-12 gap-2"
                    onClick={() => window.location.href = `/nfc-tags?checkpointId=${checkpoint.id}`}
                >
                    <SmartphoneNfc size={16} />
                    Manage Tag
                </Button>
                <Button
                    variant="ghost"
                    className="flex-1 rounded-2xl h-12 text-destructive hover:bg-destructive/10 gap-2"
                    onClick={() => onDelete(checkpoint.id)}
                    disabled={isPending}
                >
                    <Trash2 size={16} />
                    Delete
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ToggleButton({ label, active, onClick, description }: any) {
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-start p-4 rounded-2xl border transition-all text-left active:scale-[0.98] ${
                active ? "bg-primary/5 border-primary/30" : "bg-card border-border/40"
            }`}
        >
            <div className="flex items-center justify-between w-full mb-1">
                <span className={`text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{label}</span>
                {active ? <Check size={14} className="text-primary" /> : <Circle size={14} className="text-border" />}
            </div>
            <span className="text-[10px] text-muted-foreground leading-tight">{description}</span>
        </button>
    );
}
