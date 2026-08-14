/**
 * Real, executable tests for the Phase 3 morning alarm pure logic.
 * Run with: node --experimental-strip-types src/lib/__tests__/alarm-rules.test.ts
 * from artifacts/transition-assistant.
 */
import assert from "node:assert/strict";
import {
  dayOfWeekToCapacitorWeekday,
  parseAlarmTime,
  isAlarmActiveNow,
  dateKey,
} from "../alarm-rules.ts";

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

// ── dayOfWeekToCapacitorWeekday ────────────────────────────────────────

test("Sunday (0) maps to Capacitor Weekday 1", () => {
  assert.equal(dayOfWeekToCapacitorWeekday(0), 1);
});

test("Saturday (6) maps to Capacitor Weekday 7", () => {
  assert.equal(dayOfWeekToCapacitorWeekday(6), 7);
});

test("Monday (1) maps to Capacitor Weekday 2", () => {
  assert.equal(dayOfWeekToCapacitorWeekday(1), 2);
});

// ── parseAlarmTime ───────────────────────────────────────────────────────

test("parses a valid HH:MM", () => {
  assert.deepEqual(parseAlarmTime("07:15"), { hour: 7, minute: 15 });
});

test("returns null for missing/invalid time", () => {
  assert.equal(parseAlarmTime(null), null);
  assert.equal(parseAlarmTime(undefined), null);
  assert.equal(parseAlarmTime("nonsense"), null);
});

// ── isAlarmActiveNow ─────────────────────────────────────────────────────

const baseSettings = {
  alarmEnabled: true,
  alarmTime: "07:00",
  alarmDaysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
};

test("inactive when alarm disabled", () => {
  const now = new Date(2026, 7, 17, 7, 5); // Monday Aug 17 2026, 7:05am
  assert.equal(isAlarmActiveNow({ ...baseSettings, alarmEnabled: false }, now, dateKey(now), null), false);
});

test("active right at alarm time on a scheduled day", () => {
  const now = new Date(2026, 7, 17, 7, 0); // Monday
  assert.equal(isAlarmActiveNow(baseSettings, now, dateKey(now), null), true);
});

test("active within the window after alarm time", () => {
  const now = new Date(2026, 7, 17, 8, 30); // 1.5h after
  assert.equal(isAlarmActiveNow(baseSettings, now, dateKey(now), null), true);
});

test("inactive once past the active window", () => {
  const now = new Date(2026, 7, 17, 9, 1); // > 2h after 7:00
  assert.equal(isAlarmActiveNow(baseSettings, now, dateKey(now), null), false);
});

test("inactive before alarm time", () => {
  const now = new Date(2026, 7, 17, 6, 59);
  assert.equal(isAlarmActiveNow(baseSettings, now, dateKey(now), null), false);
});

test("inactive on a day not in alarmDaysOfWeek", () => {
  const now = new Date(2026, 7, 15, 7, 5); // Saturday Aug 15 2026
  assert.equal(isAlarmActiveNow(baseSettings, now, dateKey(now), null), false);
});

test("inactive once dismissed for today", () => {
  const now = new Date(2026, 7, 17, 7, 30);
  const today = dateKey(now);
  assert.equal(isAlarmActiveNow(baseSettings, now, today, today), false);
});

test("active again on a later day even if dismissed for a previous day", () => {
  const now = new Date(2026, 7, 18, 7, 10); // Tuesday
  assert.equal(isAlarmActiveNow(baseSettings, now, dateKey(now), "2026-08-17"), true);
});

test("inactive with malformed alarmTime", () => {
  const now = new Date(2026, 7, 17, 7, 5);
  assert.equal(isAlarmActiveNow({ ...baseSettings, alarmTime: "bad" }, now, dateKey(now), null), false);
});

// ── dateKey ────────────────────────────────────────────────────────────

test("dateKey formats as YYYY-MM-DD with zero-padding", () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), "2026-01-05");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
