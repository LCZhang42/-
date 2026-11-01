import assert from "node:assert/strict";
import test from "node:test";

import {
  ARENA_CONFIG,
  COMBAT_CONFIG,
  LOCK_CONFIG,
  MOVEMENT_CONFIG,
  PLAYER_CONFIGS,
} from "../shared/BalanceConfig.js";
import { COMBAT_STATES } from "../src/game/CombatSystem.js";
import { SimulationCore, emptySimulationCommand } from "../shared/SimulationCore.js";

const STEP = 1 / 60;

function createSimulation(seed) {
  return new SimulationCore({
    arenaConfig: ARENA_CONFIG,
    combatConfig: COMBAT_CONFIG,
    lockConfig: LOCK_CONFIG,
    movementConfig: MOVEMENT_CONFIG,
    playerConfigs: PLAYER_CONFIGS,
    seed,
    reactionTiming: { reactionWindow: 0.5, perfectWindow: 0.12 },
  });
}

function assertSimulationInvariant(simulation) {
  const state = simulation.getState();
  assert.ok(Object.values(COMBAT_STATES).includes(state.combat.state));
  assert.ok(state.combat.attackerIndex === 0 || state.combat.attackerIndex === 1);
  assert.notEqual(state.combat.attackerIndex, state.combat.defenderIndex);
  for (const value of [
    ...state.combat.life,
    state.combat.roundRemaining,
    state.combat.stateTimeRemaining,
    state.combat.safeTimeRemaining,
    state.combat.hitStopRemaining,
    ...state.combat.bullCharge,
    ...state.combat.bullCooldownRemaining,
    state.lock.progress,
    state.lock.recoveryRemaining,
  ]) {
    assert.equal(Number.isFinite(value), true);
    assert.ok(value >= 0);
  }
  for (const value of state.players.flatMap((player) => [
    player.x,
    player.y,
    player.velocityX,
    player.velocityY,
  ])) {
    assert.equal(Number.isFinite(value), true);
  }
}

function step(simulation, commands = []) {
  const result = simulation.step(STEP, commands);
  assertSimulationInvariant(simulation);
  return result;
}

function advanceUntil(simulation, predicate, limit = 1200) {
  for (let frame = 0; frame < limit; frame += 1) {
    const result = step(simulation);
    if (predicate()) return result;
  }
  assert.fail(`state machine did not advance from ${simulation.combat.state}`);
}

function placeForClearLock(simulation) {
  const attacker = simulation.players[simulation.combat.attackerIndex];
  const defender = simulation.players[simulation.combat.defenderIndex];
  attacker.x = simulation.combat.attackerIndex === 0 ? 380 : 680;
  defender.x = simulation.combat.attackerIndex === 0 ? 680 : 380;
  attacker.y = defender.y = 330;
  attacker.facingX = Math.sign(defender.x - attacker.x);
  attacker.facingY = 0;
  defender.facingX = -attacker.facingX;
  defender.facingY = 0;
  simulation.lock.aimAngle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
  simulation.updateLineOfSight();
  assert.equal(simulation.lineOfSightClear, true);
}

function startShouCallout(simulation) {
  placeForClearLock(simulation);
  const attacker = simulation.combat.attackerIndex;
  let frames = 0;
  while (!simulation.lock.isReady) {
    const commands = [emptySimulationCommand(), emptySimulationCommand()];
    commands[attacker].shouDown = true;
    step(simulation, commands);
    frames += 1;
    assert.ok(frames < 120, "lock should complete within two seconds");
  }
  const result = step(simulation);
  assert.ok(result.events.some((event) => event.type === "callout" && event.kind === "shou"));
}

function startBullCallout(simulation) {
  const attacker = simulation.combat.attackerIndex;
  simulation.combat.bullTokens[attacker] = true;
  const commands = [emptySimulationCommand(), emptySimulationCommand()];
  commands[attacker].niuPressed = true;
  const result = step(simulation, commands);
  assert.ok(result.events.some((event) => event.type === "callout" && event.kind === "bull"));
}

test("local MVP completes 20 full SimulationCore rounds without stalls or role corruption", () => {
  const simulation = createSimulation(0x5a17c0de);
  let totalRoleSwaps = 0;
  let totalCallouts = 0;

  for (let round = 0; round < 20; round += 1) {
    simulation.reset({ seed: 0x5a17c0de + round });
    advanceUntil(simulation, () => simulation.combat.state === COMBAT_STATES.neutral);

    let exchange = 0;
    while (simulation.combat.state !== COMBAT_STATES.roundOver) {
      assert.ok(exchange < 40, `round ${round + 1} exceeded exchange budget`);
      advanceUntil(simulation, () => (
        simulation.combat.canLock || simulation.combat.state === COMBAT_STATES.roundOver
      ));
      if (simulation.combat.state === COMBAT_STATES.roundOver) break;
      const attackerBefore = simulation.combat.attackerIndex;
      const useBull = exchange % 4 === 3;
      if (useBull) startBullCallout(simulation);
      else startShouCallout(simulation);
      totalCallouts += 1;

      advanceUntil(simulation, () => (
        simulation.combat.state === COMBAT_STATES.reaction ||
        simulation.combat.state === COMBAT_STATES.roundOver
      ));
      if (simulation.combat.state === COMBAT_STATES.roundOver) break;

      const shouldReflect = (round + exchange) % 3 !== 0;
      if (shouldReflect) {
        const defender = simulation.combat.defenderIndex;
        const commands = [emptySimulationCommand(), emptySimulationCommand()];
        if (useBull) commands[defender].niuPressed = true;
        else commands[defender].shouPressed = true;
        step(simulation, commands);
      } else {
        advanceUntil(simulation, () => simulation.combat.state !== COMBAT_STATES.reaction);
      }

      if (simulation.combat.state === COMBAT_STATES.reflect) {
        advanceUntil(simulation, () => (
          simulation.combat.state === COMBAT_STATES.neutral ||
          simulation.combat.state === COMBAT_STATES.roundOver
        ));
        if (simulation.combat.state !== COMBAT_STATES.roundOver) {
          assert.notEqual(simulation.combat.attackerIndex, attackerBefore);
          totalRoleSwaps += 1;
        }
      } else if (simulation.combat.state !== COMBAT_STATES.roundOver) {
        advanceUntil(simulation, () => (
          simulation.combat.state === COMBAT_STATES.neutral ||
          simulation.combat.state === COMBAT_STATES.roundOver
        ));
        if (simulation.combat.state !== COMBAT_STATES.roundOver) {
          assert.equal(simulation.combat.attackerIndex, attackerBefore);
        }
      }
      exchange += 1;
    }

    assert.equal(simulation.combat.state, COMBAT_STATES.roundOver);
    assert.ok(
      simulation.combat.winnerIndex === null ||
      simulation.combat.winnerIndex === 0 ||
      simulation.combat.winnerIndex === 1,
    );
    assert.equal(simulation.combat.canLock, false);
    assert.equal(simulation.combat.movementAllowed, false);
  }

  assert.ok(totalCallouts >= 120);
  assert.ok(totalRoleSwaps >= 60);
});
