// Phase 3, Feature 4 — Thought Capture client. Hand-rolled (no orval codegen
// available in this environment) using the same customFetch + React Query
// pattern established in offline-sync.ts for brand-new resources.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type ThoughtStatus = "inbox" | "converted" | "archived";

export interface Thought {
  id: number;
  content: string;
  category: string | null;
  status: ThoughtStatus;
  convertedCheckpointId: number | null;
  convertedTaskId: number | null;
  createdAt: string;
}

const THOUGHTS_KEY = ["thoughts"] as const;

export function useThoughts(status?: ThoughtStatus) {
  return useQuery({
    queryKey: [...THOUGHTS_KEY, status ?? "all"],
    queryFn: () =>
      customFetch<Thought[]>(status ? `/api/thoughts?status=${status}` : "/api/thoughts", {
        method: "GET",
        responseType: "json",
      }),
  });
}

export function useCreateThought() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { content: string; category?: string | null }) =>
      customFetch<Thought>("/api/thoughts", {
        method: "POST",
        body: JSON.stringify(data),
        responseType: "json",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THOUGHTS_KEY });
    },
  });
}

export function useUpdateThought() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<Pick<Thought, "content" | "category" | "status" | "convertedCheckpointId" | "convertedTaskId">>) =>
      customFetch<Thought>(`/api/thoughts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        responseType: "json",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THOUGHTS_KEY });
    },
  });
}

export function useDeleteThought() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<void>(`/api/thoughts/${id}`, { method: "DELETE", responseType: "text" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: THOUGHTS_KEY });
    },
  });
}
