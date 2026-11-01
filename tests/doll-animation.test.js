import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_POSES } from "../src/characters/CharacterCatalog.js";
import { FALLEN_DOLL_POSE, resolveDollAnimation } from "../src/rendering/DollAnimation.js";

const player = { id: "P1", role: "attacker", facingX: 1, isDashing: false };
const baseScene = {
  time: 1.25, lowEffects: false, roleSwapPulse: 0, roleSwapIndex: null,
  lock: { isFocusing: false, progress: 0 },
  combat: { state: "NEUTRAL", attackKind: "shou", outcome: null, outcomeDisplayRemaining: 0 },
};

function scene(overrides = {}) {
  return {
    ...baseScene,
    ...overrides,
    combat: { ...baseScene.combat, ...(overrides.combat ?? {}) },
    lock: { ...baseScene.lock, ...(overrides.lock ?? {}) },
  };
}

test("A4 maps every named combat beat to a transient skeleton animation", () => {
  const pose = STANDARD_POSES[0];
  assert.equal(resolveDollAnimation(player, scene({ combat: { state: "CALLOUT", attackKind: "shou" } }), 0, pose).kind, "shou-lai");
  assert.equal(resolveDollAnimation(player, scene({ combat: { state: "CALLOUT", attackKind: "bull" } }), 0, pose).kind, "niu-lai");
  assert.equal(resolveDollAnimation({ ...player, role: "defender" }, scene({ combat: { state: "REFLECT", outcome: { type: "reflect", sourceIndex: 0 } } }), 0, pose).kind, "shou-hui");
  assert.equal(resolveDollAnimation({ ...player, role: "defender" }, scene({ combat: { state: "REFLECT", outcome: { type: "bullReflect", sourceIndex: 0 } } }), 0, pose).kind, "mama");
  assert.equal(resolveDollAnimation({ ...player, isDashing: true }, scene(), 0, pose).kind, "dash");
  assert.equal(resolveDollAnimation(player, scene({ roleSwapPulse: 0.3, roleSwapIndex: 0 }), 0, pose).kind, "role-swap");
  assert.equal(resolveDollAnimation(player, scene({ combat: { outcome: { type: "timeout", targetIndex: 0 }, outcomeDisplayRemaining: 1 } }), 0, pose).kind, "failure");
});

test("combat animation is pure and returns exactly to the base pose", () => {
  const pose = { ...STANDARD_POSES[2] };
  const snapshot = JSON.stringify(pose);
  for (let round = 0; round < 10; round += 1) {
    resolveDollAnimation(player, scene({ time: round, combat: { state: "CALLOUT", attackKind: round % 2 ? "bull" : "shou" } }), 0, pose);
    resolveDollAnimation(player, scene({ time: round + 0.5 }), 0, pose);
  }
  assert.equal(JSON.stringify(pose), snapshot);
  const idle = resolveDollAnimation(player, scene({ time: 0, lowEffects: true }), 0, pose);
  assert.equal(idle.kind, "idle");
  assert.equal(idle.lean, 0);
  assert.equal(idle.reach, 0);
});

test("low effects mode keeps actions but reduces cloth movement", () => {
  const pose = STANDARD_POSES[0];
  const full = resolveDollAnimation(player, scene({ time: 0.7, combat: { state: "CALLOUT", attackKind: "shou" } }), 0, pose);
  const low = resolveDollAnimation(player, scene({ time: 0.7, lowEffects: true, combat: { state: "CALLOUT", attackKind: "shou" } }), 0, pose);
  assert.equal(low.kind, "shou-lai");
  assert.ok(Math.abs(low.jointOffsets.leftShin) < Math.abs(full.jointOffsets.leftShin));
});

test("fallen outcome pose is a rigid valid pose", () => {
  assert.equal(FALLEN_DOLL_POSE.name, "寿数耗尽");
  for (const value of Object.values(FALLEN_DOLL_POSE).filter((value) => typeof value === "number")) {
    assert.equal(Number.isFinite(value), true);
  }
});
