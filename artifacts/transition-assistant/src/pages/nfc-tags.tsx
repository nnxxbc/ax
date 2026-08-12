import { useEffect, useState, useRef, useCallback } from "react";
import {
  useListNfcTags,
  useCreateNfcTag,
  useDeleteNfcTag,
  useUpdateNfcTag,
  getListNfcTagsQueryKey,
  useListCheckpoints,
  getListCheckpointsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Plus,
  Trash2,
  SmartphoneNfc,
  ScanLine,
  CheckCircle2,
  XCircle,
  WifiOff,
  Settings2,
  Pencil,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { nfcService, type NfcAvailability } from "@/services/nfc-service";

// ─── NFC availability banner ──────────────────────────────────────────────────

function NfcStatusBanner({ availability }: { availability: NfcAvailability }) {
  if (availability === "native_available" || availability === "web_simulation") {
    return null;
  }
  return (
    <div className="flex items-start gap-3 bg-destructive/10 border border-destructive/20 rounded-2xl px-4 py-3">
      <WifiOff size={18} className="text-destructive mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-destructive">
          {availability === "native_disabled" ? "NFC is turned off" : "NFC not available"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {availability === "native_disabled"
            ? "Turn on NFC in Android settings to register physical tags."
            : "This device does not have NFC hardware. You can still use simulation."}
        </p>
        {availability === "native_disabled" && (
          <button
            className="text-xs text-primary underline underline-offset-4 mt-1"
            onClick={() => nfcService.openNfcSettings()}
          >
            Open NFC Settings
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Scan-for-registration dialog ────────────────────────────────────────────

type ScanMode = "idle" | "scanning" | "detected" | "error";

interface ScanDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  availability: NfcAvailability;
  onSave: (uid: string, label: string, checkpointId?: number) => void;
  checkpoints: Array<{ id: number; name: string; isActive: boolean }>;
  isSaving: boolean;
  /** When provided, we're replacing/updating this tag's UID */
  existingTagId?: number;
  existingLabel?: string;
  existingCheckpointId?: number;
}

function ScanDialog({
  open,
  onOpenChange,
  availability,
  onSave,
  checkpoints,
  isSaving,
  existingTagId,
  existingLabel = "",
  existingCheckpointId,
}: ScanDialogProps) {
  const [mode, setMode] = useState<ScanMode>("idle");
  const [detectedUid, setDetectedUid] = useState<string>("");
  const [label, setLabel] = useState(existingLabel);
  const [checkpointId, setCheckpointId] = useState<number | undefined>(existingCheckpointId);

  // Sync props when dialog re-opens for a different tag
  useEffect(() => {
    if (open) {
      setMode("idle");
      setDetectedUid("");
      setLabel(existingLabel);
      setCheckpointId(existingCheckpointId);
    }
  }, [open, existingLabel, existingCheckpointId]);

  const handleTagDetected = useCallback((uid: string) => {
    setDetectedUid(uid);
    setMode("detected");
    console.debug(`[NfcTags] Registration scan — UID: ${uid}`);
  }, []);

  const startScan = useCallback(async () => {
    setMode("scanning");
    setDetectedUid("");
    try {
      await nfcService.startScanning(handleTagDetected);
    } catch (err) {
      console.error("[NfcTags] Scan failed:", err);
      setMode("error");
    }
  }, [handleTagDetected]);

  const resetScan = useCallback(async () => {
    await nfcService.stopScanning();
    setMode("idle");
    setDetectedUid("");
  }, []);

  // Stop scanning when dialog closes
  useEffect(() => {
    if (!open) {
      nfcService.stopScanning();
    }
    return () => { nfcService.stopScanning(); };
  }, [open]);

  const handleSave = () => {
    const uid = detectedUid || (availability === "web_simulation"
      ? `sim-${Math.random().toString(36).substring(2, 8)}`
      : "");
    if (!uid) { toast.error("No tag UID — scan a tag first"); return; }
    onSave(uid, label, checkpointId);
  };

  const isNative = nfcService.isNative();
  const isSimMode = availability === "web_simulation";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[92%] max-w-sm translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-xl rounded-3xl border border-border/30">

          <div className="mb-5">
            <h2 className="text-xl font-semibold">
              {existingTagId ? "Replace Tag" : "Register Tag"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isSimMode
                ? "Simulation mode — a random UID will be generated."
                : "Hold your phone near the physical NFC tag."}
            </p>
          </div>

          {/* ── Scan area ── */}
          {!isSimMode && (
            <div className="mb-5">
              {mode === "idle" && (
                <button
                  onClick={startScan}
                  className="w-full flex flex-col items-center gap-3 py-8 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl transition-colors"
                >
                  <ScanLine size={32} className="text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-muted-foreground">
                    Tap to start scanning
                  </span>
                </button>
              )}

              {mode === "scanning" && (
                <div className="w-full flex flex-col items-center gap-3 py-8 border-2 border-dashed border-primary/50 rounded-2xl animate-pulse">
                  <SmartphoneNfc size={32} className="text-primary" strokeWidth={1.5} />
                  <span className="text-sm font-semibold text-primary">
                    Ready — hold phone near tag
                  </span>
                  <button
                    onClick={resetScan}
                    className="text-xs text-muted-foreground underline underline-offset-4 mt-1"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {mode === "detected" && (
                <div className="w-full flex flex-col items-center gap-3 py-6 bg-primary/5 border border-primary/20 rounded-2xl">
                  <CheckCircle2 size={32} className="text-primary" strokeWidth={1.5} />
                  <div className="text-center">
                    <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground mb-1">
                      NFC Tag Detected
                    </p>
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {detectedUid}
                    </p>
                  </div>
                  <button
                    onClick={resetScan}
                    className="text-xs text-muted-foreground underline underline-offset-4"
                  >
                    Scan again
                  </button>
                </div>
              )}

              {mode === "error" && (
                <div className="w-full flex flex-col items-center gap-3 py-6 bg-destructive/5 border border-destructive/20 rounded-2xl">
                  <XCircle size={32} className="text-destructive" strokeWidth={1.5} />
                  <p className="text-sm text-destructive font-medium">Scan failed</p>
                  <button onClick={startScan} className="text-xs text-primary underline underline-offset-4">
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Label ── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Bedside Table"
                className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to Station</label>
              <select
                value={checkpointId ?? ""}
                onChange={(e) =>
                  setCheckpointId(e.target.value ? Number(e.target.value) : undefined)
                }
                className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Unassigned —</option>
                {checkpoints
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-6">
            <Button
              onClick={handleSave}
              disabled={
                isSaving ||
                (!isSimMode && mode !== "detected")
              }
            >
              {isSaving ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : null}
              {existingTagId ? "Update Tag" : "Register Tag"}
            </Button>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Test Tag dialog ───────────────────────────────────────────────────────────

interface TestDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tag: { id: number; tagUid: string; label?: string | null; checkpointName?: string | null } | null;
}

function TestDialog({ open, onOpenChange, tag }: TestDialogProps) {
  const [mode, setMode] = useState<"idle" | "scanning" | "match" | "mismatch">("idle");
  const [scannedUid, setScannedUid] = useState<string>("");

  useEffect(() => {
    if (open) { setMode("idle"); setScannedUid(""); }
    if (!open) nfcService.stopScanning();
    return () => { nfcService.stopScanning(); };
  }, [open]);

  const startTest = async () => {
    setMode("scanning");
    setScannedUid("");
    await nfcService.startScanning((uid) => {
      setScannedUid(uid);
      setMode(uid === tag?.tagUid ? "match" : "mismatch");
      nfcService.stopScanning();
    });
  };

  if (!tag) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-[92%] max-w-sm translate-x-[-50%] translate-y-[-50%] bg-background p-6 shadow-xl rounded-3xl border border-border/30">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">Test Tag</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {tag.checkpointName ?? tag.label ?? tag.tagUid}
            </p>
          </div>

          {mode === "idle" && (
            <div className="flex flex-col items-center gap-4 py-4">
              <FlaskConical size={36} className="text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground text-center">
                Tap the assigned physical tag to verify it matches.
              </p>
              <Button onClick={startTest} className="w-full rounded-2xl h-12">
                Start Test
              </Button>
            </div>
          )}

          {mode === "scanning" && (
            <div className="flex flex-col items-center gap-3 py-8 border-2 border-dashed border-primary/50 rounded-2xl animate-pulse">
              <SmartphoneNfc size={32} className="text-primary" strokeWidth={1.5} />
              <span className="text-sm font-semibold text-primary">Ready — hold phone near tag</span>
            </div>
          )}

          {mode === "match" && (
            <div className="flex flex-col items-center gap-3 py-6 bg-primary/5 border border-primary/20 rounded-2xl">
              <CheckCircle2 size={36} className="text-primary" strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-bold text-primary uppercase tracking-wider">Tag Verified</p>
                <p className="text-sm text-muted-foreground mt-1">{tag.checkpointName ?? tag.label}</p>
                <p className="font-mono text-xs text-muted-foreground mt-1">{scannedUid}</p>
              </div>
            </div>
          )}

          {mode === "mismatch" && (
            <div className="flex flex-col items-center gap-3 py-6 bg-destructive/5 border border-destructive/20 rounded-2xl">
              <XCircle size={36} className="text-destructive" strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-bold text-destructive uppercase tracking-wider">Wrong Tag</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Expected: <span className="font-mono">{tag.tagUid}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Detected: <span className="font-mono">{scannedUid}</span>
                </p>
              </div>
              <button onClick={startTest} className="text-xs text-primary underline underline-offset-4">
                Try again
              </button>
            </div>
          )}

          <Button variant="ghost" className="w-full mt-4" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ─── Main NfcTags page ────────────────────────────────────────────────────────

export function NfcTags() {
  const queryClient = useQueryClient();
  const { data: tags, isLoading } = useListNfcTags({
    query: { queryKey: getListNfcTagsQueryKey() },
  });
  const { data: checkpoints } = useListCheckpoints({
    query: { queryKey: getListCheckpointsQueryKey() },
  });

  const createTag = useCreateNfcTag();
  const updateTag = useUpdateNfcTag();
  const deleteTag = useDeleteNfcTag();

  const [availability, setAvailability] = useState<NfcAvailability>("web_simulation");
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<any>(null); // tag being edited/replaced
  const [testTag, setTestTag] = useState<any>(null);
  const [testDialogOpen, setTestDialogOpen] = useState(false);

  // Check NFC availability on mount
  useEffect(() => {
    nfcService.getAvailability().then(setAvailability);
  }, []);

  const allCheckpoints = checkpoints ?? [];

  const handleSave = (uid: string, label: string, checkpointId?: number) => {
    if (editingTag) {
      // Replacing a tag: if the UID changed, delete old + create new.
      // If only label/checkpoint changed and UID is the same, just patch.
      if (uid !== editingTag.tagUid) {
        // Delete old, then create new with the new UID
        deleteTag.mutate(
          { id: editingTag.id },
          {
            onSuccess: () => {
              createTag.mutate(
                { data: { tagUid: uid, label: label || undefined, checkpointId } },
                {
                  onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
                    setScanDialogOpen(false);
                    setEditingTag(null);
                    toast.success("Tag replaced");
                  },
                  onError: () => toast.error("Failed to register new tag"),
                }
              );
            },
            onError: () => toast.error("Failed to remove old tag"),
          }
        );
      } else {
        // Same UID — only label/checkpoint changed
        updateTag.mutate(
          { id: editingTag.id, data: { label: label || undefined, checkpointId } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
              setScanDialogOpen(false);
              setEditingTag(null);
              toast.success("Tag updated");
            },
            onError: () => toast.error("Failed to update tag"),
          }
        );
      }
    } else {
      // New tag
      createTag.mutate(
        { data: { tagUid: uid, label: label || undefined, checkpointId } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
            setScanDialogOpen(false);
            toast.success("Tag registered");
          },
          onError: (err: any) => {
            const msg = err?.response?.data?.error ?? "Failed to register tag";
            toast.error(msg);
          },
        }
      );
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this NFC tag mapping?")) return;
    deleteTag.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
          toast("Tag deleted");
        },
      }
    );
  };

  const openAddDialog = () => {
    setEditingTag(null);
    setScanDialogOpen(true);
  };

  const openEditDialog = (tag: any) => {
    setEditingTag(tag);
    setScanDialogOpen(true);
  };

  const openTestDialog = (tag: any) => {
    setTestTag(tag);
    setTestDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="animate-spin text-primary w-8 h-8" />
      </div>
    );
  }

  const isMutating = createTag.isPending || updateTag.isPending;

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      {/* Header */}
      <div className="pt-6 pb-2 px-2 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">NFC Tags</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {availability === "native_available"
              ? "Real NFC — hold phone near tag to register."
              : availability === "web_simulation"
              ? "Simulation mode — UIDs are auto-generated."
              : "NFC unavailable — simulation still works."}
          </p>
        </div>
        <Button size="icon" className="rounded-full" onClick={openAddDialog}>
          <Plus />
        </Button>
      </div>

      {/* NFC status banner */}
      <NfcStatusBanner availability={availability} />

      {/* Tag list */}
      <div className="flex flex-col gap-3">
        {!tags || tags.length === 0 ? (
          <div className="text-center p-8 bg-card rounded-3xl border border-border/50 border-dashed">
            <SmartphoneNfc className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground mb-3">No tags registered.</p>
            <Button variant="outline" onClick={openAddDialog} className="rounded-2xl">
              <Plus size={16} className="mr-2" />
              Register first tag
            </Button>
          </div>
        ) : (
          tags.map((tag) => (
            <Card key={tag.id} className="shadow-sm border-border/40">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground truncate">
                      {tag.label || tag.checkpointName || "Unlabelled Tag"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {tag.checkpointName
                        ? `Assigned to: ${tag.checkpointName}`
                        : "Unassigned"}
                    </p>
                    <p className="text-xs text-muted-foreground/60 font-mono mt-1 truncate">
                      {tag.tagUid}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Test — only shown in native mode */}
                    {nfcService.isNative() && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Test tag"
                        onClick={() => openTestDialog(tag)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <FlaskConical size={16} />
                      </Button>
                    )}
                    {/* Edit / replace */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit / replace tag"
                      onClick={() => openEditDialog(tag)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Pencil size={16} />
                    </Button>
                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete tag"
                      onClick={() => handleDelete(tag.id)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Register / Edit dialog */}
      <ScanDialog
        open={scanDialogOpen}
        onOpenChange={(v) => { setScanDialogOpen(v); if (!v) setEditingTag(null); }}
        availability={availability}
        onSave={handleSave}
        checkpoints={allCheckpoints}
        isSaving={isMutating}
        existingTagId={editingTag?.id}
        existingLabel={editingTag?.label ?? ""}
        existingCheckpointId={editingTag?.checkpointId ?? undefined}
      />

      {/* Test dialog */}
      <TestDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        tag={testTag}
      />
    </div>
  );
}
