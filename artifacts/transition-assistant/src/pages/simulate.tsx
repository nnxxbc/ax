import { useListCheckpoints, useSimulateNfcScan, useSessionAction, getGetTodayRoutineQueryKey, getGetTodaySummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Wifi, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "./checkpoint-icon";

export function Simulate() {
  const queryClient = useQueryClient();
  const { data: checkpoints, isLoading } = useListCheckpoints({ query: { queryKey: ['listCheckpoints'] } });
  const simulateScan = useSimulateNfcScan();
  const sessionAction = useSessionAction();
  const [warningDialog, setWarningDialog] = useState<any>(null);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
  };

  const handleSimulate = (checkpointId: number) => {
    simulateScan.mutate({ data: { checkpointId } }, {
      onSuccess: (result) => {
        if (result.action === 'early_complete_warning') {
          setWarningDialog(result);
        } else {
          toast(result.message || `Scanned — ${result.checkpointName}`);
          invalidate();
        }
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error || "Simulation failed");
      }
    });
  };

  const handleCompleteAnyway = () => {
    if (!warningDialog?.sessionId) {
      setWarningDialog(null);
      return;
    }
    sessionAction.mutate(
      { id: warningDialog.sessionId, data: { action: "complete_anyway", reason: "early override via simulate" } },
      {
        onSuccess: () => {
          toast("Completed early.");
          invalidate();
          setWarningDialog(null);
        },
        onError: () => toast.error("Failed to complete"),
      }
    );
  };

  const activeCheckpoints = checkpoints?.filter(c => c.isActive).sort((a, b) => a.order - b.order) || [];

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      <div className="pt-6 pb-2 px-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">NFC Simulator</h1>
        <p className="text-muted-foreground mt-1 text-sm">Tap a card to simulate scanning its NFC tag.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {activeCheckpoints.map(cp => (
          <Card
            key={cp.id}
            className="cursor-pointer active:scale-95 transition-all shadow-sm border-border/40 hover:border-primary/30"
            onClick={() => handleSimulate(cp.id)}
          >
            <CardContent className="p-4 flex flex-col h-full items-center text-center justify-center min-h-[140px] relative overflow-hidden group">
              <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-30 transition-opacity">
                <Wifi size={16} />
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
                <LucideIcon name={cp.icon} size={24} className="text-primary" strokeWidth={1.5} />
              </div>
              <h3 className="font-semibold text-[14px] leading-tight mb-1">{cp.name}</h3>
              <p className="text-[11px] text-muted-foreground">
                {cp.defaultDurationMinutes === 0 ? "No timer" : `${cp.defaultDurationMinutes} min`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Early complete warning dialog */}
      <DialogPrimitive.Root open={!!warningDialog} onOpenChange={(open) => !open && setWarningDialog(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[90%] max-w-sm translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-xl rounded-3xl data-[state=open]:animate-in data-[state=open]:zoom-in-95">
            <h2 className="text-xl font-bold mb-2">Too fast?</h2>
            <p className="text-sm text-muted-foreground mb-6">{warningDialog?.message}</p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => setWarningDialog(null)} className="rounded-2xl h-12">
                Keep going
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl h-12"
                onClick={handleCompleteAnyway}
                disabled={sessionAction.isPending}
              >
                Complete anyway
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
