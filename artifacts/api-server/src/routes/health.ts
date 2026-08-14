import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Lightweight endpoint for the keep-alive self-ping (see index.ts).
// No DB access — just proves the process is awake and serving requests.
router.get("/ping", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

router.get("/healthz", async (_req, res) => {
  try {
    // Attempt to list columns to verify schema
    const result = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'checkpoint_sessions'
    `);

    res.json({
      status: "ok",
      columns: result.rows.map(r => (r as any).column_name)
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;
