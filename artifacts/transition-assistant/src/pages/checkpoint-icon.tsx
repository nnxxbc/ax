import {
  Sunrise, Sun, Moon, Bed, Dumbbell, Footprints, Droplets, GlassWater,
  ShowerHead, Bath, Brush, UtensilsCrossed, Coffee, Home, LogOut, Car,
  Briefcase, BookOpen, PenLine, ClipboardList, Music2, Heart, Smile,
  Sparkles, Wind, Trash2, ShoppingCart, Dog, Zap, MapPin, Monitor, Circle,
  type LucideProps,
} from "lucide-react";

// Curated, deliberately small set — minimalistic single-color line icons
// (Lucide's default style), enough variety to cover most routine/habit
// stations without turning the picker into an unscrollable wall of the
// full ~1500-icon library.
export const ICON_OPTIONS = [
  "Sunrise", "Sun", "Moon", "Bed", "Dumbbell", "Footprints",
  "Droplets", "GlassWater", "ShowerHead", "Bath", "Brush", "UtensilsCrossed",
  "Coffee", "Home", "LogOut", "Car", "Briefcase", "BookOpen",
  "PenLine", "ClipboardList", "Music2", "Heart", "Smile", "Sparkles",
  "Wind", "Trash2", "ShoppingCart", "Dog", "Zap", "MapPin",
  "Monitor", "Circle",
] as const;

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  Sunrise, Sun, Moon, Bed, Dumbbell, Footprints, Droplets, GlassWater,
  ShowerHead, Bath, Brush, UtensilsCrossed, Coffee, Home, LogOut, Car,
  Briefcase, BookOpen, PenLine, ClipboardList, Music2, Heart, Smile,
  Sparkles, Wind, Trash2, ShoppingCart, Dog, Zap, MapPin, Monitor, Circle,
};

export function LucideIcon({
  name,
  ...props
}: { name?: string | null } & LucideProps) {
  const Icon = (name && iconMap[name]) ? iconMap[name] : MapPin;
  return <Icon {...props} />;
}
