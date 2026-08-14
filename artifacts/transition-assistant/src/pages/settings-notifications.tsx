import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const MINUTE_PRESETS = [5, 10, 15, 30, 60];
const CHECKIN_PRESETS = [30, 60, 120, 180, 240];

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

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

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-6">
      <div className="pt-6 px-2 flex items-center gap-3">
        <Link href="/settings" className="text-muted-foreground active:opacity-60"><ChevronLeft size={22} /></Link>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Notifications</h1>
      </div>

      <Card className="shadow-sm border-border/40">
        <CardContent className="p-4 divide-y divide-border/50">
          <div className="flex items-center justify-between py-3 first:pt-0">
            <div>
              <h3 className="font-medium text-foreground">Timer</h3>
              <p className="text-sm text-muted-foreground">"Time's up" when a station's timer ends</p>
            </div>
            <Switch checked={settings.notifyTimerEnabled !== false} onCheckedChange={(c: boolean) => patch({ notifyTimerEnabled: c })} />
          </div>

          <div className="py-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium text-foreground">Transition reminders</h3>
                <p className="text-sm text-muted-foreground">Nudge if a station is waiting unstarted</p>
              </div>
              <Switch
                checked={settings.notifyTransitionRemindersEnabled !== false}
                onCheckedChange={(c: boolean) => patch({ notifyTransitionRemindersEnabled: c })}
              />
            </div>
            {settings.notifyTransitionRemindersEnabled !== false && (
              <div className="flex gap-2 mt-2">
                {MINUTE_PRESETS.map((m) => (
                  <button
                    key={m}
                    onClick={() => patch({ transitionReminderDelayMinutes: m })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      (settings.transitionReminderDelayMinutes ?? 15) === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <h3 className="font-medium text-foreground">Missed checkpoint</h3>
              <p className="text-sm text-muted-foreground">Flag anything skipped</p>
            </div>
            <Switch
              checked={settings.notifyMissedCheckpointEnabled !== false}
              onCheckedChange={(c: boolean) => patch({ notifyMissedCheckpointEnabled: c })}
            />
          </div>

          <div className="py-3 last:pb-0">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-medium text-foreground">Check-ins</h3>
                <p className="text-sm text-muted-foreground">Periodic "still going?" pings</p>
              </div>
              <Switch
                checked={settings.notifyCheckInsEnabled === true}
                onCheckedChange={(c: boolean) => patch({ notifyCheckInsEnabled: c })}
              />
            </div>
            {settings.notifyCheckInsEnabled === true && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {CHECKIN_PRESETS.map((m) => (
                  <button
                    key={m}
                    onClick={() => patch({ checkInIntervalMinutes: m })}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      (settings.checkInIntervalMinutes ?? 120) === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
