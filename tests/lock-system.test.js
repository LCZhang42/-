import test from "node:test";
import assert from "node:assert/strict";
import { LockSystem, rotateToward, shortestAngle } from "../src/game/LockSystem.js";

const config = {
  range: 500,
  coneHalfAngle: Math.PI / 6,
  turnSpeed: Math.PI,
  lockDuration: 0.75,
  decayMultiplier: 1.5,
  earlyReleaseRecovery: 0.65,
  resultFlashDuration: 0.7,
};

const attacker = { x: 0, y: 0, facingX: 1, facingY: 0 };
const target = { x: 300, y: 0 };

function step(lock, deltaTime, overrides = {}) {
  return lock.update(deltaTime, {
    attacker,
    target,
    wantsFocus: true,
    hasLineOfSight: true,
    targetLockImmune: false,
    ...overrides,
  });
}

test("completes a clear in-cone lock in about 0.75 seconds", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.75);
  assert.equal(lock.isReady, true);
  assert.equal(lock.status, "LOCKED");
});

test("rotates toward a target at a limited angular speed", () => {
  const lock = new LockSystem(config);
  const upwardFacingAttacker = { ...attacker, facingX: 0, facingY: 1 };
  lock.reset(upwardFacingAttacker);
  step(lock, 0.1, { attacker: upwardFacingAttacker });
  assert.ok(Math.abs(shortestAngle(lock.aimAngle, 0)) > 1);
  assert.equal(lock.conditions.inCone, false);
  assert.ok(Math.abs(Math.abs(shortestAngle(0, rotateToward(0, Math.PI, 0.2))) - 0.2) < 1e-9);
});

test("decays partial progress when sight is blocked", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.3);
  const partial = lock.progress;
  step(lock, 0.1, { hasLineOfSight: false });
  assert.ok(lock.progress < partial);
  assert.equal(lock.conditions.lineOfSight, false);
});

test("dash immunity prevents lock growth", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.2, { targetLockImmune: true });
  assert.equal(lock.progress, 0);
  assert.equal(lock.conditions.targetVulnerable, false);
});

test("a sudden target direction change interrupts and decays a partial lock", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.3);
  const partial = lock.progress;
  step(lock, 0.1, { target: { x: 0, y: 300 } });
  assert.ok(lock.progress < partial);
  assert.equal(lock.conditions.inCone, false);
});

test("targets outside maximum range cannot build lock", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.5, { target: { x: 700, y: 0 } });
  assert.equal(lock.progress, 0);
  assert.equal(lock.conditions.inRange, false);
});

test("early release clears progress and starts recovery", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.25);
  const event = step(lock, 1 / 60, { wantsFocus: false });
  assert.deepEqual(event, { type: "early" });
  assert.equal(lock.progress, 0);
  assert.ok(lock.recoveryRemaining > 0.6);
});

test("releasing a completed lock emits a completion event", () => {
  const lock = new LockSystem(config);
  lock.reset(attacker);
  step(lock, 0.75);
  const event = step(lock, 1 / 60, { wantsFocus: false });
  assert.deepEqual(event, { type: "complete" });
  assert.equal(lock.lastResult, "complete");
});
