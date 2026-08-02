import * as React from "react"
import { Link, useLocation } from "wouter"
import { Home, Grid, Calendar, Sparkles, Settings, Wrench } from "lucide-react"
import { useGetSettings, getGetSettingsQueryKey } from "@workspace/api-client-react"
import { cn } from "@/lib/utils"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  
  // Provide an initial queryKey array directly if the hook doesn't export a param-less queryKey generator
  // Looking at the schemas, it's just getGetSettingsQueryKey()
  const { data: settings } = useGetSettings({
    query: {
      queryKey: getGetSettingsQueryKey()
    }
  })

  return (
    <div className="mx-auto w-full max-w-[430px] min-h-[100dvh] bg-background flex flex-col relative shadow-2xl shadow-black/5 sm:border-x sm:border-border/50">
      <main className="flex-1 overflow-y-auto pb-24 no-scrollbar relative flex flex-col">
        {children}
      </main>

      <nav className="absolute bottom-0 left-0 right-0 h-[88px] glass-panel border-t border-border flex items-center justify-around px-2 z-50 rounded-t-[2rem]">
        <NavItem icon={Home} label="Home" path="/" isActive={location === '/'} />
        <NavItem icon={Grid} label="Stations" path="/simulate" isActive={location === '/simulate'} />
        <NavItem icon={Calendar} label="History" path="/history" isActive={location === '/history'} />
        <NavItem icon={Sparkles} label="Insights" path="/insights" isActive={location === '/insights'} />
        <NavItem icon={Settings} label="Settings" path="/settings" isActive={location === '/settings' || location === '/nfc-tags'} />
        {settings?.developerModeEnabled && (
          <NavItem icon={Wrench} label="Dev" path="/dev" isActive={location === '/dev'} />
        )}
      </nav>
    </div>
  )
}

function NavItem({ icon: Icon, label, path, isActive }: { icon: React.ElementType, label: string, path: string, isActive: boolean }) {
  return (
    <Link href={path} className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all active:scale-95 group relative touch-none outline-none">
      <div className={cn(
        "flex flex-col items-center justify-center transition-all duration-300",
        isActive ? "text-primary translate-y-[-2px]" : "text-muted-foreground group-hover:text-foreground"
      )}>
        <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className={cn("transition-all duration-300", isActive && "drop-shadow-[0_2px_4px_rgba(var(--primary),0.3)]")} />
        <span className={cn(
          "text-[10px] mt-1 font-medium transition-all duration-300",
          isActive ? "opacity-100" : "opacity-0 translate-y-1"
        )}>{label}</span>
        
        {isActive && (
          <span className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full" />
        )}
      </div>
    </Link>
  )
}