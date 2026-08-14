// Phase 3, Features 7/8 — Frozen Protocol event logging client. Hand-rolled
// for the same reason as thoughts-api.ts (brand-new resource, no codegen).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface FrozenEvent {
  id: number;
  bedCheckpointId: number;
  bedSessionId: number | null;
  startedAt: string;
  completedAt: string | null;
  destinationCheckpointId: number | null;
  stepsAttempted: string[];
  tooHardCount: number;
  successfulTransition: boolean;
  recoveryDurationSeconds: number | null;
  createdAt: string;
}

const FROZEN_KEY = ["frozen-events"] as const;

export function useStartFrozenEvent() {
  return useMutation({
    mutationFn: (data: { bedCheckpointId: number; bedSessionId?: number | null }) =>
      customFetch<FrozenEvent>("/api/frozen-events", {
        method: "POST",
        body: JSON.stringify(data),
        responseType: "json",
      }),
  });
}

export function useAppendFrozenStep() {
  return useMutation({
    mutationFn: ({ id, step }: { id: number; step: string }) =>
      customFetch<FrozenEvent>(`/api/frozen-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ appendStep: step }),
        responseType: "json",
      }),
  });
}

export function useCompleteFrozenEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, destinationCheckpointId }: { id: number; destinationCheckpointId?: number | null }) =>
      customFetch<FrozenEvent>(`/api/frozen-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ complete: true, destinationCheckpointId }),
        responseType: "json",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FROZEN_KEY });
    },
  });
}
