import assert from "node:assert/strict";
import test from "node:test";

import { AIController } from "../src/ai/AIController.js";
import { COMBAT_STATES } from "../src/game/CombatSystem.js";

const self = { x: 300, y: 200, dashCooldownRemaining: 0 };
const opponent = { x: 600, y: 200 };

function combat(overrides = {}) {
  return {
    state: COMBAT_STATES.neutral,
    attackerIndex: 1,
    canLock: true,
    canUseBull: false,
    attackKind: "shou",
    reactionElapsed: 0,
    reactionWindowDuration: 0.5,
    config: { reactionWindow: 0.5 },
    ...overrides,
  };
}

function lock(overrides = {}) {
  return {
    isRecovering: false,
    isReady: false,
    isFocusing: false,
    progress: 0,
    ...overrides,
  };
}

test("AI attacker approaches and focuses a visible target", () => {
  const ai = new AIController({ random: () => 0 });
  const command = ai.update(1 / 60, {
    self,
    opponent,
    combat: combat(),
    lock: lock(),
    lineOfSight: true,
  });
  assert.equal(command.shouDown, true);
  assert.ok(Math.hypot(command.x, command.y) > 0.99);
});

test("AI attacker releases focus after the lock becomes ready", () => {
  const ai = new AIController({ random: () => 0 });
  const command = ai.update(1 / 60, {
    self,
    opponent,
    combat: combat(),
    lock: lock({ isReady: true, isFocusing: true, progress: 1 }),
    lineOfSight: true,
  });
  assert.equal(command.shouDown, false);
});

test("balanced AI identifies shou-lai and answers after its planned delay", () => {
  const values = [0, 0.5];
  const ai = new AIController({ random: () => values.shift() ?? 0.5 });
  const state = combat({ state: COMBAT_STATES.reaction, attackerIndex: 0 });
  let command = ai.update(1 / 60, { self, opponent, combat: state, lock: lock(), lineOfSight: true });
  assert.equal(command.shouPressed, false);
  state.reactionElapsed = 0.3;
  command = ai.update(1 / 60, { self, opponent, combat: state, lock: lock(), lineOfSight: true });
  assert.equal(command.shouPressed, true);
  assert.equal(command.niuPressed, false);
});

test("AI answers bull-lai with mama rather than shou-hui", () => {
  const ai = new AIController({ difficulty: "master", random: () => 0 });
  const state = combat({
    state: COMBAT_STATES.reaction,
    attackerIndex: 0,
    attackKind: "bull",
    reactionElapsed: 0.3,
  });
  const command = ai.update(1 / 60, { self, opponent, combat: state, lock: lock(), lineOfSight: true });
  assert.equal(command.niuPressed, true);
  assert.equal(command.shouPressed, false);
});

test("rookie AI can deliberately miss a reaction", () => {
  const ai = new AIController({ difficulty: "rookie", random: () => 0.99 });
  const state = combat({ state: COMBAT_STATES.reaction, attackerIndex: 0, reactionElapsed: 0.49 });
  const command = ai.update(1 / 60, { self, opponent, combat: state, lock: lock(), lineOfSight: true });
  assert.equal(command.shouPressed, false);
  assert.equal(command.niuPressed, false);
});

test("defending AI dashes when lock pressure crosses its threshold", () => {
  const ai = new AIController({ difficulty: "balanced", random: () => 0 });
  const command = ai.update(1 / 60, {
    self,
    opponent,
    combat: combat({ attackerIndex: 0 }),
    lock: lock({ isFocusing: true, progress: 0.8 }),
    lineOfSight: true,
  });
  assert.equal(command.dashPressed, true);
});
