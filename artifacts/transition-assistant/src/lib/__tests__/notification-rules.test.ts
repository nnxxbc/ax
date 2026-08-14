/**
 * Real, executable tests for the Phase 3 unified notification gating logic.
 * Run with: node --experimental-strip-types src/lib/__tests__/notification-rules.test.ts
 * from artifacts/transition-assistant.
 */
import assert from "node:assert/strict";
import { parseHHMM, isWithinQuietHours, shouldNotify } from "../notification-rules.ts";

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

// ── parseHHMM ────────────────────────────────────────────────────────────

test("parseHHMM parses a normal time", () => {
  assert.equal(parseHHMM("23:00"), 23 * 60);
  assert.equal(parseHHMM("08:05"), 8 * 60 + 5);
  assert.equal(parseHHMM("00:00"), 0);
});

test("parseHHMM rejects malformed input", () => {
  assert.equal(parseHHMM("25:00"), null);
  assert.equal(parseHHMM("bad"), null);
  assert.equal(parseHHMM(""), null);
  assert.equal(parseHHMM(undefined), null);
});

// ── isWithinQuietHours ──────────────────────────────────────────────────

test("same-day window: inside range", () => {
  assert.equal(isWithinQuietHours(13 * 60, 12 * 60, 14 * 60), true);
});

test("same-day window: outside range", () => {
  assert.equal(isWithinQuietHours(15 * 60, 12 * 60, 14 * 60), false);
});

test("overnight window 23:00->08:00: late night is quiet", () => {
  assert.equal(isWithinQuietHours(23 * 60 + 30, 23 * 60, 8 * 60), true);
});

test("overnight window 23:00->08:00: early morning is quiet", () => {
  assert.equal(isWithinQuietHours(5 * 60, 23 * 60, 8 * 60), true);
});

test("overnight window 23:00->08:00: midday is not quiet", () => {
  assert.equal(isWithinQuietHours(13 * 60, 23 * 60, 8 * 60), false);
});

test("overnight window boundary: exactly at end is not quiet (exclusive)", () => {
  assert.equal(isWithinQuietHours(8 * 60, 23 * 60, 8 * 60), false);
});

test("overnight window boundary: exactly at start is quiet (inclusive)", () => {
  assert.equal(isWithinQuietHours(23 * 60, 23 * 60, 8 * 60), true);
});

test("zero-width window is never quiet", () => {
  assert.equal(isWithinQuietHours(12 * 60, 9 * 60, 9 * 60), false);
});

// ── shouldNotify ─────────────────────────────────────────────────────────

test("shouldNotify: category disabled blocks even outside quiet hours", () => {
  const now = new Date(2026, 0, 1, 12, 0);
  assert.equal(
    shouldNotify("timer", { notifyTimerEnabled: false, quietHoursEnabled: false }, now),
    false,
  );
});

test("shouldNotify: legacy notificationsEnabled=false is a global kill switch", () => {
  const now = new Date(2026, 0, 1, 12, 0);
  assert.equal(
    shouldNotify("timer", { notifyTimerEnabled: true, notificationsEnabled: false }, now),
    false,
  );
});

test("shouldNotify: quiet hours suppress a normal category", () => {
  const now = new Date(2026, 0, 1, 23, 30); // 23:30
  assert.equal(
    shouldNotify(
      "transitionReminder",
      {
        notifyTransitionRemindersEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00",
      },
      now,
    ),
    false,
  );
});

test("shouldNotify: outside quiet hours window passes through", () => {
  const now = new Date(2026, 0, 1, 12, 0); // noon
  assert.equal(
    shouldNotify(
      "transitionReminder",
      {
        notifyTransitionRemindersEnabled: true,
        quietHoursEnabled: true,
        quietHoursStart: "23:00",
        quietHoursEnd: "08:00",
      },
      now,
    ),
    true,
  );
});

test("shouldNotify: alarm category always bypasses quiet hours", () => {
  const now = new Date(2026, 0, 1, 3, 0); // 3am, deep in quiet hours
  assert.equal(
    shouldNotify(
      "alarm",
      { quietHoursEnabled: true, quietHoursStart: "23:00", quietHoursEnd: "08:00" },
      now,
    ),
    true,
  );
});

test("shouldNotify: checkIn is opt-in (default off even without explicit false)", () => {
  const now = new Date(2026, 0, 1, 12, 0);
  assert.equal(shouldNotify("checkIn", {}, now), false);
  assert.equal(shouldNotify("checkIn", { notifyCheckInsEnabled: true }, now), true);
});

test("shouldNotify: malformed quiet-hours config fails open", () => {
  const now = new Date(2026, 0, 1, 12, 0);
  assert.equal(
    shouldNotify(
      "timer",
      { notifyTimerEnabled: true, quietHoursEnabled: true, quietHoursStart: "bad", quietHoursEnd: "08:00" },
      now,
    ),
    true,
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
