import { useGetInsights, getGetInsightsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lightbulb, TrendingUp, AlertTriangle } from "lucide-react";

export function Insights() {
  const { data, isLoading } = useGetInsights({ query: { queryKey: getGetInsightsQueryKey() } });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  if (!data || data.insights.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <Lightbulb className="w-12 h-12 mb-4 opacity-20" />
        <p>Not enough data for insights yet.</p>
        <p className="text-sm">Keep using the app for a few days.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      <div className="pt-6 pb-2 px-2">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Insights</h1>
        <p className="text-muted-foreground mt-1">Gently learning your rhythms.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="bg-primary/5 border-primary/20 shadow-none">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <span className="text-3xl font-light text-primary mb-1">{data.streakDays}</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Day Streak</span>
          </CardContent>
        </Card>
        <Card className="bg-secondary/5 border-secondary/20 shadow-none">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <span className="text-3xl font-light text-secondary-foreground mb-1">{data.completionRatePercent}%</span>
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Completion</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        {data.insights.map((insight, i) => (
          <InsightCard key={i} insight={insight} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: any }) {
  let icon = <Lightbulb size={20} className="text-primary" />;
  let bgClass = "bg-primary/5";
  let borderClass = "border-primary/20";
  
  if (insight.severity === 'warning') {
    icon = <AlertTriangle size={20} className="text-destructive/80" />;
    bgClass = "bg-destructive/5";
    borderClass = "border-destructive/20";
  } else if (insight.severity === 'tip') {
    icon = <TrendingUp size={20} className="text-secondary-foreground" />;
    bgClass = "bg-secondary/5";
    borderClass = "border-secondary/20";
  }

  return (
    <Card className={`shadow-sm ${borderClass}`}>
      <CardContent className={`p-5 flex gap-4 ${bgClass}`}>
        <div className="shrink-0 mt-0.5">
          {icon}
        </div>
        <div>
          <p className="text-foreground leading-relaxed font-medium text-[15px]">{insight.message}</p>
        </div>
      </CardContent>
    </Card>
  );
}