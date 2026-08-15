import * as React from "react";
import { useState, useRef } from "react";
import {
  useListCheckpoints,
  useUpdateCheckpoint,
  useCreateCheckpoint,
  useDeleteCheckpoint,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Clock, ChevronRight, GripVertical, X, Plus, Trash2, SmartphoneNfc, Check, Circle } from "lucide-react";
import { toast } from "sonner";
import { LucideIcon, ICON_OPTIONS } from "./checkpoint-icon";
import { Button } from "@/components/ui/button";

// Minute presets
const MINUTE_PRESETS = [0, 5, 10, 15, 20, 25, 30, 45, 60];

// Curated accent palette — flat, minimalistic tones. `null` means "use the
// app's default theme color" (the existing bg-primary/10 treatment).
const COLOR_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Default" },
  { value: "#f43f5e", label: "Rose" },
  { value: "#f97316", label: "Orange" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#10b981", label: "Emerald" },
  { value: "#14b8a6", label: "Teal" },
  { value: "#0ea5e9", label: "Sky" },
  { value: "#6366f1", label: "Indigo" },
  { value: "#8b5cf6", label: "Violet" },
  { value: "#ec4899", label: "Pink" },
];

// Tailwind can't compile classes for colors chosen at runtime, so a custom
// color falls back to an inline style (a translucent tint of the color as
// background, the color itself as the icon/text color); no custom color
// keeps using the original theme-aware Tailwind classes exactly as before.
function iconBadgeStyle(cp: any, isDragged?: boolean) {
  if (cp.color) {
    return {
      className: "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
      style: { backgroundColor: `${cp.color}1A`, color: cp.color },
    };
  }
  return {
    className: `w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
      cp.isActive || isDragged ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
    }`,
    style: undefined,
  };
}

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

  return <CheckpointsLoaded
    checkpoints={Array.isArray(checkpoints) ? checkpoints : []}
    editing={editing}
    setEditing={setEditing}
    isAdding={isAdding}
    setIsAdding={setIsAdding}
    createCheckpoint={createCheckpoint}
    updateCheckpoint={updateCheckpoint}
    deleteCheckpoint={deleteCheckpoint}
    queryClient={queryClient}
  />;
}

