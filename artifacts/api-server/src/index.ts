import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function runMigrations() {
  logger.info("Running automatic schema migrations...");
  try {
    // Add 'mode' to checkpoint_sessions if it doesn't exist
    await db.execute(sql`
      ALTER TABLE checkpoint_sessions
      ADD COLUMN IF NOT EXISTS mode TEXT;
    `);

    // Add 'type' to checkpoints if it doesn't exist
    await db.execute(sql`
      ALTER TABLE checkpoints
      ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'standard';
    `);

    logger.info("Migrations completed successfully.");
  } catch (err) {
    logger.error({ err }, "Migration failed");
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
