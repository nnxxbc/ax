/**
 * Real, executable tests for the enforcement-override resolution logic.
 * Run with: node --experimental-strip-types src/lib/__tests__/enforcement.test.ts
 */
import assert from "node:assert/strict";
import { effectiveEnforcementLevel } from "../enforcement.ts";

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

test("checkpoint override wins over global", () => {
  assert.equal(effectiveEnforcementLevel("off", "strict"), "strict");
});

test("null override inherits global", () => {
  assert.equal(effectiveEnforcementLevel("focused", null), "focused");
});

test("undefined override inherits global", () => {
  assert.equal(effectiveEnforcementLevel("soft", undefined), "soft");
});

test("both missing falls back to off", () => {
  assert.equal(effectiveEnforcementLevel(undefined, undefined), "off");
});

test("invalid override value is ignored, falls back to global", () => {
  assert.equal(effectiveEnforcementLevel("strict", "bogus"), "strict");
});

test("invalid global value with no override falls back to off", () => {
  assert.equal(effectiveEnforcementLevel("bogus", null), "off");
});

test("override of 'off' still wins over a stricter global", () => {
  assert.equal(effectiveEnforcementLevel("strict", "off"), "off");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
