import { useState } from "react";
import { NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { useCreateThought } from "@/lib/thoughts-api";

/**
 * Phase 3, Feature 4 — Thought Capture.
 *
 * "RAM dump" philosophy: the fastest possible path is open -> type -> save,
 * with category entirely optional. Global FAB (mounted once in AppLayout,
 * see app-layout.tsx) so it's reachable from every screen without adding a
 * 6th bottom-nav item.
 */

const CATEGORIES = [
  { key: null, label: "Uncategorized" },
  { key: "thought", label: "Thought" },
  { key: "task", label: "Task" },
  { key: "idea", label: "Idea" },
  { key: "worry", label: "Worry" },
  { key: "reminder", label: "Reminder" },
] as const;

export function QuickCaptureFab({ hidden }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const createThought = useCreateThought();

  if (hidden) return null;

  const close = () => {
    setOpen(false);
    setContent("");
    setCategory(null);
  };

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      close();
      return;
    }
    createThought.mutate(
      { content: trimmed, category },
      {
        onSuccess: () => toast.success("Captured."),
        onError: () => toast.error("Failed to save — try again."),
      },
    );
    close();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[104px] right-4 z-[55] w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Capture a thought"
      >
        <NotebookPen size={22} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[75] bg-black/40 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-150">
          <div className="w-full max-w-[430px] bg-background rounded-t-[2rem] p-6 pb-safe animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Quick capture</h2>
              <button onClick={close} aria-label="Close" className="text-muted-foreground active:scale-90 transition-transform">
                <X size={20} />
              </button>
            </div>

            <textarea
              autoFocus
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={3}
              className="w-full resize-none rounded-2xl bg-muted p-4 text-base outline-none focus:ring-2 focus:ring-primary/30 mb-4"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              }}
            />

            <div className="flex flex-wrap gap-2 mb-6">
              {CATEGORIES.map((c) => (
                <button
                  key={c.label}
                  onClick={() => setCategory(c.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    category === c.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={createThought.isPending}
              className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
