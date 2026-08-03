import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateCheckpoint,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import type { Checkpoint } from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LucideIcon } from "./checkpoint-icon";
import {
  Sunrise,
  Dumbbell,
  Droplets,
  ShowerHead,
  Brush,
  Home,
  Trash2,
  Monitor,
  GlassWater,
  Zap,
  MapPin,
  type LucideProps,
} from "lucide-react";
import { toast } from "sonner";

const ICON_OPTIONS: { name: string; component: React.ComponentType<LucideProps> }[] = [
  { name: "Sunrise", component: Sunrise },
  { name: "Dumbbell", component: Dumbbell },
  { name: "Droplets", component: Droplets },
  { name: "ShowerHead", component: ShowerHead },
  { name: "Brush", component: Brush },
  { name: "Home", component: Home },
  { name: "Trash2", component: Trash2 },
  { name: "Monitor", component: Monitor },
  { name: "GlassWater", component: GlassWater },
  { name: "Zap", component: Zap },
  { name: "MapPin", component: MapPin },
];

const DURATION_PRESETS = [0, 5, 10, 15, 20, 25, 30, 45, 60];

const ENERGY_MODES = [
  { value: "full", label: "Full Energy" },
  { value: "reduced", label: "Reduced" },
  { value: "survival", label: "Survival" },
];

interface StationEditSheetProps {
  checkpoint: Checkpoint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StationEditSheet({ checkpoint, open, onOpenChange }: StationEditSheetProps) {
  const queryClient = useQueryClient();
  const updateCheckpoint = useUpdateCheckpoint();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("MapPin");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [defaultDuration, setDefaultDuration] = useState(0);
  const [minDuration, setMinDuration] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [energyModes, setEnergyModes] = useState<string[]>(["full", "reduced", "survival"]);

  useEffect(() => {
    if (checkpoint) {
      setName(checkpoint.name);
      setIcon(checkpoint.icon ?? "MapPin");
      setDescription(checkpoint.description ?? "");
      setLocation(checkpoint.location ?? "");
      setDefaultDuration(checkpoint.defaultDurationMinutes);
      setMinDuration(checkpoint.minDurationMinutes ?? 0);
      setIsActive(checkpoint.isActive);
      setEnergyModes(checkpoint.energyModes ?? ["full", "reduced", "survival"]);
    }
  }, [checkpoint]);

  const toggleEnergyMode = (mode: string) => {
    setEnergyModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode]
    );
  };

  const handleSave = () => {
    if (!checkpoint) return;
    if (!name.trim()) {
      toast.error("Station name cannot be empty");
      return;
    }
    updateCheckpoint.mutate(
      {
        id: checkpoint.id,
        data: {
          name: name.trim(),
          icon,
          description: description.trim() || null,
          location: location.trim() || null,
          defaultDurationMinutes: defaultDuration,
          minDurationMinutes: Math.min(minDuration, defaultDuration),
          isActive,
          energyModes,
        } as any,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
          toast.success("Station updated");
          onOpenChange(false);
        },
        onError: () => toast.error("Failed to update station"),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] flex flex-col p-0 rounded-t-2xl">
        <SheetHeader className="px-5 pt-5 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />
          <SheetTitle className="text-left text-lg font-semibold">Edit Station</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-5">
          <div className="space-y-6 pb-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="station-name">Name</Label>
              <Input
                id="station-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Station name"
              />
            </div>

            {/* Icon picker */}
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-6 gap-2">
                {ICON_OPTIONS.map(({ name: iconName, component: IconComp }) => (
                  <button
                    key={iconName}
                    onClick={() => setIcon(iconName)}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center transition-colors ${
                      icon === iconName
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/30 text-foreground hover:bg-secondary/50"
                    }`}
                    aria-label={iconName}
                  >
                    <IconComp size={20} />
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="station-desc">Description</Label>
              <Textarea
                id="station-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Location */}
            <div className="space-y-2">
              <Label htmlFor="station-loc">Location</Label>
              <Input
                id="station-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bathroom, Kitchen"
              />
            </div>

            {/* Default duration */}
            <div className="space-y-2">
              <Label>Default Duration</Label>
              <div className="grid grid-cols-5 gap-2">
                {DURATION_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setDefaultDuration(mins)}
                    className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                      defaultDuration === mins
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/30 text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {mins === 0 ? "Off" : `${mins}m`}
                  </button>
                ))}
              </div>
            </div>

            {/* Min duration */}
            <div className="space-y-2">
              <Label>Minimum Duration</Label>
              <p className="text-xs text-muted-foreground -mt-1">Shortest allowed time for this station</p>
              <div className="grid grid-cols-5 gap-2">
                {DURATION_PRESETS.map((mins) => (
                  <button
                    key={mins}
                    onClick={() => setMinDuration(mins)}
                    className={`py-2 rounded-xl text-sm font-medium transition-colors ${
                      minDuration === mins
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/30 text-foreground hover:bg-secondary/50"
                    }`}
                  >
                    {mins === 0 ? "Off" : `${mins}m`}
                  </button>
                ))}
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="font-medium">Active</p>
                <p className="text-sm text-muted-foreground">Include this station in routines</p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Energy modes */}
            <div className="space-y-3">
              <Label>Energy Modes</Label>
              <p className="text-xs text-muted-foreground -mt-1">Which routines include this station</p>
              <div className="space-y-3">
                {ENERGY_MODES.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-3">
                    <Checkbox
                      id={`mode-${value}`}
                      checked={energyModes.includes(value)}
                      onCheckedChange={() => toggleEnergyMode(value)}
                    />
                    <Label htmlFor={`mode-${value}`} className="font-normal cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Save button */}
        <div className="px-5 pb-6 pt-3 shrink-0 border-t border-border/50">
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={updateCheckpoint.isPending}
          >
            {updateCheckpoint.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
