import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SubmitMorningCheckinInput } from "@/lib/morning-checkin-api";
import { queueMorningCheckin } from "@/lib/offline-sync";

// Morning Check-In — inserted between the "Out of Bed" and "Foam Roller /
// Stretch" checkpoints (triggered from home.tsx). Deliberately as low
// cognitive-load as the alarm-dismiss flow itself: one tap for "everything
// is good", at most two taps otherwise, Skip always available. This is NOT
// a mental-health questionnaire — no charts, no clinical labels, nothing
// that can hold up getting to Foam Roller.

const STRESSOR_OPTIONS: { key: string; label: string; emoji: string }[] = [
  { key: "nightmare", label: "Nightmare", emoji: "🌙" },
  { key: "conflict", label: "Fight / conflict", emoji: "⚡" },
  { key: "work_stress", label: "Work stress", emoji: "💼" },
  { key: "relationship_stress", label: "Relationship stress", emoji: "❤️" },
  { key: "home_stress", label: "Home stress", emoji: "🏠" },
  { key: "poor_sleep", label: "Poor sleep", emoji: "😴" },
  { key: "overthinking", label: "Overthinking", emoji: "🧠" },
  { key: "freeze_shutdown", label: "Freeze / shutdown", emoji: "🫥" },
  { key: "other", label: "Other", emoji: "➕" },
];

const IMPACT_LABELS = ["Not much", "Very little", "A little", "Moderate", "A lot", "Extremely"];

type Step = "select" | "impact" | "transition";

export function MorningCheckInScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");

  // Local-first, same philosophy as the NFC scan flow: the check-in is
  // "done" from the user's perspective the moment they finish tapping, and
  // the routine moves on immediately. The write is enqueued durably (see
  // queueMorningCheckin/sync-queue.ts) rather than sent directly, so a
  // missing network connection right after waking up can never lose it —
  // it just syncs whenever the phone reconnects.
  const finish = (payload: SubmitMorningCheckinInput) => {
    setStep("transition");
    queueMorningCheckin(payload);
    setTimeout(onDone, 900);
  };

  const selectEverythingGood = () => {
    finish({ status: "completed", everythingIsGood: true, selectedEvents: [], impactScore: null });
  };

  const toggleStressor = (key: string) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSkip = () => finish({ status: "skipped" });

  const handleContinue = () => {
    if (selected.length === 0) return;
    setStep("impact");
  };

  const handleImpactSelect = (score: number) => {
    finish({
      status: "completed",
      everythingIsGood: false,
      selectedEvents: selected,
      otherText: selected.includes("other") ? otherText.trim() || null : null,
      impactScore: score,
    });
  };

  if (step === "transition") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300 text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
          <span className="text-3xl">🧘</span>
        </div>
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground mb-2">Next</p>
        <h2 className="text-2xl font-bold tracking-tight">Foam Roller</h2>
      </div>
    );
  }

  if (step === "impact") {
    return (
      <div className="flex-1 flex flex-col p-6 animate-in fade-in duration-200 overflow-y-auto">
        <div className="mt-6 mb-10 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">How much did this affect you overall?</h1>
          <p className="text-muted-foreground text-sm mt-2">One overall score for the whole morning.</p>
        </div>
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              onClick={() => handleImpactSelect(score)}
              className="w-full flex items-center gap-4 bg-card border border-border/50 rounded-2xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all p-4"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-lg">
                {score}
              </div>
              <span className="text-base font-medium">{IMPACT_LABELS[score]}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-6">
          <button className="text-sm text-muted-foreground underline underline-offset-4" onClick={() => setStep("select")}>
            Back
          </button>
          <button className="text-sm text-muted-foreground underline underline-offset-4" onClick={handleSkip}>
            Skip
          </button>
        </div>
      </div>
    );
  }

  // step === "select"
  return (
    <div className="flex-1 flex flex-col p-6 animate-in fade-in duration-200 overflow-y-auto">
      <div className="flex items-start justify-between mt-4 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Good morning ☀️</h1>
          <p className="text-muted-foreground text-base mt-2">How are things this morning?</p>
        </div>
        <button className="text-xs text-muted-foreground underline underline-offset-4 mt-2 shrink-0" onClick={handleSkip}>
          Skip
        </button>
      </div>

      <button
        onClick={selectEverythingGood}
        className="w-full text-left bg-primary/10 border border-primary/20 rounded-3xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all p-5 flex items-center gap-4 mb-6"
      >
        <span className="text-3xl">✅</span>
        <span className="text-lg font-semibold text-primary">Everything is good</span>
      </button>

      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 text-center">
        or, what's going on
      </p>

      <div className="grid grid-cols-2 gap-3">
        {STRESSOR_OPTIONS.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <button
              key={opt.key}
              onClick={() => toggleStressor(opt.key)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-4 min-h-[92px] text-center transition-all active:scale-[0.97]",
                active ? "bg-primary/10 border-primary/40" : "bg-card border-border/40",
              )}
            >
              {active && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check size={12} className="text-primary-foreground" strokeWidth={3} />
                </div>
              )}
              <span className="text-2xl">{opt.emoji}</span>
              <span className={cn("text-sm font-medium leading-tight", active ? "text-primary" : "text-foreground")}>
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {selected.includes("other") && (
        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
            What's going on? (optional)
          </label>
          <textarea
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            placeholder="A word or two is enough"
            className="w-full h-16 bg-muted/50 border-none rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none"
          />
        </div>
      )}

      <div className="mt-8 mb-4">
        <button
          onClick={handleContinue}
          disabled={selected.length === 0}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-semibold text-base disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
