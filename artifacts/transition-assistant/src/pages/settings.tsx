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
import { Loader2, Volume2, Vibrate, Bell, Wrench, SmartphoneNfc, Clock, ChevronUp, ChevronDown, Pencil, Grid } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { LucideIcon } from "./checkpoint-icon";
import { StationEditSheet } from "./station-edit-sheet";

export function Settings() {
  console.log("[Settings] Mount.");
  const queryClient = useQueryClient();
  const { data: settings, isLoading, error } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  console.log("[Settings] State:", {
    settings: settings ? JSON.stringify(settings).substring(0, 100) + "..." : settings,
    isLoading,
    error: error ? (error as any).message : null
  });
  if (settings) {
    console.log("[Settings] Full Data:", JSON.stringify(settings, null, 2));
  }

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!settings) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background">
        <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4 text-destructive">
          <Wrench size={24} />
        </div>
        <h2 className="text-lg font-bold mb-2">Settings missing</h2>
        <p className="text-sm text-muted-foreground mb-6">API returned null or failed.</p>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() })}>
          Retry
        </Button>
      </div>
    );
  }

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
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-0">
            <Link href="/checkpoints" className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors active:bg-muted">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Grid size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Routine Stations</h3>
                <p className="text-sm text-muted-foreground">Manage order, timers, and behavior</p>
              </div>
            </Link>
          </CardContent>
        </Card>

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

        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mt-6 mb-2">Enforcement</h2>
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'off', label: 'Off', desc: 'No restrictions' },
                { key: 'soft', label: 'Soft', desc: 'Notifications' },
                { key: 'focused', label: 'Focused', desc: 'Hide navigation' },
                { key: 'strict', label: 'Strict', desc: 'Lock actions' },
              ].map(level => (
                <button
                  key={level.key}
                  onClick={() => {
                    updateSettings.mutate(
                      { data: { enforcementLevel: level.key } as any },
                      { onSuccess: () => queryClient.setQueryData(getGetSettingsQueryKey(), (old: any) => ({ ...old, enforcementLevel: level.key })) }
                    );
                  }}
                  className={`flex flex-col items-start p-4 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                    (settings.enforcementLevel ?? 'off') === level.key
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card border-border/40"
                  }`}
                >
                  <p className={`text-sm font-bold ${(settings.enforcementLevel ?? 'off') === level.key ? "text-primary" : "text-foreground"}`}>{level.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{level.desc}</p>
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
