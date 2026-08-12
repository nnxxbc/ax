const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const stations = [
  ["OUT OF BED", "Sunrise", 1, 0, 0, true],
  ["STRETCH + FOAM ROLL", "Dumbbell", 2, 10, 5, false],
  ["HYGIENE", "Droplets", 3, 5, 2, false],
  ["SHOWER", "ShowerHead", 4, 10, 5, false],
  ["CLEAN FIRST FLOOR", "Home", 5, 15, 5, false],
  ["CLEAN SECOND FLOOR", "Home", 6, 15, 5, false],
  ["TAKE TRASH OUT", "Trash2", 7, 5, 1, false],
  ["WORK AT DESK", "Monitor", 8, 25, 10, false],
  ["DRINK WATER", "GlassWater", 9, 0, 0, true],
  ["GO TO THE GYM", "Zap", 10, 60, 30, false],
];

async function main() {
  try {
    for (const station of stations) {
      await pool.query(
        `INSERT INTO checkpoints
        (name, icon, "order", default_duration_minutes, min_duration_minutes, complete_on_first_scan)
        VALUES ($1, $2, $3, $4, $5, $6)`,
        station
      );
    }

    console.log("10 STATIONS SEEDED SUCCESSFULLY");
  } catch (error) {
    console.error("SEED FAILED:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();