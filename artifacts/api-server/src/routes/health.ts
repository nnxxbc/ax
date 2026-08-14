import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    // Attempt to list columns to verify schema
    const result = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name \u003d \u0027checkpoint_sessions\u0027
    `);

    res.json({
      status: "ok",
      columns: result.rows.map(r \u003d\u003e r.column_name)
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;
