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

runMigrations().then(() => {
  app.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "Server listening on 0.0.0.0");
  });
});
