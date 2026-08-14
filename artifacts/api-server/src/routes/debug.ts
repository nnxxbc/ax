import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/debug/schema", async (_req, res) => {
  try {
    const tables = ['checkpoints', 'checkpoint_sessions', 'settings', 'daily_routines', 'nfc_tags'];
    const results: Record<string, any[]> = {};

    for (const table of tables) {
      const result = await db.execute(sql.raw(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '${table}'
        ORDER BY ordinal_position
      `));
      results[table] = result.rows;
    }

    res.json({
      status: "ok",
      schema: results
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message, stack: err.stack });
  }
});

router.post("/debug/reset", async (_req, res) => {
  try {
    await db.execute(sql`DELETE FROM checkpoint_sessions`);
    await db.execute(sql`DELETE FROM daily_routines`);
    res.json({ status: "ok", message: "All sessions and routines cleared" });
  } catch (err: any) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

export default router;
