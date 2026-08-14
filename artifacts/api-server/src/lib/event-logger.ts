import type { Request } from "express";
import { db, eventLogTable } from "@workspace/db";

export async function logEvent(
  req: Request,
  eventType: string,
  message: string,
  opts: { checkpointId?: number | null; sessionId?: number | null; details?: string; clientEventId?: string } = {}
): Promise<void> {
  try {
    await db.insert(eventLogTable).values({
      eventType,
      message,
      checkpointId: opts.checkpointId ?? null,
      sessionId: opts.sessionId ?? null,
      details: opts.details ?? null,
      clientEventId: opts.clientEventId ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to log event");
  }
}
