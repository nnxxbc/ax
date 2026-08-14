/**
 * nfc-state-machine.ts — the local-first decision logic for what a physical
 * NFC scan means, given only what's already on the device.
 *
 * This is a deliberate 1:1 mirror of the server's processNfcScan()
 * (artifacts/api-server/src/lib/nfc-scan-processor.ts) so the device and
 * the backend always converge on the same answer. The device just doesn't
 * wait for the backend to say so — it decides immediately from its own
 * cached copy of today's sessions, updates the UI, and queues the same
 * fact for the backend to durably record whenever it can.
 *
 * Pure functions only — no fetch, no storage, no React. This file is
 * exercised directly by scripts/src/test-nfc-state-machine.ts.
 */

export type LocalSessionStatus = "waiting" | "in_progress" | "completed";

export interface LocalSession {
  /** Real server id once known; a "local-…" id for sessions not yet synced. */
  id: string;
  routineId: string;
  checkpointId: number;
  checkpointName: string;
  status: LocalSessionStatus;
  order: number;
  startedAt: string | null; // ISO
  completedAt: string | null; // ISO
  durationMinutes: number | null;
  targetDurationMinutes: number | null;
  minDurationMinutes: number | null;
  mode: string | null;
  checkpointType?: string;
  /** True until the backend has confirmed this exact session's current state. */
  pendingSync: boolean;
}

export interface LocalCheckpoint {
  id: number;
  name: string;
  minDurationMinutes: number | null;
  targetDurationMinutes: number | null;
  completeOnFirstScan: boolean;
  checkpointType?: string;
  /** "Repeatable" toggle from the Stations edit screen. Defaults to true to
   * match the checkpoints table's own default, so existing callers that
   * don't pass it keep today's unlimited-repeat behavior. */
  isRepeatable?: boolean;
}

export type ScanAction =
  | "started"
  | "completed"
  | "early_complete_warning"
  | "repeat_started"
  | "already_completed";

export interface ScanResult {
  action: ScanAction;
  session: LocalSession;
  /** All sessions for the routine, with `session` patched in/replacing the matching one. */
  sessions: LocalSession[];
  elapsedMinutes: number;
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/**
 * Decide what a scan of `checkpoint` means right now, given the current
 * local session cache, and return the patched session list. Never throws;
 * never touches the network. Mirrors processNfcScan()'s branching exactly:
 *   in_progress  → complete (or early-warning if under minDuration)
 *   waiting      → start (or start+complete if completeOnFirstScan)
 *   neither      → new repeatable session, started
 */
export function processLocalScan(
  sessions: LocalSession[],
  checkpoint: LocalCheckpoint,
  routineId: string,
  now: Date = new Date(),
): ScanResult {
  const nowIso = now.toISOString();
  const forCheckpoint = sessions.filter((s) => s.checkpointId === checkpoint.id);
  const inProgress = forCheckpoint.find((s) => s.status === "in_progress");
  const waiting = forCheckpoint.find((s) => s.status === "waiting");

  if (inProgress) {
    const startedAt = inProgress.startedAt ? new Date(inProgress.startedAt) : now;
    const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 60000;
    const minDuration = inProgress.minDurationMinutes ?? 0;

    if (minDuration > 0 && elapsedMinutes < minDuration) {
      return {
        action: "early_complete_warning",
        session: inProgress,
        sessions,
        elapsedMinutes,
      };
    }

    const roundedMinutes = Math.round(elapsedMinutes * 10000) / 10000;
    const completed: LocalSession = {
      ...inProgress,
      status: "completed",
      completedAt: nowIso,
      durationMinutes: roundedMinutes,
      pendingSync: true,
    };

    return {
      action: "completed",
      session: completed,
      sessions: sessions.map((s) => (s.id === completed.id ? completed : s)),
      elapsedMinutes,
    };
  }

  if (waiting) {
    if (checkpoint.completeOnFirstScan) {
      const completed: LocalSession = {
        ...waiting,
        status: "completed",
        startedAt: nowIso,
        completedAt: nowIso,
        durationMinutes: 0,
        pendingSync: true,
      };
      return {
        action: "completed",
        session: completed,
        sessions: sessions.map((s) => (s.id === completed.id ? completed : s)),
        elapsedMinutes: 0,
      };
    }

    const started: LocalSession = {
      ...waiting,
      status: "in_progress",
      startedAt: nowIso,
      pendingSync: true,
    };
    return {
      action: "started",
      session: started,
      sessions: sessions.map((s) => (s.id === started.id ? started : s)),
      elapsedMinutes: 0,
    };
  }

  // No waiting/in_progress session for this checkpoint. If it's marked
  // not-repeatable and it's already done today, re-scanning it shouldn't
  // silently pile up a duplicate entry in the routine list — treat it as a
  // no-op and point back at the existing completed session.
  if (checkpoint.isRepeatable === false) {
    const alreadyDone = forCheckpoint.find((s) => s.status === "completed");
    if (alreadyDone) {
      return {
        action: "already_completed",
        session: alreadyDone,
        sessions,
        elapsedMinutes: 0,
      };
    }
  }

  // Flexible order lets any (repeatable) checkpoint be (re)started at any
  // time, unlimited repeats.
  const created: LocalSession = {
    id: newLocalId(),
    routineId,
    checkpointId: checkpoint.id,
    checkpointName: checkpoint.name,
    status: "in_progress",
    order: forCheckpoint[0]?.order ?? 0,
    startedAt: nowIso,
    completedAt: null,
    durationMinutes: null,
    targetDurationMinutes: checkpoint.targetDurationMinutes ?? null,
    minDurationMinutes: checkpoint.minDurationMinutes ?? null,
    mode: null,
    checkpointType: checkpoint.checkpointType,
    pendingSync: true,
  };

  return {
    action: "repeat_started",
    session: created,
    sessions: [...sessions, created],
    elapsedMinutes: 0,
  };
}

/** Recompute elapsed time for an in-progress session from its timestamp — never a running JS timer. */
export function computeElapsedSeconds(session: LocalSession, now: Date = new Date()): number | null {
  if (session.status !== "in_progress" || !session.startedAt) return null;
  return Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000);
}

export interface StuckCheckOptions {
  /** Hours after which an in-progress session is considered possibly-abandoned. Default 2h. */
  thresholdHours?: number;
}

/** True if a session has been in_progress far longer than any reasonable checkpoint should take. */
export function isSessionStuck(session: LocalSession, now: Date = new Date(), opts: StuckCheckOptions = {}): boolean {
  if (session.status !== "in_progress" || !session.startedAt) return false;
  const thresholdMs = (opts.thresholdHours ?? 2) * 60 * 60 * 1000;
  return now.getTime() - new Date(session.startedAt).getTime() > thresholdMs;
}
