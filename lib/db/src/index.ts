import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon (serverless Postgres) can silently drop idle connections — either
  // by suspending compute after inactivity, or by the pooler in front of it
  // closing sockets it considers stale. node-postgres explicitly documents
  // that when a pooled client goes idle and then errors out like this, the
  // POOL itself emits an 'error' event — and if nothing is listening for
  // it, Node crashes the whole process. That was unhandled here, and is
  // the real cause of the "app not working, checkpoints messy/skipped"
  // production incident: every time Neon dropped an idle connection, the
  // API process crashed, Render silently restarted it (looking like a
  // normal redeploy in the dashboard), and any request caught mid-death
  // failed with a bare, code-less "Connection terminated unexpectedly" —
  // exactly what GET /api/checkpoints was logging.
  keepAlive: true,
  // Recycle idle clients well before Neon has a chance to drop them from
  // its side, instead of finding out via a crashed/failed query later.
  idleTimeoutMillis: 10_000,
  // Fail fast — return a real error to the request — instead of hanging
  // forever if a fresh connection can't be established.
  connectionTimeoutMillis: 10_000,
});

// Required by node-postgres: an idle pooled client that errors out (e.g.
// Neon closing the connection from its side) emits 'error' on the pool.
// Without a listener here, that's an unhandled error that crashes the
// entire process — see the comment above. Logging and swallowing it is
// correct: the pool itself discards the broken client and transparently
// opens a fresh one on the next query, so there's nothing else to do.
pool.on("error", (err) => {
  console.error("[db] Idle client error (pool recovers automatically):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
