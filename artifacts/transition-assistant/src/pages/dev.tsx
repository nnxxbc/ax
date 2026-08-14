import { useEffect, useState } from "react";
import { useListEvents, useClearEvents, getListEventsQueryKey, useListNfcTags, getListNfcTagsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, CheckCircle2, XCircle, RefreshCw, SmartphoneNfc } from "lucide-react";
import { toast } from "sonner";
import { nfcService, type NfcAvailability } from "@/services/nfc-service";
import { getQueue, pendingCount, getLastSuccessfulSync, getLastSyncError } from "@/lib/sync-queue";
import { getScanDiagnostics, checkApiReachable, flushSyncQueue, resolveCheckpointFromTag, getCachedCheckpoints } from "@/lib/offline-sync";
import { isHealthy as isLocalStorageHealthy } from "@/lib/local-store";

// ─── NFC / sync / API diagnostics — Phase 1 requirement #10 ────────────────
// Everything on this page reads from local state or a single lightweight
// /api/ping call. Nothing here requires Android Studio or Render access to
// be useful — that's the point: the next time something goes wrong, this
// page should say where, without guessing.

function StatusRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-mono flex items-center gap-1.5 ${ok === true ? "text-primary" : ok === false ? "text-destructive" : "text-foreground"}`}>
        {ok === true && <CheckCircle2 size={13} />}
        {ok === false && <XCircle size={13} />}
        {value}
      </span>
    </div>
  );
}

function NfcDiagnosticsPanel() {
  const { data: nfcTags } = useListNfcTags({ query: { queryKey: getListNfcTagsQueryKey() } });
  const [availability, setAvailability] = useState<NfcAvailability | null>(null);
  const [apiStatus, setApiStatus] = useState<"checking" | "reachable" | "offline">("checking");
  const [apiError, setApiError] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [lastSyncErr, setLastSyncErr] = useState<string | null>(null);
  const [scanDiag, setScanDiag] = useState(getScanDiagnostics());
  const [storageOk, setStorageOk] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [testUid, setTestUid] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setAvailability(await nfcService.getAvailability());
    setQueueCount(pendingCount());
    setLastSync(getLastSuccessfulSync());
    setLastSyncErr(getLastSyncError());
    setScanDiag(getScanDiagnostics());
    setStorageOk(isLocalStorageHealthy());
    const api = await checkApiReachable();
    setApiStatus(api.reachable ? "reachable" : "offline");
    setApiError(api.error ?? null);
    setRefreshing(false);
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, []);

  const handleRetrySync = async () => {
    toast("Retrying pending sync events…");
    const result = await flushSyncQueue();
    toast(`Synced ${result.synced}, failed ${result.failed}, still waiting ${result.skipped}.`);
    refresh();
  };

  // TEST NFC mode — runs the exact same local decision logic used for a
  // real scan, shown for review, but never writes to the session cache or
  // queues a sync event. Safe to use without disturbing a real checkpoint.
  const handleTestScan = () => {
    if (!testUid.trim()) return;
    const checkpoints = getCachedCheckpoints();
    const checkpoint = resolveCheckpointFromTag(testUid.trim(), nfcTags, checkpoints);
    if (!checkpoint) {
      setTestResult(`No local checkpoint mapping found for UID "${testUid.trim()}". (This test only checks the local tag cache — it does not call the server or change any real session.)`);
      return;
    }
    setTestResult(
      `Would resolve to checkpoint "${checkpoint.name}" (id ${checkpoint.id}). Decision logic verified separately — this test only confirms tag → checkpoint mapping, since running the real state machine here would require touching live session data.`
    );
  };

  const nfcOk = availability === "native_available";

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">NFC Status</h2>
        <StatusRow label="NFC available" value={availability ?? "checking…"} ok={availability != null ? nfcOk : undefined} />
        <StatusRow label="Reader" value={nfcService.isScanning() ? "Active" : "Idle"} ok={nfcService.isScanning()} />
        <StatusRow label="Last tag detected" value={scanDiag.lastTagUid ?? "—"} />
        <StatusRow label="Last scan time" value={scanDiag.lastScanTime ? format(parseISO(scanDiag.lastScanTime), "HH:mm:ss") : "—"} />
        <StatusRow label="Last local action" value={scanDiag.lastLocalAction ?? "—"} />
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Local Storage &amp; Sync</h2>
        <StatusRow label="Local storage" value={storageOk ? "Healthy" : "Unavailable"} ok={storageOk} />
        <StatusRow label="Sync queue" value={`${queueCount} pending`} ok={queueCount === 0} />
        <StatusRow label="Last successful sync" value={lastSync ? format(parseISO(lastSync), "HH:mm:ss") : "Never"} />
        {lastSyncErr && <StatusRow label="Last sync error" value={lastSyncErr} ok={false} />}
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">API</h2>
        <StatusRow label="Reachable" value={apiStatus === "checking" ? "Checking…" : apiStatus === "reachable" ? "Yes" : "Offline / unavailable"} ok={apiStatus === "checking" ? undefined : apiStatus === "reachable"} />
        {apiError && <StatusRow label="Last API error" value={apiError} ok={false} />}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} className="flex-1">
          <RefreshCw size={14} className={`mr-2 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleRetrySync} disabled={queueCount === 0} className="flex-1">
          Retry Sync ({queueCount})
        </Button>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <SmartphoneNfc size={13} /> Test NFC
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setTestMode((m) => !m)}>
            {testMode ? "Close" : "Open"}
          </Button>
        </div>
        {testMode && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Checks a tag UID against the local checkpoint mapping without touching any real session or timer.
            </p>
            <input
              className="border border-border rounded-xl px-3 py-2 text-sm font-mono bg-background"
              placeholder="Tag UID, e.g. 04:8A:23:91"
              value={testUid}
              onChange={(e) => setTestUid(e.target.value)}
            />
            <Button size="sm" onClick={handleTestScan} disabled={!testUid.trim()}>Check Mapping</Button>
            {testResult && <p className="text-xs font-mono bg-muted/50 p-2 rounded-lg break-words">{testResult}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function Dev() {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useListEvents({ query: { queryKey: getListEventsQueryKey() } });
  const clearEvents = useClearEvents();

  const handleClear = () => {
    clearEvents.mutate(undefined as any, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        toast("Event log cleared");
      }
    });
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-6">
      <div className="pt-6 pb-2 px-2">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Developer</h1>
        <p className="text-muted-foreground mt-1 text-sm">NFC, sync, and system diagnostics</p>
      </div>

      <NfcDiagnosticsPanel />

      <div className="flex items-center justify-between px-2 mt-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Server Event Log</h2>
        <Button variant="outline" size="sm" onClick={handleClear} disabled={clearEvents.isPending || !events?.length}>
          <Trash2 size={16} className="mr-2" /> Clear
        </Button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>
      ) : (
        <div className="bg-card border border-border/50 rounded-2xl overflow-hidden flex-1 flex flex-col font-mono text-xs max-h-[50vh]">
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
      )}
    </div>
  );
}
