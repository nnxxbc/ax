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

      // event_log updates — offline sync idempotency key (see routes/sync.ts)
      "ALTER TABLE event_log ADD COLUMN IF NOT EXISTS client_event_id TEXT;",
      "DO $$ BEGIN " +
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_log_client_event_id_unique') THEN " +
        "ALTER TABLE event_log ADD CONSTRAINT event_log_client_event_id_unique UNIQUE (client_event_id); " +
        "END IF; " +
      "END $$;",

      // ── Phase 3 ──────────────────────────────────────────────────────────
      // checkpoints — per-checkpoint enforcement override
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS enforcement_override TEXT;",

      // checkpoints — per-checkpoint day-of-week scheduling (0=Sun..6=Sat,
      // JSON array; empty array = every day)
      "ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS days_of_week TEXT NOT NULL DEFAULT '[]';",

      // settings — morning alarm
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS alarm_days_of_week TEXT NOT NULL DEFAULT '[1,2,3,4,5]';",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS alarm_requires_nfc_dismissal BOOLEAN NOT NULL DEFAULT FALSE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS alarm_target_checkpoint_id INTEGER;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS alarm_sound_enabled BOOLEAN NOT NULL DEFAULT TRUE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS alarm_vibration_enabled BOOLEAN NOT NULL DEFAULT TRUE;",

      // settings — unified notification preferences
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_timer_enabled BOOLEAN NOT NULL DEFAULT TRUE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_transition_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS transition_reminder_delay_minutes INTEGER NOT NULL DEFAULT 15;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_missed_checkpoint_enabled BOOLEAN NOT NULL DEFAULT TRUE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_check_ins_enabled BOOLEAN NOT NULL DEFAULT FALSE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS check_in_interval_minutes INTEGER NOT NULL DEFAULT 120;",

      // settings — quiet hours
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE;",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS quiet_hours_start TEXT NOT NULL DEFAULT '23:00';",
      "ALTER TABLE settings ADD COLUMN IF NOT EXISTS quiet_hours_end TEXT NOT NULL DEFAULT '08:00';",

      // thoughts — new table (Feature 4)
      `CREATE TABLE IF NOT EXISTS thoughts (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'inbox',
        converted_checkpoint_id INTEGER,
        converted_task_id INTEGER,
        created_at TEXT NOT NULL DEFAULT 'now()'
      );`,

      // frozen_events — new table (Features 7/8)
      `CREATE TABLE IF NOT EXISTS frozen_events (
        id SERIAL PRIMARY KEY,
        bed_checkpoint_id INTEGER NOT NULL,
        bed_session_id INTEGER,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        destination_checkpoint_id INTEGER,
        steps_attempted TEXT NOT NULL DEFAULT '[]',
        too_hard_count INTEGER NOT NULL DEFAULT 0,
        successful_transition BOOLEAN NOT NULL DEFAULT FALSE,
        recovery_duration_seconds INTEGER,
        created_at TEXT NOT NULL DEFAULT 'now()'
      );`,

      // morning_checkins — new table (Morning Check-In, inserted between the
      // "Out of Bed" and "Foam Roller / Stretch" checkpoints). One row per
      // calendar day, enforced by the UNIQUE constraint below.
      `CREATE TABLE IF NOT EXISTS morning_checkins (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        selected_events TEXT NOT NULL DEFAULT '[]',
        other_text TEXT,
        impact_score INTEGER,
        everything_is_good BOOLEAN NOT NULL DEFAULT FALSE,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL DEFAULT 'now()'
      );`,
      "DO $$ BEGIN " +
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'morning_checkins_date_unique') THEN " +
        "ALTER TABLE morning_checkins ADD CONSTRAINT morning_checkins_date_unique UNIQUE (date); " +
        "END IF; " +
      "END $$;",
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
