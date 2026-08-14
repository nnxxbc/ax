import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/debug/schema", async (_req, res) => {
  try {
    const tables = ['checkpoints', 'checkpoint_sessions', 'settings', 'daily_routines', 'nfc_tags'];
    const results: Record<string, string[]> = {};

    for (const table of tables) {
      const result = await db.execute(sql.raw(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = '${table}'
        ORDER BY ordinal_position
      `));
      results[table] = result.rows.map((r: any) => r.column_name);
    }

    res.json({
      status: "ok",
      schema: results
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message, stack: err.stack });
  }
});

export default router;
