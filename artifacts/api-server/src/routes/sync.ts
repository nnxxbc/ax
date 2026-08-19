import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, eventLogTable } from "@workspace/db";
import { processNfcScan } from "../lib/nfc-scan-processor";
import { logEvent } from "../lib/event-logger";
import { recordMorningCheckin } from "./morning-checkins";

const router = Router();

/**
 * POST /api/sync/events
 *
 * Idempotent replay endpoint for the offline sync queue
 * (artifacts/transition-assistant/src/lib/sync-queue.ts).
 *
 * Each event carries a client-generated `clientEventId`. Before applying
 * anything, we check whether that id already has an event_log row — if it
 * does, this is a retry of something we already processed (e.g. the
 * response to the first attempt got lost, or the client re-sent the whole
 * pending queue), and we return success without touching the database
 * again. `client_event_id` also has a DB-level UNIQUE constraint as a
 * second line of defense against a race where two requests for the same
 * event land concurrently — that insert would fail and is caught below.
 *
 * `checkpoint_scan` events are replayed through the exact same
 * processNfcScan() used for live/online scans, in the order the client
 * queued them — so catching up after being offline produces the identical
 * sequence of start/complete transitions that would have happened if each
 * scan had synced immediately. Debounce is bypassed for replay (see
 * nfc-scan-processor.ts) since queued events already represent physically
 * distinct, on-device-deduped scans.
 */
router.post("/sync/events", async (req, res): Promise<void> => {
  const body = req.body;
  const events = Array.isArray(body?.events) ? body.events : [body];

  const results: Array<{ clientEventId: string; ok: boolean; alreadyApplied?: boolean; error?: string }> = [];

  for (const evt of events) {
    const clientEventId = evt?.clientEventId;
    if (!clientEventId || typeof clientEventId !== "string") {
      results.push({ clientEventId: String(clientEventId ?? ""), ok: false, error: "Missing clientEventId" });
      continue;
    }

    try {
      const [existing] = await db
        .select({ id: eventLogTable.id })
        .from(eventLogTable)
        .where(eq(eventLogTable.clientEventId, clientEventId));

      if (existing) {
        results.push({ clientEventId, ok: true, alreadyApplied: true });
        continue;
      }

      if (evt.type === "checkpoint_scan") {
        const checkpointId = Number(evt.checkpointId);
        if (!Number.isFinite(checkpointId)) {
          results.push({ clientEventId, ok: false, error: "Invalid checkpointId" });
          continue;
        }

        const result = await processNfcScan(req, checkpointId, { bypassDebounce: true });

        await logEvent(req, `sync_${result.action}`, `Synced: ${result.message ?? result.action}`, {
          checkpointId,
          sessionId: result.sessionId ?? null,
          details: JSON.stringify({ occurredAt: evt.occurredAt, replay: true }),
          clientEventId,
        });

        results.push({ clientEventId, ok: true });
        continue;
      }

      if (evt.type === "morning_checkin") {
        const row = await recordMorningCheckin(evt.payload ?? {});

        await logEvent(req, "morning_checkin_synced", `Morning check-in synced: ${row?.status ?? "unknown"}`, {
          details: JSON.stringify({ occurredAt: evt.occurredAt, replay: true }),
          clientEventId,
        });

        results.push({ clientEventId, ok: true });
        continue;
      }

      if (evt.type === "emergency_unlock") {
        await logEvent(req, "emergency_unlock", "Emergency unlock used", {
          details: JSON.stringify({ occurredAt: evt.occurredAt, reason: evt.payload?.reason ?? null }),
          clientEventId,
        });
        results.push({ clientEventId, ok: true });
        continue;
      }

      results.push({ clientEventId, ok: false, error: `Unknown event type: ${evt.type}` });
    } catch (err: any) {
      // Unique-constraint violation on client_event_id means a concurrent
      // request already applied this exact event — treat as success, not
      // a failure to retry.
      if (err?.code === "23505") {
        results.push({ clientEventId, ok: true, alreadyApplied: true });
        continue;
      }
      req.log.error({ err, clientEventId }, "Sync event failed");
      results.push({ clientEventId, ok: false, error: err.message || "Unknown sync error" });
    }
  }

  res.json({ results });
});

export default router;
