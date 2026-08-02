import { useListNfcTags, useCreateNfcTag, useDeleteNfcTag, getListNfcTagsQueryKey, useListCheckpoints, getListCheckpointsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, SmartphoneNfc } from "lucide-react";
import { toast } from "sonner";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { format, parseISO } from "date-fns";

export function NfcTags() {
  const queryClient = useQueryClient();
  const { data: tags, isLoading } = useListNfcTags({ query: { queryKey: getListNfcTagsQueryKey() } });
  const { data: checkpoints } = useListCheckpoints({ query: { queryKey: getListCheckpointsQueryKey() } });
  
  const createTag = useCreateNfcTag();
  const deleteTag = useDeleteNfcTag();

  const [isAdding, setIsAdding] = useState(false);
  const [newUid, setNewUid] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCheckpointId, setNewCheckpointId] = useState<number | undefined>();

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;
  }

  const handleCreate = () => {
    if (!newUid) {
      toast.error("UID is required");
      return;
    }
    createTag.mutate({ data: { tagUid: newUid, label: newLabel, checkpointId: newCheckpointId } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
        setIsAdding(false);
        setNewUid("");
        setNewLabel("");
        setNewCheckpointId(undefined);
        toast.success("Tag registered");
      }
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Delete this tag?")) {
      deleteTag.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListNfcTagsQueryKey() });
          toast("Tag deleted");
        }
      });
    }
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      <div className="pt-6 pb-2 px-2 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">NFC Tags</h1>
          <p className="text-muted-foreground mt-1">Manage physical touchpoints.</p>
        </div>
        <Button size="icon" className="rounded-full" onClick={() => {
          setNewUid(`sim-${Math.random().toString(36).substring(2, 8)}`);
          setIsAdding(true);
        }}>
          <Plus />
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {(!tags || tags.length === 0) ? (
          <div className="text-center p-8 bg-card rounded-3xl border border-border/50 border-dashed">
            <SmartphoneNfc className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No tags registered.</p>
            <Button variant="link" onClick={() => setIsAdding(true)}>Simulate adding one</Button>
          </div>
        ) : (
          tags.map((tag) => (
            <Card key={tag.id} className="shadow-sm border-border/40">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground">{tag.label || tag.tagUid}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {tag.checkpointName ? `Assigned to: ${tag.checkpointName}` : 'Unassigned'}
                  </p>
                  <p className="text-xs text-muted-foreground/60 font-mono mt-1">{tag.tagUid}</p>
                </div>
                <Button variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(tag.id)}>
                  <Trash2 size={18} />
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <DialogPrimitive.Root open={isAdding} onOpenChange={setIsAdding}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 grid w-[90%] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-[2rem] rounded-3xl">
            <div className="flex flex-col space-y-1.5 text-left mb-4">
              <h2 className="text-xl font-semibold">Register Tag</h2>
              <p className="text-sm text-muted-foreground">Simulate tapping a new physical NFC tag.</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tag UID (Simulated)</label>
                <input 
                  type="text" 
                  value={newUid} 
                  onChange={e => setNewUid(e.target.value)}
                  className="flex h-12 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  readOnly
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Label (Optional)</label>
                <input 
                  type="text" 
                  value={newLabel} 
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. Bedside Table Tag"
                  className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Assign to Station</label>
                <select 
                  value={newCheckpointId || ""} 
                  onChange={e => setNewCheckpointId(e.target.value ? Number(e.target.value) : undefined)}
                  className="flex h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">-- Unassigned --</option>
                  {checkpoints?.filter(c=>c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={handleCreate} disabled={createTag.isPending}>Register Tag</Button>
              <Button variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}