// Split out once loading is confirmed done, so hooks below (drag state, refs)
// never run before `checkpoints` actually has data — keeps the drag math
// (which reads real row heights on mount) from ever operating on an empty list.
function CheckpointsLoaded({
  checkpoints,
  editing,
  setEditing,
  isAdding,
  setIsAdding,
  createCheckpoint,
  updateCheckpoint,
  deleteCheckpoint,
  queryClient,
}: {
  checkpoints: any[];
  editing: any | null;
  setEditing: (v: any | null) => void;
  isAdding: boolean;
  setIsAdding: (v: boolean) => void;
  createCheckpoint: ReturnType<typeof useCreateCheckpoint>;
  updateCheckpoint: ReturnType<typeof useUpdateCheckpoint>;
  deleteCheckpoint: ReturnType<typeof useDeleteCheckpoint>;
  queryClient: ReturnType<typeof useQueryClient>;
}) {
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

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  // Deliberately not using a library here — this is a plain pointer-events
  // implementation so it works the same in the web preview and the Android
  // WebView with zero new native dependencies. DOM order stays fixed at
  // whatever it was when the drag started (`drag.snapshot`); everything
  // else — the dragged row following the finger, other rows sliding out of
  // the way — is done with CSS transforms computed from `drag`, so nothing
  // actually reflows (and therefore nothing jumps) until the drag ends and
  // the real order is committed.
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [drag, setDrag] = useState<{
    id: number;
    startY: number;
    deltaY: number;
    targetIdx: number;
    snapshot: typeof sorted;
    rowHeight: number;
  } | null>(null);

  const handleDragStart = (e: React.PointerEvent, cp: any) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const snapshot = sorted;
    const idx = snapshot.findIndex((c) => c.id === cp.id);
    const rowHeight = rowRefs.current[cp.id]?.getBoundingClientRect().height || 76;
    setDrag({ id: cp.id, startY: e.clientY, deltaY: 0, targetIdx: idx, snapshot, rowHeight });
  };

  const handleDragMove = (e: React.PointerEvent) => {
    setDrag((d) => {
      if (!d) return d;
      const deltaY = e.clientY - d.startY;
      const originalIdx = d.snapshot.findIndex((c) => c.id === d.id);
      const shiftSlots = Math.round(deltaY / d.rowHeight);
      const targetIdx = Math.max(0, Math.min(d.snapshot.length - 1, originalIdx + shiftSlots));
      return { ...d, deltaY, targetIdx };
    });
  };

  const handleDragEnd = () => {
    setDrag((d) => {
      if (!d) return null;
      const originalIdx = d.snapshot.findIndex((c) => c.id === d.id);
      if (d.targetIdx !== originalIdx) {
        const next = [...d.snapshot];
        const [item] = next.splice(originalIdx, 1);
        next.splice(d.targetIdx, 0, item);
        let anyChanged = false;
        next.forEach((cp, idx) => {
          const newOrder = idx + 1;
          if (cp.order !== newOrder) {
            anyChanged = true;
            updateCheckpoint.mutate(
              { id: cp.id, data: { order: newOrder } },
              { onError: () => toast.error("Failed to reorder") }
            );
          }
        });
        if (anyChanged) {
          setTimeout(() => queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() }), 300);
        }
      }
      return null;
    });
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
        {(drag ? drag.snapshot : sorted).map((cp, idx) => {
          const dayLabel = formatDaysOfWeek(cp.daysOfWeek);
          const isDragged = drag?.id === cp.id;

          // Other rows slide out of the dragged item's way by exactly one
          // slot when it's currently past their position, purely via
          // transform — DOM order (and therefore everyone's key/identity)
          // stays put until drop, so nothing reflows mid-drag.
          let shiftY = 0;
          if (drag && !isDragged) {
            const originalIdx = drag.snapshot.findIndex((c) => c.id === drag.id);
            if (originalIdx < drag.targetIdx && idx > originalIdx && idx <= drag.targetIdx) {
              shiftY = -drag.rowHeight;
            } else if (originalIdx > drag.targetIdx && idx >= drag.targetIdx && idx < originalIdx) {
              shiftY = drag.rowHeight;
            }
          }

          return (
          <div
            key={cp.id}
            ref={(el) => { rowRefs.current[cp.id] = el; }}
            style={{
              transform: `translateY(${isDragged ? drag!.deltaY : shiftY}px)`,
              transition: isDragged ? "none" : "transform 150ms ease",
              position: isDragged ? "relative" : "static",
              zIndex: isDragged ? 50 : "auto",
            }}
            className={`w-full flex items-stretch gap-2 bg-card border rounded-2xl pr-2 shadow-sm ${
                isDragged ? "shadow-xl scale-[1.02] border-primary/40" :
                cp.isActive ? "border-border/40 hover:border-primary/30" : "opacity-60 border-dashed border-border/60 grayscale"
            }`}
          >
            <button
              className="flex-1 flex items-center gap-4 px-4 py-4 text-left active:scale-[0.98] transition-all min-w-0"
              onClick={() => setEditing(cp)}
            >
              <div className={iconBadgeStyle(cp).className} style={iconBadgeStyle(cp).style}>
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
            <button
              aria-label={`Delete ${cp.name}`}
              onClick={() => handleDelete(cp.id)}
              className="flex items-center justify-center px-1.5 text-muted-foreground/50 hover:text-destructive active:scale-90 transition-all shrink-0"
            >
              <Trash2 size={17} />
            </button>
            <button
              aria-label="Drag to reorder"
              onPointerDown={(e) => handleDragStart(e, cp)}
              onPointerMove={handleDragMove}
              onPointerUp={handleDragEnd}
              onPointerCancel={handleDragEnd}
              className="flex items-center justify-center px-2 touch-none select-none text-muted-foreground/60 cursor-grab active:cursor-grabbing active:text-primary shrink-0"
            >
              <GripVertical size={18} />
            </button>
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
  const [color, setColor] = useState<string | null>(checkpoint?.color ?? null);
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
      color,
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
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${color ? "" : "bg-primary/10"}`}
              style={color ? { backgroundColor: `${color}1A` } : undefined}
            >
              <LucideIcon name={icon} size={20} className={color ? "" : "text-primary"} style={color ? { color } : undefined} strokeWidth={1.5} />
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
             <ToggleButton
                label="Active"
                active={isActive}
                onClick={() => setIsActive(!isActive)}
                description={isActive ? "Shows up in your routine" : "Paused — hidden, but tag & history stay"}
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

          {/* Icon */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map((name) => (
                <button
                  key={name}
                  onClick={() => setIcon(name)}
                  aria-label={name}
                  className={`aspect-square rounded-2xl border flex items-center justify-center transition-all ${
                    icon === name
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-card"
                  }`}
                  style={icon === name && color ? { backgroundColor: `${color}1A`, borderColor: color } : undefined}
                >
                  <LucideIcon
                    name={name}
                    size={19}
                    strokeWidth={1.5}
                    className={icon === name ? (color ? "" : "text-primary") : "text-muted-foreground"}
                    style={icon === name && color ? { color } : undefined}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Color</label>
            <div className="flex flex-wrap gap-3">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setColor(opt.value)}
                  aria-label={opt.label}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    opt.value ? "" : "bg-muted"
                  } ${color === opt.value ? "ring-2 ring-offset-2 ring-offset-background ring-primary/60 scale-110" : ""}`}
                  style={opt.value ? { backgroundColor: opt.value } : undefined}
                >
                  {color === opt.value && (
                    <Check size={14} className={opt.value ? "text-white" : "text-muted-foreground"} strokeWidth={3} />
                  )}
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
