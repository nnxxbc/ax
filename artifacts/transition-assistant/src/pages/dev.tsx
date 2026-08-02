import { useListEvents, useClearEvents, getListEventsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function Dev() {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useListEvents({ query: { queryKey: getListEventsQueryKey() } });
  const clearEvents = useClearEvents();

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  const handleClear = () => {
    clearEvents.mutate(undefined as any, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        toast("Event log cleared");
      }
    });
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col">
      <div className="pt-6 pb-4 px-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">Developer</h1>
          <p className="text-muted-foreground mt-1 text-sm">System event log</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleClear} disabled={clearEvents.isPending || !events?.length}>
          <Trash2 size={16} className="mr-2" /> Clear
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden flex-1 flex flex-col font-mono text-xs max-h-[60vh]">
        <div className="overflow-y-auto p-4 space-y-3">
          {(!events || events.length === 0) ? (
            <p className="text-muted-foreground text-center py-8">No events logged.</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex gap-3 pb-3 border-b border-border/30 last:border-0 last:pb-0">
                <div className="shrink-0 text-muted-foreground">
                  {format(parseISO(event.timestamp), "HH:mm:ss")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-secondary/20 text-secondary-foreground px-1.5 py-0.5 rounded font-bold uppercase text-[10px]">
                      {event.eventType}
                    </span>
                    {event.checkpointName && (
                      <span className="text-primary truncate">{event.checkpointName}</span>
                    )}
                  </div>
                  <div className="text-foreground break-words whitespace-pre-wrap">{event.message}</div>
                  {event.details && (
                    <div className="text-muted-foreground mt-1 bg-muted/50 p-2 rounded break-all whitespace-pre-wrap">{event.details}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}