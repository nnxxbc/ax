import {
  Sunrise, Dumbbell, Droplets, ShowerHead, Brush, Home, Trash2,
  Monitor, GlassWater, Zap, MapPin, type LucideProps,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  Sunrise, Dumbbell, Droplets, ShowerHead, Brush, Home, Trash2,
  Monitor, GlassWater, Zap, MapPin,
};

export function LucideIcon({
  name,
  ...props
}: { name?: string | null } & LucideProps) {
  const Icon = (name && iconMap[name]) ? iconMap[name] : MapPin;
  return <Icon {...props} />;
}
