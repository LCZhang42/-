import assert from "node:assert/strict";
import test from "node:test";

import { MatchStats } from "../src/game/MatchStats.js";

test("records lock attempts, responses, and attacker time", () => {
  const stats = new MatchStats();
  stats.update(1.5, 0);
  stats.update(0.5, 1);
  stats.recordLock(0);
  stats.recordOutcome({ type: "reflect", attackKind: "shou", damage: 6 }, 1);
  stats.recordOutcome({ type: "timeout", attackKind: "shou", damage: 6 }, 0);

  assert.deepEqual(stats.lockAttempts, [1, 0]);
  assert.deepEqual(stats.attackerSeconds, [1.5, 0.5]);
  assert.equal(stats.totalResponses, 2);
  assert.equal(stats.totalSuccessfulResponses, 1);
  assert.equal(stats.responseRate, 0.5);
});

test("reset clears all per-round telemetry", () => {
  const stats = new MatchStats();
  stats.recordLock(1);
  stats.recordOutcome({ type: "bullReflect", attackKind: "bull", damage: 5 }, 0);
  stats.reset();

  assert.deepEqual(stats.lockAttempts, [0, 0]);
  assert.deepEqual(stats.responses, [0, 0]);
  assert.equal(stats.outcomes.length, 0);
});
