import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey, useListCheckpoints, getListCheckpointsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const DAYS = [
  { day: 0, label: "S" },
  { day: 1, label: "M" },
  { day: 2, label: "T" },
  { day: 3, label: "W" },
  { day: 4, label: "T" },
  { day: 5, label: "F" },
  { day: 6, label: "S" },
];

export function AlarmSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const { data: checkpoints } = useListCheckpoints({ query: { queryKey: getListCheckpointsQueryKey() } });
  const updateSettings = useUpdateSettings();

  // Local text-input state for the time field, since it's edited char by
  // char and we don't want a PUT request firing on every keystroke.
  const [timeInput, setTimeInput] = useState("");
  useEffect(() => {
    if (settings?.alarmTime) setTimeInput(settings.alarmTime);
  }, [settings?.alarmTime]);

  if (isLoading || !settings) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  const patch = (data: Record<string, unknown>) => {
    updateSettings.mutate(
      { data: data as any },
      {
        onSuccess: () => queryClient.setQueryData(getGetSettingsQueryKey(), (old: any) => ({ ...old, ...data })),
        onError: () => toast.error("Failed to update"),
      },
    );
  };

  const days: number[] = settings.alarmDaysOfWeek ?? [1, 2, 3, 4, 5];
  const toggleDay = (day: number) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    patch({ alarmDaysOfWeek: next });
  };

  const commitTime = () => {
    if (/^\d{1,2}:\d{2}$/.test(timeInput.trim())) {
      patch({ alarmTime: timeInput.trim() });
    } else {
      toast.error("Use HH:MM, e.g. 07:00");
      setTimeInput(settings.alarmTime ?? "");
    }
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-6">
      <div className="pt-6 px-2 flex items-center gap-3">
        <Link href="/settings" className="text-muted-foreground active:opacity-60"><ChevronLeft size={22} /></Link>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Morning Alarm</h1>
      </div>

      <Card className="shadow-sm border-border/40">
        <CardContent className="p-4 divide-y divide-border/50">
          <div className="flex items-center justify-between py-3 first:pt-0">
            <div>
              <h3 className="font-medium text-foreground">Enabled</h3>
              <p className="text-sm text-muted-foreground">Persistent weekly wake-up alarm</p>
            </div>
            <Switch checked={!!settings.alarmEnabled} onCheckedChange={(c: boolean) => patch({ alarmEnabled: c })} />
          </div>

          <div className="py-3">
            <h3 className="font-medium text-foreground mb-2">Time</h3>
            <input
              value={timeInput}
              onChange={(e) => setTimeInput(e.target.value)}
              onBlur={commitTime}
              placeholder="07:00"
              className="w-28 rounded-xl bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="py-3">
            <h3 className="font-medium text-foreground mb-2">Days</h3>
            <div className="flex gap-2">
              {DAYS.map(({ day, label }) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={`w-9 h-9 rounded-full text-xs font-bold transition-colors ${
                    days.includes(day) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <h3 className="font-medium text-foreground">Require NFC to dismiss</h3>
              <p className="text-sm text-muted-foreground">Lock screen open until you scan a tag</p>
            </div>
            <Switch
              checked={!!settings.alarmRequiresNfcDismissal}
              onCheckedChange={(c: boolean) => patch({ alarmRequiresNfcDismissal: c })}
            />
          </div>

          {settings.alarmRequiresNfcDismissal && (
            <div className="py-3">
              <h3 className="font-medium text-foreground mb-2">Dismissal station</h3>
              <p className="text-xs text-muted-foreground mb-3">Any known tag works if none is chosen.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => patch({ alarmTargetCheckpointId: null })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    !settings.alarmTargetCheckpointId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  Any tag
                </button>
                {(Array.isArray(checkpoints) ? checkpoints : []).map((cp: any) => (
                  <button
                    key={cp.id}
                    onClick={() => patch({ alarmTargetCheckpointId: cp.id })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      settings.alarmTargetCheckpointId === cp.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {cp.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between py-3">
            <h3 className="font-medium text-foreground">Sound</h3>
            <Switch checked={settings.alarmSoundEnabled !== false} onCheckedChange={(c: boolean) => patch({ alarmSoundEnabled: c })} />
          </div>
          <div className="flex items-center justify-between py-3 last:pb-0">
            <h3 className="font-medium text-foreground">Vibration</h3>
            <Switch checked={settings.alarmVibrationEnabled !== false} onCheckedChange={(c: boolean) => patch({ alarmVibrationEnabled: c })} />
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-2 leading-relaxed">
        This schedules a real repeating OS notification for each selected day. If "Require NFC to dismiss" is on,
        opening the app during the alarm window shows a full-screen lock until you scan — with a 5-second-hold
        emergency dismiss so it can never fully trap you.
      </p>
    </div>
  );
}
