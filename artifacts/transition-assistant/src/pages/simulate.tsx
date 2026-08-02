import { useListCheckpoints, useSimulateNfcScan, getGetTodayRoutineQueryKey, getGetTodaySummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

export function Simulate() {
  const queryClient = useQueryClient();
  const { data: checkpoints, isLoading } = useListCheckpoints({ query: { queryKey: ['listCheckpoints'] } });
  const simulateScan = useSimulateNfcScan();
  const [warningDialog, setWarningDialog] = useState<any>(null);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  const handleSimulate = (checkpointId: number) => {
    simulateScan.mutate({ data: { checkpointId } }, {
      onSuccess: (result) => {
        if (result.action === 'early_complete_warning') {
          setWarningDialog(result);
        } else {
          toast(result.message || `Scanned ${result.checkpointName}`);
          queryClient.invalidateQueries({ queryKey: getGetTodayRoutineQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTodaySummaryQueryKey() });
        }
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error || "Simulation failed");
      }
    });
  };

  const activeCheckpoints = checkpoints?.filter(c => c.isActive).sort((a, b) => a.order - b.order) || [];

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      <div className="pt-6 pb-2 px-2">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">NFC Simulator</h1>
        <p className="text-muted-foreground mt-1">Tap a card to simulate scanning its tag.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {activeCheckpoints.map(cp => (
          <Card key={cp.id} className="cursor-pointer active:scale-95 transition-all shadow-sm border-border/40 hover:border-primary/30" onClick={() => handleSimulate(cp.id)}>
            <CardContent className="p-4 flex flex-col h-full items-center text-center justify-center min-h-[140px] relative overflow-hidden group">
              <div className="absolute top-2 right-2 opacity-10 group-hover:opacity-100 transition-opacity">
                <Wifi size={16} />
              </div>
              <div className="w-12 h-12 bg-secondary/10 rounded-full flex items-center justify-center mb-3 text-2xl">
                {cp.icon || '📍'}
              </div>
              <h3 className="font-medium text-[15px] leading-tight mb-1">{cp.name}</h3>
              {cp.location && <p className="text-[11px] text-muted-foreground">{cp.location}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <DialogPrimitive.Root open={!!warningDialog} onOpenChange={(open) => !open && setWarningDialog(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-[90%] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-[2rem] rounded-3xl">
            <div className="flex flex-col space-y-2 text-center sm:text-left">
              <h2 className="text-lg font-semibold">Too fast?</h2>
              <p className="text-sm text-muted-foreground">
                {warningDialog?.message}
              </p>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={() => setWarningDialog(null)}>Continue Resting</Button>
              {/* Note: In a real app we'd need a separate endpoint to force complete, but for now we'll just close it. The API provides session actions. */}
              <Button variant="outline" onClick={() => setWarningDialog(null)}>Complete Anyway</Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}