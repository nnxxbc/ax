import { useEffect, useState, useRef } from "react";
import { useGetTodayRoutine, useStartTodayRoutine, getGetTodayRoutineQueryKey, getGetTodaySummaryQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { Battery, BatteryMedium, BatteryWarning, CheckCircle2, MapPin, Smartphone, ArrowRight, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { useSessionAction } from "@workspace/api-client-react";

export function Home() {
  const queryClient = useQueryClient();
  const { data: routine, isLoading } = useGetTodayRoutine({
    query: { queryKey: getGetTodayRoutineQueryKey() }
  });

  const startRoutine = useStartTodayRoutine();
  const sessionAction = useSessionAction();

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center p-6"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>;
  }

  const handleStart = (mode: "full" | "reduced" | "survival") => {
    startRoutine.mutate({ data: { energyMode: mode } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        toast.success(`Started routine in ${mode} mode`);
      }
    });
  };

  if (!routine || routine.status === "abandoned") {
    return (
      <div className="flex-1 flex flex-col p-6 animate-in fade-in zoom-in duration-500">
        <div className="mt-8 mb-12 space-y-2">
          <h1 className="text-3xl font-medium tracking-tight">Good morning.</h1>
          <p className="text-muted-foreground text-lg">How are we feeling today?</p>
        </div>

        <div className="flex flex-col gap-4">
          <EnergyCard 
            title="Full Energy" 
            desc="Ready for everything. All stations active." 
            icon={Battery} 
            color="bg-primary/10 text-primary border-primary/20"
            onClick={() => handleStart("full")} 
            disabled={startRoutine.isPending}
          />
          <EnergyCard 
            title="Reduced" 
            desc="A bit lower today. Only the important things." 
            icon={BatteryMedium} 
            color="bg-secondary/10 text-secondary-foreground border-secondary/20"
            onClick={() => handleStart("reduced")} 
            disabled={startRoutine.isPending}
          />
          <EnergyCard 
            title="Survival" 
            desc="Bare minimum. Just the absolute essentials." 
            icon={BatteryWarning} 
            color="bg-destructive/10 text-destructive border-destructive/20"
            onClick={() => handleStart("survival")} 
            disabled={startRoutine.isPending}
          />
        </div>
      </div>
    );
  }

  if (routine.status === "completed") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-500 text-center">
        <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={48} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-medium mb-2">All done for today.</h2>
        <p className="text-muted-foreground">You can rest now.</p>
        
        <Button variant="outline" className="mt-12" onClick={() => handleStart("full")}>
          Restart Routine
        </Button>
      </div>
    );
  }

  const inProgressSession = routine.sessions.find(s => s.status === "in_progress");
  if (inProgressSession) {
    return <InProgressView session={inProgressSession} />;
  }

  const nextSession = routine.sessions.find(s => s.status === "waiting");
  if (nextSession) {
    return <WaitingView session={nextSession} />;
  }

  // All sessions complete or empty sessions — treat as done / prompt restart
  const allDone = routine.sessions.length > 0 && routine.sessions.every(s => s.status === "completed" || s.status === "skipped" || s.status === "missed" || s.status === "cancelled");
  if (allDone || routine.sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-500 text-center">
        <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 size={48} strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-medium mb-2">{allDone ? "All done for today." : "Ready to start?"}</h2>
        <p className="text-muted-foreground">{allDone ? "You can rest now." : "Choose how much energy you have today."}</p>
        <div className="flex flex-col gap-3 w-full mt-10">
          <EnergyCard title="Full Energy" desc="Ready for everything. All stations active." icon={Battery} color="bg-primary/10 text-primary border-primary/20" onClick={() => handleStart("full")} disabled={startRoutine.isPending} />
          <EnergyCard title="Reduced" desc="A bit lower today. Only the important things." icon={BatteryMedium} color="bg-secondary/10 text-secondary-foreground border-secondary/20" onClick={() => handleStart("reduced")} disabled={startRoutine.isPending} />
          <EnergyCard title="Survival" desc="Bare minimum. Just the absolute essentials." icon={BatteryWarning} color="bg-destructive/10 text-destructive border-destructive/20" onClick={() => handleStart("survival")} disabled={startRoutine.isPending} />
        </div>
      </div>
    );
  }

  return null;
}

