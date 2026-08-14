import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function QuietHoursSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateSettings = useUpdateSettings();

  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  useEffect(() => {
    if (settings?.quietHoursStart) setStartInput(settings.quietHoursStart);
    if (settings?.quietHoursEnd) setEndInput(settings.quietHoursEnd);
  }, [settings?.quietHoursStart, settings?.quietHoursEnd]);

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

  const commit = (field: "quietHoursStart" | "quietHoursEnd", value: string) => {
    if (/^\d{1,2}:\d{2}$/.test(value.trim())) {
      patch({ [field]: value.trim() });
    } else {
      toast.error("Use HH:MM, e.g. 23:00");
      if (field === "quietHoursStart") setStartInput(settings.quietHoursStart ?? "");
      else setEndInput(settings.quietHoursEnd ?? "");
    }
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-6">
      <div className="pt-6 px-2 flex items-center gap-3">
        <Link href="/settings" className="text-muted-foreground active:opacity-60"><ChevronLeft size={22} /></Link>
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Quiet Hours</h1>
      </div>

      <Card className="shadow-sm border-border/40">
        <CardContent className="p-4 divide-y divide-border/50">
          <div className="flex items-center justify-between py-3 first:pt-0">
            <div>
              <h3 className="font-medium text-foreground">Enabled</h3>
              <p className="text-sm text-muted-foreground">Suppress non-critical notifications during this window</p>
            </div>
            <Switch checked={!!settings.quietHoursEnabled} onCheckedChange={(c: boolean) => patch({ quietHoursEnabled: c })} />
          </div>

          <div className="flex items-center gap-6 py-3 last:pb-0">
            <div>
              <h3 className="font-medium text-foreground mb-2">From</h3>
              <input
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                onBlur={() => commit("quietHoursStart", startInput)}
                placeholder="23:00"
                className="w-24 rounded-xl bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <h3 className="font-medium text-foreground mb-2">To</h3>
              <input
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                onBlur={() => commit("quietHoursEnd", endInput)}
                placeholder="08:00"
                className="w-24 rounded-xl bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground px-2 leading-relaxed">
        The morning alarm always bypasses quiet hours — that's its job. Everything else (timer, transition
        reminders, missed checkpoint, check-ins) is suppressed during this window.
      </p>
    </div>
  );
}
