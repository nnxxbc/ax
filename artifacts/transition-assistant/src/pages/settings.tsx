import { useState } from "react";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  useListCheckpoints,
  useUpdateCheckpoint,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import type { Checkpoint } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Vibrate, Bell, Wrench, SmartphoneNfc, Clock, ChevronUp, ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { LucideIcon } from "./checkpoint-icon";
import { StationEditSheet } from "./station-edit-sheet";

export function Settings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!settings) return null;

  const handleToggle = (key: keyof typeof settings, value: boolean) => {
    updateSettings.mutate(
      { data: { [key]: value } as any },
      {
        onSuccess: () => {
          queryClient.setQueryData(getGetSettingsQueryKey(), (old: any) => ({ ...old, [key]: value }));
        },
        onError: () => toast.error("Failed to update setting")
      }
    );
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-6">
      <div className="pt-6 px-2">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Settings</h1>
      </div>

      <div className="space-y-4">

        {/* Stations section */}
        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-2">Stations</h2>
        <StationsSection />

        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mt-6 mb-2">Notifications</h2>
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-0 divide-y divide-border/50">
            <SettingRow
              icon={Bell}
              label="Notifications"
              desc="Gentle nudges when time is up"
              checked={!!settings.notificationsEnabled}
              onCheckedChange={(c: boolean) => handleToggle('notificationsEnabled', c)}
            />
            <SettingRow
              icon={Vibrate}
              label="Vibration"
              desc="Haptic feedback on actions"
              checked={!!settings.vibrationEnabled}
              onCheckedChange={(c: boolean) => handleToggle('vibrationEnabled', c)}
            />
            <SettingRow
              icon={Volume2}
              label="Sound"
              desc="Soft chimes"
              checked={!!settings.soundEnabled}
              onCheckedChange={(c: boolean) => handleToggle('soundEnabled', c)}
            />
          </CardContent>
        </Card>

        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mt-6 mb-2">Hardware</h2>
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-0">
            <Link href="/nfc-tags" className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors active:bg-muted">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <SmartphoneNfc size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">NFC Tag Manager</h3>
                <p className="text-sm text-muted-foreground">Pair tags to stations</p>
              </div>
            </Link>
          </CardContent>
        </Card>

        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mt-6 mb-2">Freeze Intervention</h2>
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Clock size={18} className="text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">Stuck detection</p>
                <p className="text-xs text-muted-foreground">Show intervention after this many seconds on the waiting screen</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0, 15, 30, 60, 90, 120, 180, 300].map(s => (
                <button
                  key={s}
                  onClick={() => {
                    updateSettings.mutate(
                      { data: { freezeStuckThresholdSeconds: s } as any },
                      { onSuccess: () => queryClient.setQueryData(getGetSettingsQueryKey(), (old: any) => ({ ...old, freezeStuckThresholdSeconds: s })) }
                    );
                  }}
                  className={`rounded-2xl py-3 text-sm font-semibold transition-all active:scale-95 ${
                    (settings.freezeStuckThresholdSeconds ?? 30) === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground hover:bg-muted/80"
                  }`}
                >
                  {s === 0 ? "Off" : s < 60 ? `${s}s` : `${s / 60}m`}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mt-6 mb-2">Advanced</h2>
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-0">
            <SettingRow
              icon={Wrench}
              label="Developer Mode"
              desc="Show dev tools tab"
              checked={!!settings.developerModeEnabled}
              onCheckedChange={(c: boolean) => handleToggle('developerModeEnabled', c)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Stations section ────────────────────────────────────────────────────────

const ENERGY_MODE_LABELS: Record<string, string> = {
  full: "Full",
  reduced: "Reduced",
  survival: "Survival",
};

function StationsSection() {
  const queryClient = useQueryClient();
  const { data: checkpoints, isLoading } = useListCheckpoints({
    query: { queryKey: getListCheckpointsQueryKey() },
  });
  const updateCheckpoint = useUpdateCheckpoint();

  const [editingCheckpoint, setEditingCheckpoint] = useState<Checkpoint | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="animate-spin text-primary w-6 h-6" />
      </div>
    );
  }

  const sorted = [...(checkpoints ?? [])].sort((a, b) => a.order - b.order);

  const handleMove = (checkpoint: Checkpoint, direction: "up" | "down") => {
    const idx = sorted.findIndex((c) => c.id === checkpoint.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const other = sorted[swapIdx];
    const myNewOrder = other.order;
    const otherNewOrder = checkpoint.order;

    // Optimistically reorder in cache
    queryClient.setQueryData(getListCheckpointsQueryKey(), (old: Checkpoint[] | undefined) => {
      if (!old) return old;
      return old.map((c) => {
        if (c.id === checkpoint.id) return { ...c, order: myNewOrder };
        if (c.id === other.id) return { ...c, order: otherNewOrder };
        return c;
      });
    });

    updateCheckpoint.mutate(
      { id: checkpoint.id, data: { order: myNewOrder } },
      {
        onError: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
          toast.error("Failed to reorder station");
        },
      }
    );
    updateCheckpoint.mutate(
      { id: other.id, data: { order: otherNewOrder } },
      {
        onError: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
          toast.error("Failed to reorder station");
        },
      }
    );
  };

  const openEdit = (checkpoint: Checkpoint) => {
    setEditingCheckpoint(checkpoint);
    setSheetOpen(true);
  };

  return (
    <>
      <Card className="shadow-sm border-border/40">
        <CardContent className="p-0 divide-y divide-border/50">
          {sorted.map((checkpoint, idx) => (
            <div
              key={checkpoint.id}
              className={`flex items-center gap-3 px-3 py-3 transition-colors ${!checkpoint.isActive ? "opacity-50" : ""}`}
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => handleMove(checkpoint, "up")}
                  disabled={idx === 0}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  aria-label="Move up"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => handleMove(checkpoint, "down")}
                  disabled={idx === sorted.length - 1}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none transition-colors"
                  aria-label="Move down"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {/* Icon */}
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <LucideIcon name={checkpoint.icon} size={18} />
              </div>

              {/* Name + meta */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm leading-tight truncate">{checkpoint.name}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {/* Duration chip */}
                  <span className="inline-flex items-center gap-1 text-xs bg-muted/60 text-muted-foreground rounded-full px-2 py-0.5">
                    <Clock size={10} />
                    {checkpoint.defaultDurationMinutes === 0
                      ? "Off"
                      : `${checkpoint.defaultDurationMinutes}m`}
                  </span>
                  {/* Energy mode chips */}
                  {(checkpoint.energyModes ?? []).map((mode) => (
                    <span
                      key={mode}
                      className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5"
                    >
                      {ENERGY_MODE_LABELS[mode] ?? mode}
                    </span>
                  ))}
                </div>
              </div>

              {/* Edit button */}
              <button
                onClick={() => openEdit(checkpoint)}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
                aria-label={`Edit ${checkpoint.name}`}
              >
                <Pencil size={16} />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <StationEditSheet
        checkpoint={editingCheckpoint}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setEditingCheckpoint(null);
        }}
      />
    </>
  );
}

// ─── Generic setting row ─────────────────────────────────────────────────────

function SettingRow({ icon: Icon, label, desc, checked, onCheckedChange }: any) {
  return (
    <div className="flex items-center justify-between p-4 bg-card">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-foreground flex items-center justify-center shrink-0">
          <Icon size={20} />
        </div>
        <div>
          <h3 className="font-medium text-foreground">{label}</h3>
          {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
