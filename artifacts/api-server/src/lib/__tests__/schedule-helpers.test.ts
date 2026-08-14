/**
 * Real, executable tests for per-checkpoint day-of-week scheduling.
 * Run with: node --experimental-strip-types src/lib/__tests__/schedule-helpers.test.ts
 * from artifacts/api-server.
 */
import assert from "node:assert/strict";
import { isScheduledForDay, dayOfWeekFromDateString, sortSessionsByCheckpointOrder } from "../schedule-helpers.ts";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
  }
}

test("empty array means every day", () => {
  for (let d = 0; d <= 6; d++) assert.equal(isScheduledForDay([], d), true);
});

test("Mon/Thu checkpoint (trash) is scheduled on Monday", () => {
  assert.equal(isScheduledForDay([1, 4], 1), true);
});

test("Mon/Thu checkpoint (trash) is scheduled on Thursday", () => {
  assert.equal(isScheduledForDay([1, 4], 4), true);
});

test("Mon/Thu checkpoint is NOT scheduled on Wednesday", () => {
  assert.equal(isScheduledForDay([1, 4], 3), false);
});

test("Mon/Thu checkpoint is NOT scheduled on Sunday", () => {
  assert.equal(isScheduledForDay([1, 4], 0), false);
});

test("single-day checkpoint only matches that day", () => {
  assert.equal(isScheduledForDay([6], 6), true);
  assert.equal(isScheduledForDay([6], 5), false);
});

test("dayOfWeekFromDateString: known Monday", () => {
  // 2026-08-17 is a Monday
  assert.equal(dayOfWeekFromDateString("2026-08-17"), 1);
});

test("dayOfWeekFromDateString: known Thursday", () => {
  // 2026-08-13 is a Thursday
  assert.equal(dayOfWeekFromDateString("2026-08-13"), 4);
});

test("dayOfWeekFromDateString: known Sunday", () => {
  // 2026-08-16 is a Sunday
  assert.equal(dayOfWeekFromDateString("2026-08-16"), 0);
});

test("sortSessionsByCheckpointOrder: follows the checkpoint's CURRENT order, not the session's stored one", () => {
  // Session rows still carry the order they were created with (1, 2, 3 —
  // the original checkpoint order at the time), but the checkpoints have
  // since been reordered in Stations (trash moved to be second).
  const sessions = [
    { id: 1, checkpointId: 10, order: 1 }, // "Out of Bed"
    { id: 2, checkpointId: 20, order: 2 }, // "Hygiene"
    { id: 3, checkpointId: 30, order: 3 }, // "Take Trash Out" — reordered to run 2nd
  ];
  const currentOrder = new Map([
    [10, 1], // Out of Bed still 1st
    [30, 2], // Take Trash Out now 2nd
    [20, 3], // Hygiene pushed to 3rd
  ]);

  const sorted = sortSessionsByCheckpointOrder(sessions, currentOrder);

  assert.deepEqual(sorted.map((s) => s.checkpointId), [10, 30, 20], "must reflect the live Stations order, not the stale snapshot");
});

test("sortSessionsByCheckpointOrder: falls back to the session's own order if its checkpoint was deleted", () => {
  const sessions = [
    { id: 1, checkpointId: 10, order: 2 },
    { id: 2, checkpointId: 99, order: 1 }, // checkpoint 99 no longer exists
  ];
  const currentOrder = new Map([[10, 2]]); // no entry for 99

  const sorted = sortSessionsByCheckpointOrder(sessions, currentOrder);

  assert.deepEqual(sorted.map((s) => s.id), [2, 1], "missing checkpoint falls back to the session's stored order (1 < 2)");
});

test("sortSessionsByCheckpointOrder: does not mutate the input array", () => {
  const sessions = [
    { id: 1, checkpointId: 10, order: 2 },
    { id: 2, checkpointId: 20, order: 1 },
  ];
  const original = [...sessions];
  sortSessionsByCheckpointOrder(sessions, new Map([[10, 2], [20, 1]]));
  assert.deepEqual(sessions, original, "must return a new array, not sort in place");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
