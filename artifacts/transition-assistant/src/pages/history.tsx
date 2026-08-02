import { useListHistory, getListHistoryQueryKey } from "@workspace/api-client-react";
import { format, parseISO, isToday } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, Circle, AlertCircle } from "lucide-react";

export function History() {
  const { data: history, isLoading } = useListHistory({ query: { queryKey: getListHistoryQueryKey() } });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!history || history.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <p>No history yet.</p>
        <p className="text-sm">Start your first routine to see it here.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      <div className="pt-6 pb-2 px-2">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">History</h1>
        <p className="text-muted-foreground mt-1">One step at a time.</p>
      </div>

      <div className="flex flex-col gap-3">
        {history.map((day) => {
          const date = parseISO(day.date);
          const isCurrentDay = isToday(date);
          const rate = day.totalSessions > 0 ? Math.round((day.completed / day.totalSessions) * 100) : 0;
          
          return (
            <Card key={day.date} className="shadow-sm border-border/40 overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4 flex items-center justify-between bg-card hover:bg-muted/30 transition-colors">
                  <div>
                    <h3 className="font-medium text-lg flex items-center gap-2">
                      {isCurrentDay ? "Today" : format(date, "EEEE, MMM d")}
                    </h3>
                    <div className="flex items-center gap-3 text-sm mt-1 text-muted-foreground">
                      <span className="capitalize px-2 py-0.5 rounded-md bg-secondary/10 text-secondary-foreground text-[10px] font-bold tracking-wider">{day.energyMode || 'Unknown'} Mode</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-light text-primary">{rate}%</div>
                  </div>
                </div>
                
                <div className="px-4 py-3 bg-muted/30 border-t border-border/50 flex gap-4 text-sm">
                  <StatItem icon={CheckCircle2} count={day.completed} color="text-primary" label="Done" />
                  <StatItem icon={Circle} count={day.skipped} color="text-muted-foreground" label="Skipped" />
                  <StatItem icon={AlertCircle} count={day.missed} color="text-destructive/80" label="Missed" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatItem({ icon: Icon, count, color, label }: any) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <Icon size={14} className={color} />
      <span className="font-medium text-foreground">{count}</span>
    </div>
  );
}