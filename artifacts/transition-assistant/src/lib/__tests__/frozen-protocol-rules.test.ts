/**
 * Real, executable tests for the Frozen Protocol stage transitions.
 * Run with: node --experimental-strip-types src/lib/__tests__/frozen-protocol-rules.test.ts
 */
import assert from "node:assert/strict";
import { advanceFrozenStage } from "../frozen-protocol-rules.ts";

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

test("stage1_acknowledged moves 1 -> 2", () => {
  assert.equal(advanceFrozenStage(1, "stage1_acknowledged"), 2);
});

test("stage2_action_done moves 2 -> 3", () => {
  assert.equal(advanceFrozenStage(2, "stage2_action_done"), 3);
});

test("stage2_too_hard does NOT advance — never a dead end", () => {
  assert.equal(advanceFrozenStage(2, "stage2_too_hard"), 2);
});

test("stage3_destination_chosen moves 3 -> 4", () => {
  assert.equal(advanceFrozenStage(3, "stage3_destination_chosen"), 4);
});

test("stage3_unspecified also moves 3 -> 4", () => {
  assert.equal(advanceFrozenStage(3, "stage3_unspecified"), 4);
});

test("stage4_back moves 4 -> 3", () => {
  assert.equal(advanceFrozenStage(4, "stage4_back"), 3);
});

test("full happy path traverses all four stages in order", () => {
  let stage = advanceFrozenStage(1, "stage1_acknowledged");
  assert.equal(stage, 2);
  stage = advanceFrozenStage(stage, "stage2_action_done");
  assert.equal(stage, 3);
  stage = advanceFrozenStage(stage, "stage3_destination_chosen");
  assert.equal(stage, 4);
});

test("too-hard loop can retry stage 2 any number of times before advancing", () => {
  let stage: 1 | 2 | 3 | 4 = 2;
  stage = advanceFrozenStage(stage, "stage2_too_hard");
  stage = advanceFrozenStage(stage, "stage2_too_hard");
  stage = advanceFrozenStage(stage, "stage2_too_hard");
  assert.equal(stage, 2);
  stage = advanceFrozenStage(stage, "stage2_action_done");
  assert.equal(stage, 3);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
