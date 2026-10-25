import assert from "node:assert/strict";
import test from "node:test";

import { GRANDPA_POSES, getGrandpaPose } from "../src/characters/CharacterCatalog.js";
import { resolveDollExpression } from "../src/rendering/DollRenderer.js";
import { resolveDollSkeleton } from "../src/rendering/Skeleton2D.js";

const baseScene = {
  players: [{ id: "P1" }, { id: "P2" }],
  lock: { isFocusing: false },
  combat: {
    state: "NEUTRAL",
    outcome: null,
    outcomeDisplayRemaining: 0,
  },
};

test("grandpa pose selection wraps in both directions", () => {
  assert.equal(getGrandpaPose(0).id, "deadpan");
  assert.equal(getGrandpaPose(GRANDPA_POSES.length).id, "deadpan");
  assert.equal(getGrandpaPose(-1).id, "wild");
});

test("resolved skeleton has every required A0 joint", () => {
  const skeleton = resolveDollSkeleton(getGrandpaPose(0));
  for (const joint of [
    "head", "chest", "hips", "leftShoulder", "rightShoulder",
    "leftElbow", "rightElbow", "leftWrist", "rightWrist",
    "leftKnee", "rightKnee", "leftAnkle", "rightAnkle",
  ]) {
    assert.equal(Number.isFinite(skeleton[joint].x), true, `${joint}.x`);
    assert.equal(Number.isFinite(skeleton[joint].y), true, `${joint}.y`);
  }
});

test("combat state maps to the six doll expressions", () => {
  const attacker = { id: "P1", role: "attacker" };
  const defender = { id: "P1", role: "defender" };
  assert.equal(resolveDollExpression(attacker, baseScene, 0), "neutral");
  assert.equal(resolveDollExpression(attacker, {
    ...baseScene,
    lock: { isFocusing: true },
  }, 0), "focus");
  assert.equal(resolveDollExpression(attacker, {
    ...baseScene,
    combat: { ...baseScene.combat, state: "CALLOUT" },
  }, 0), "shout");
  assert.equal(resolveDollExpression(defender, {
    ...baseScene,
    combat: { ...baseScene.combat, state: "REACTION_WINDOW" },
  }, 0), "shock");
  assert.equal(resolveDollExpression(defender, {
    ...baseScene,
    combat: {
      ...baseScene.combat,
      state: "REFLECT",
      outcome: { sourceIndex: 0 },
    },
  }, 0), "triumph");
  assert.equal(resolveDollExpression(defender, {
    ...baseScene,
    combat: {
      ...baseScene.combat,
      outcomeDisplayRemaining: 1,
      outcome: { targetIndex: 0 },
    },
  }, 0), "hurt");
});
