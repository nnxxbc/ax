import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, Volume2, Vibrate, Bell, Wrench, SmartphoneNfc, Clock } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

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

        <h2 className="px-2 text-sm font-semibold tracking-widest text-muted-foreground uppercase mb-2">Routine</h2>
        <Card className="shadow-sm border-border/40">
          <CardContent className="p-0">
            <Link href="/checkpoints" className="flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors active:bg-muted">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div className="flex-1">
                <h3 className="font-medium">Checkpoint Durations</h3>
                <p className="text-sm text-muted-foreground">Set default times for each station</p>
              </div>
            </Link>
          </CardContent>
        </Card>

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