/**
 * Real, executable tests for the refetch-race-condition fix.
 * Run with: node --experimental-strip-types src/lib/__tests__/sync-reconcile.test.ts
 */
import assert from "node:assert/strict";
import { reconcilePendingSessions } from "../sync-reconcile.ts";

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

test("no pending ids: server data passes through untouched", () => {
  const server = [{ id: 1, status: "completed" }];
  const cached = [{ id: 1, status: "in_progress" }];
  const result = reconcilePendingSessions(server, cached, new Set());
  assert.deepEqual(result, server);
});

test("pending session: stale server response is replaced by the cached local version", () => {
  // Simulates the reported bug: server still says "Out of Bed" in_progress /
  // "Foam Roller" waiting, but the device already locally completed Out of
  // Bed and started Foam Roller.
  const server = [
    { id: 1, status: "in_progress", checkpointName: "Out of Bed" },
    { id: 2, status: "waiting", checkpointName: "Foam Roller" },
  ];
  const cached = [
    { id: 1, status: "completed", checkpointName: "Out of Bed" },
    { id: 2, status: "in_progress", checkpointName: "Foam Roller" },
  ];
  const result = reconcilePendingSessions(server, cached, new Set(["1", "2"]));
  assert.equal(result[0].status, "completed");
  assert.equal(result[1].status, "in_progress");
});

test("only the specific pending session is protected, others pass through from server", () => {
  const server = [
    { id: 1, status: "completed" },
    { id: 2, status: "waiting" },
  ];
  const cached = [
    { id: 1, status: "stale-should-not-be-used" },
    { id: 2, status: "in_progress" },
  ];
  const result = reconcilePendingSessions(server, cached, new Set(["2"]));
  assert.equal(result[0].status, "completed"); // untouched — not pending
  assert.equal(result[1].status, "in_progress"); // protected — pending
});

test("pending id with no matching cached session falls back to server data (never crashes)", () => {
  const server = [{ id: 1, status: "in_progress" }];
  const cached: { id: number; status: string }[] = [];
  const result = reconcilePendingSessions(server, cached, new Set(["1"]));
  assert.equal(result[0].status, "in_progress");
});

test("numeric vs string id are compared consistently", () => {
  const server = [{ id: 42, status: "old" }];
  const cached = [{ id: "42", status: "new" }];
  const result = reconcilePendingSessions(server, cached, new Set(["42"]));
  assert.equal(result[0].status, "new");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
