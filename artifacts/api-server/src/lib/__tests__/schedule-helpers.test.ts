/**
 * Real, executable tests for per-checkpoint day-of-week scheduling.
 * Run with: node --experimental-strip-types src/lib/__tests__/schedule-helpers.test.ts
 * from artifacts/api-server.
 */
import assert from "node:assert/strict";
import { isScheduledForDay, dayOfWeekFromDateString } from "../schedule-helpers.ts";

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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
