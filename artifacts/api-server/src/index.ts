import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function runMigrations() {
  logger.info("Running automatic schema migrations...");
  try {
    const migrationCommands = [
      // checkpoint_sessions updates
      "ALTER TABLE checkpoint_sessions ADD COLUMN IF NOT EXISTS mode TEXT;",
      "ALTER TABLE checkpoint_sessions ADD COLUMN IF NOT EXISTS duration_minutes REAL;",
      "ALTER TABLE checkpoint_sessions ADD COLUMN IF NOT EXISTS target_duration_minutes REAL;",
      "ALTER TABLE checkpoint_sessions ADD COLUMN IF NOT EXISTS min_duration_minutes REAL;",

      // checkpoints updates
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'standard';",
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE;",
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN NOT NULL DEFAULT TRUE;",
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS default_duration_minutes REAL NOT NULL DEFAULT 0;",
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS min_duration_minutes REAL NOT NULL DEFAULT 0;",
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS complete_on_first_scan BOOLEAN NOT NULL DEFAULT FALSE;",

      // daily_routines updates
      "ALTER TABLE daily_routines ADD COLUMN IF NOT EXISTS completed_at TEXT;",

      // settings updates
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS enforcement_level TEXT NOT NULL DEFAULT 'off';",
    ];

    for (const cmd of migrationCommands) {
      try {
        await db.execute(sql.raw(cmd));
        logger.info({ command: cmd }, "Migration step executed");
      } catch (cmdErr: any) {
        logger.error({ err: cmdErr.message, command: cmd }, "Migration step failed");
      }
    }

    logger.info("Migrations check completed.");
  } catch (err: any) {
    logger.error({ err: err.message, stack: err.stack }, "Migration process crashed");
  }
}

const rawPort = process.env["PORT"];
if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Keep-alive self-ping ───────────────────────────────────────────────────
// Render's free tier spins the service down after ~15 minutes with no
// incoming HTTP traffic, which then makes the NEXT real request (e.g. an
// NFC scan from the phone) hit a cold start and can surface as a bodyless
// HTTP 500 while the instance wakes up. To avoid that, once we're live we
// ping our own public health endpoint on an interval — Render only counts
// *incoming* requests toward the inactivity timer, so this keeps the
// instance from ever going to sleep in the first place.
//
// RENDER_EXTERNAL_URL is injected automatically by Render for web services;
// KEEP_ALIVE_URL is an optional manual override for other hosts. If neither
// is set (e.g. local dev), the ping is simply skipped.
const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000; // 10 min — under Render's ~15 min idle timeout

function startKeepAlivePing() {
  const baseUrl = process.env["KEEP_ALIVE_URL"] || process.env["RENDER_EXTERNAL_URL"];
  if (!baseUrl) {
    logger.info("KEEP_ALIVE_URL/RENDER_EXTERNAL_URL not set — skipping keep-alive self-ping (expected in local dev).");
    return;
  }

  const pingUrl = `${baseUrl.replace(/\/+$/, "")}/api/ping`;

  const ping = async () => {
    try {
      const res = await fetch(pingUrl);
      logger.info({ pingUrl, status: res.status }, "Keep-alive ping");
    } catch (err: any) {
      logger.warn({ pingUrl, err: err.message }, "Keep-alive ping failed");
    }
  };

  setInterval(ping, KEEP_ALIVE_INTERVAL_MS);
  logger.info({ pingUrl, intervalMs: KEEP_ALIVE_INTERVAL_MS }, "Keep-alive self-ping scheduled");
}

runMigrations().then(() => {
  app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Server listening on 0.0.0.0");
    startKeepAlivePing();
  });
});