function EnergyCard({ title, desc, icon: Icon, color, onClick, disabled }: any) {
  return (
    <Card className="active:scale-[0.98] transition-transform cursor-pointer shadow-sm hover:shadow-md" onClick={disabled ? undefined : onClick}>
      <CardContent className="p-6 flex items-center gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon size={28} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground leading-snug">{desc}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function WaitingView({ session }: { session: any }) {
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();

  const handleStart = () => {
    sessionAction.mutate({ id: session.id, data: { action: "start" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
      }
    });
  };

  const handleSkip = () => {
    sessionAction.mutate({ id: session.id, data: { action: "skip" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        toast("Station skipped. No big deal.");
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col p-6 animate-in slide-in-from-bottom-4 duration-500 relative">
      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <p className="text-muted-foreground uppercase tracking-widest text-xs font-bold mb-2">Next Stop</p>
          <h1 className="text-4xl font-medium tracking-tight text-foreground">{session.checkpointName}</h1>
          {session.checkpointLocation && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mt-3">
              <MapPin size={16} />
              <span>{session.checkpointLocation}</span>
            </div>
          )}
        </div>
        
        <Button size="lg" className="w-full text-lg h-20 rounded-[2rem] shadow-lg shadow-primary/20 mb-4" onClick={handleStart} disabled={sessionAction.isPending}>
          I'm here
        </Button>
        <Button variant="ghost" size="lg" className="w-full text-muted-foreground" onClick={handleSkip} disabled={sessionAction.isPending}>
          Skip this one
        </Button>
      </div>
    </div>
  );
}

function InProgressView({ session }: { session: any }) {
  const [elapsed, setElapsed] = useState(session.elapsedSeconds || 0);
  const queryClient = useQueryClient();
  const sessionAction = useSessionAction();

  useEffect(() => {
    const start = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    const serverElapsed = session.elapsedSeconds || 0;
    const initialElapsed = Math.floor((Date.now() - start) / 1000) + serverElapsed;
    
    setElapsed(initialElapsed > 0 ? initialElapsed : 0);

    const interval = setInterval(() => {
      setElapsed((prev: number) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt, session.elapsedSeconds]);

  const handleComplete = () => {
    sessionAction.mutate({ id: session.id, data: { action: "complete" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        toast.success("Done!");
      }
    });
  };

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  
  const targetSecs = (session.targetDurationMinutes || session.minDurationMinutes || 5) * 60;
  const progress = Math.min(100, (elapsed / targetSecs) * 100);

  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in duration-700 bg-primary/5">
      <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full text-center">
        
        <div className="relative mb-12">
          <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
          <div className="w-48 h-48 bg-card rounded-[3rem] shadow-xl flex flex-col items-center justify-center relative border-4 border-background border-dashed animate-pulse-slow">
            <Smartphone size={48} className="text-primary mb-4 opacity-80" strokeWidth={1.5} />
            <span className="text-xl font-bold tracking-tight text-foreground/80">PARK YOUR<br/>PHONE</span>
          </div>
        </div>

        <h2 className="text-2xl font-medium mb-2">{session.checkpointName}</h2>
        <div className="text-5xl font-light tabular-nums tracking-tight mb-8 opacity-80 text-primary">
          {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
        </div>

        <div className="w-full mb-12">
          <Progress value={progress} className="h-2 bg-primary/10" />
        </div>

        <Button size="lg" variant="outline" className="w-full text-lg h-20 rounded-[2rem] border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-colors" onClick={handleComplete} disabled={sessionAction.isPending}>
          <CheckCircle2 className="mr-2" /> Done
        </Button>
      </div>
    </div>
  );
}