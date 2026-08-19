// Morning Check-In client. Hand-rolled (no orval codegen available in this
// environment), same convention as thoughts-api.ts for brand-new resources.
//
// Reads go straight to the server (useTodayMorningCheckin, below) — same
// pattern as useGetTodayRoutine. Writes do NOT go through customFetch
// directly: they're enqueued via queueMorningCheckin() in offline-sync.ts
// and drained by the same durable sync queue that carries checkpoint scans
// (see sync-queue.ts / routes/sync.ts), because a morning check-in happens
// right when the phone may not have wifi yet, and losing it silently would
// leave a gap in the day-over-day pattern data the feature exists to build.
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type MorningCheckinStatus = "completed" | "skipped";

export interface MorningCheckin {
  id: number;
  date: string;
  selectedEvents: string; // JSON string array — parse with parseMorningEvents()
  otherText: string | null;
  impactScore: number | null;
  everythingIsGood: boolean;
  status: MorningCheckinStatus;
  createdAt: string;
}

export function parseMorningEvents(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const TODAY_KEY = ["morning-checkin", "today"] as const;

export function useTodayMorningCheckin() {
  return useQuery({
    queryKey: TODAY_KEY,
    queryFn: () =>
      customFetch<MorningCheckin | null>("/api/morning-checkins/today", { method: "GET", responseType: "json" }),
  });
}

export interface SubmitMorningCheckinInput {
  status: MorningCheckinStatus;
  everythingIsGood?: boolean;
  selectedEvents?: string[];
  otherText?: string | null;
  impactScore?: number | null;
}
