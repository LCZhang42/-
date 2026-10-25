import test from "node:test";
import assert from "node:assert/strict";
import { CombatSystem, COMBAT_STATES } from "../src/game/CombatSystem.js";

const config = {
  initialLife: 60,
  roundDuration: 75,
  roundStartDuration: 1.2,
  calloutLeadDuration: 0.16,
  reactionWindow: 0.42,
  perfectWindow: 0.1,
  normalDamage: 6,
  perfectDamage: 9,
  damageRecovery: 0.5,
  reflectDuration: 0.42,
  hitStopDuration: 0.07,
  roleSwapSafety: 0.45,
  outcomeDisplayDuration: 1.15,
  bullDamage: 5,
  bullWindupDuration: 0.34,
  bullStunDuration: 1,
  recognitionStunDuration: 0.8,
  bullChargeThresholdMin: 80,
  bullChargeThresholdVariance: 20,
  bullChargeLock: 28,
  bullChargePerfect: 44,
  bullChargeDodge: 18,
  bullTokenCooldown: 8,
};

function createCombat() {
  const combat = new CombatSystem(config, () => 0);
  combat.update(config.roundStartDuration);
  return combat;
}

function openReaction(combat) {
  assert.equal(combat.triggerCallout(), true);
  combat.update(config.calloutLeadDuration);
  assert.equal(combat.state, COMBAT_STATES.reaction);
}

test("starts with full life, a timer, and a deterministic attacker", () => {
  const combat = new CombatSystem(config, () => 0);
  assert.deepEqual(combat.life, [60, 60]);
  assert.equal(combat.attackerIndex, 0);
  assert.equal(combat.state, COMBAT_STATES.roundStart);
  combat.update(1.2);
  assert.equal(combat.state, COMBAT_STATES.neutral);
  assert.equal(combat.roundRemaining, 75);
});

test("an early response damages the defender and keeps roles", () => {
  const combat = createCombat();
  combat.setLocking(true);
  combat.update(0.01, {
    threatActive: true,
    shouPressed: [false, true],
    niuPressed: [false, false],
  });
  assert.equal(combat.life[1], 54);
  assert.equal(combat.attackerIndex, 0);
  assert.equal(combat.outcome.type, "early");
});

test("a normal response reflects damage and swaps roles", () => {
  const combat = createCombat();
  openReaction(combat);
  combat.update(0.05, {
    shouPressed: [false, true],
    niuPressed: [false, false],
  });
  assert.equal(combat.life[0], 54);
  assert.equal(combat.outcome.type, "reflect");
  combat.update(0.08);
  combat.update(config.reflectDuration);
  assert.equal(combat.attackerIndex, 1);
  assert.equal(combat.state, COMBAT_STATES.neutral);
  assert.ok(combat.safeTimeRemaining > 0);
});

test("the center of the response window is perfect and deals nine", () => {
  const combat = createCombat();
  openReaction(combat);
  combat.update(config.reactionWindow / 2, {
    shouPressed: [false, true],
    niuPressed: [false, false],
  });
  assert.equal(combat.life[0], 51);
  assert.equal(combat.outcome.type, "perfect");
});

test("calling mama against shou-lai causes recognition stun", () => {
  const combat = createCombat();
  openReaction(combat);
  combat.update(0.1, {
    shouPressed: [false, false],
    niuPressed: [false, true],
  });
  assert.equal(combat.life[1], 54);
  assert.equal(combat.outcome.type, "family");
  assert.equal(combat.stateTimeRemaining, config.recognitionStunDuration);
});

test("missing the response window times out", () => {
  const combat = createCombat();
  openReaction(combat);
  combat.update(config.reactionWindow);
  assert.equal(combat.life[1], 54);
  assert.equal(combat.outcome.type, "timeout");
});

test("the round timer awards the win to the player with more life", () => {
  const combat = createCombat();
  combat.life = [48, 54];
  combat.update(combat.roundRemaining);
  assert.equal(combat.state, COMBAT_STATES.roundOver);
  assert.equal(combat.winnerIndex, 1);
});

test("controlled bull charge grants at most one token at its threshold", () => {
  const combat = createCombat();
  assert.equal(combat.addBullCharge(0, 79), false);
  assert.equal(combat.bullTokens[0], false);
  assert.equal(combat.addBullCharge(0, 1), true);
  assert.equal(combat.bullTokens[0], true);
  combat.addBullCharge(0, 100);
  assert.equal(combat.bullCharge[0], 80);
});

test("a bull token starts a longer distinct windup and is consumed", () => {
  const combat = createCombat();
  combat.bullTokens[0] = true;
  assert.equal(combat.triggerBullCallout(), true);
  assert.equal(combat.attackKind, "bull");
  assert.equal(combat.stateTimeRemaining, config.bullWindupDuration);
  assert.equal(combat.bullTokens[0], false);
  assert.equal(combat.bullCooldownRemaining[0], config.bullTokenCooldown);
});

test("mama reflects bull-lai for five damage and swaps roles", () => {
  const combat = createCombat();
  combat.bullTokens[0] = true;
  combat.triggerBullCallout();
  combat.update(config.bullWindupDuration);
  combat.update(0.1, {
    shouPressed: [false, false],
    niuPressed: [false, true],
  });
  assert.equal(combat.life[0], 55);
  assert.equal(combat.outcome.type, "bullReflect");
  combat.update(0.08);
  combat.update(config.reflectDuration);
  assert.equal(combat.attackerIndex, 1);
});

test("shou-hui against bull-lai causes a one-second bull stun", () => {
  const combat = createCombat();
  combat.bullTokens[0] = true;
  combat.triggerBullCallout();
  combat.update(config.bullWindupDuration);
  combat.update(0.1, {
    shouPressed: [false, true],
    niuPressed: [false, false],
  });
  assert.equal(combat.life[1], 55);
  assert.equal(combat.outcome.type, "bullStun");
  assert.equal(combat.stateTimeRemaining, config.bullStunDuration);
});

test("missing mama against bull-lai costs five years", () => {
  const combat = createCombat();
  combat.bullTokens[0] = true;
  combat.triggerBullCallout();
  combat.update(config.bullWindupDuration);
  combat.update(config.reactionWindow);
  assert.equal(combat.life[1], 55);
  assert.equal(combat.outcome.type, "bullTimeout");
});

test("the post-token cooldown blocks immediate bull recharge", () => {
  const combat = createCombat();
  combat.bullTokens[0] = true;
  combat.triggerBullCallout();
  assert.equal(combat.addBullCharge(0, 100), false);
  assert.equal(combat.bullCharge[0], 0);
});

test("forced bull mode permits repeated test callouts without inventory", () => {
  const combat = createCombat();
  combat.setForceBullTokens(true);
  assert.equal(combat.canUseBull, true);
  assert.equal(combat.triggerBullCallout(), true);
  assert.equal(combat.forceBullTokens, true);
});

test("difficulty timing can widen or tighten the response window", () => {
  const combat = createCombat();
  combat.setReactionTiming(0.68, 0.18);
  openReaction(combat);
  assert.equal(combat.stateTimeRemaining, 0.68);
  combat.update(0.34, {
    shouPressed: [false, true],
    niuPressed: [false, false],
  });
  assert.equal(combat.outcome.type, "perfect");
});
