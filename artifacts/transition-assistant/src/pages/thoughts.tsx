import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateCheckpoint, getListCheckpointsQueryKey } from "@workspace/api-client-react";
import { Loader2, Archive, Trash2, ArrowUpRight, Inbox as InboxIcon } from "lucide-react";
import { toast } from "sonner";
import { useThoughts, useUpdateThought, useDeleteThought, type ThoughtStatus } from "@/lib/thoughts-api";

const TABS: { key: ThoughtStatus; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "converted", label: "Converted" },
  { key: "archived", label: "Archived" },
];

export function Thoughts() {
  const [tab, setTab] = useState<ThoughtStatus>("inbox");
  const { data: thoughts, isLoading } = useThoughts(tab);
  const updateThought = useUpdateThought();
  const deleteThought = useDeleteThought();
  const createCheckpoint = useCreateCheckpoint();
  const queryClient = useQueryClient();
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const handleArchive = (id: number) => {
    updateThought.mutate({ id, status: "archived" }, { onSuccess: () => toast.success("Archived.") });
  };

  const handleDelete = (id: number) => {
    deleteThought.mutate(id);
  };

  const handleConvert = (id: number, content: string) => {
    setConvertingId(id);
    // Feature 4's "convert" action: turn a captured thought directly into a
    // new (inactive-by-default-off? no — active, but unordered) checkpoint
    // the user can then configure fully from the Stations screen. Keeping
    // this a single tap matches the low-friction philosophy of capture.
    createCheckpoint.mutate(
      {
        data: {
          name: content.length > 60 ? content.slice(0, 57) + "..." : content,
          icon: "MapPin",
          order: 9999,
          isActive: true,
          isRequired: false,
          isRepeatable: true,
          type: "standard",
          defaultDurationMinutes: 0,
        } as any,
      },
      {
        onSuccess: (checkpoint: any) => {
          queryClient.invalidateQueries({ queryKey: getListCheckpointsQueryKey() });
          updateThought.mutate(
            { id, status: "converted", convertedCheckpointId: checkpoint.id },
            {
              onSuccess: () => toast.success("Converted to a station. Edit it from Stations to fine-tune."),
              onSettled: () => setConvertingId(null),
            },
          );
        },
        onError: () => {
          toast.error("Failed to convert");
          setConvertingId(null);
        },
      },
    );
  };

  return (
    <div className="flex-1 p-4 pb-8 flex flex-col gap-4">
      <div className="pt-6 px-2">
        <h1 className="text-2xl font-medium tracking-tight text-foreground">Thought Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">Everything you've captured, organized or not.</p>
      </div>

      <div className="flex gap-2 px-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary w-6 h-6" />
        </div>
      ) : !thoughts || thoughts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-16 text-center px-8">
          <InboxIcon size={32} className="text-muted-foreground/50 mb-3" strokeWidth={1.5} />
          <p className="text-sm text-muted-foreground">
            {tab === "inbox" ? "Nothing captured yet. Use the capture button on any screen." : `No ${tab} thoughts.`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-2">
          {thoughts.map((th: import("@/lib/thoughts-api").Thought) => (
            <div key={th.id} className="bg-card border border-border/40 rounded-2xl p-4">
              <p className="text-sm text-foreground mb-2 whitespace-pre-wrap">{th.content}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {th.category && (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {th.category}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(th.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {tab === "inbox" && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleConvert(th.id, th.content)}
                      disabled={convertingId === th.id}
                      className="text-primary text-xs font-semibold flex items-center gap-1 active:opacity-60 disabled:opacity-40"
                    >
                      <ArrowUpRight size={13} /> Convert
                    </button>
                    <button onClick={() => handleArchive(th.id)} className="text-muted-foreground active:opacity-60">
                      <Archive size={15} />
                    </button>
                    <button onClick={() => handleDelete(th.id)} className="text-muted-foreground active:opacity-60">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
                {tab !== "inbox" && (
                  <button onClick={() => handleDelete(th.id)} className="text-muted-foreground active:opacity-60">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
