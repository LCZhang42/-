import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ARENA_CONFIG,
  COMBAT_CONFIG,
  LOCK_CONFIG,
  MOVEMENT_CONFIG,
  PLAYER_CONFIGS,
} from "../shared/BalanceConfig.js";
import { SimulationCore } from "../shared/SimulationCore.js";

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

function commandsAt(tick) {
  return [0, 1].map((index) => ({
    x: Math.sin((tick + index * 19) * 0.07),
    y: Math.cos((tick + index * 31) * 0.05),
    dashPressed: tick % (137 + index * 23) === 0,
    shouDown: tick % 180 >= 20 + index * 12 && tick % 180 < 80 + index * 12,
    shouPressed: tick % (211 + index * 17) === 0,
    niuPressed: tick % (257 + index * 29) === 0,
  }));
}

test("same seed and input sequence produce identical states and events", () => {
  const first = createSimulation(0x1234abcd);
  const second = createSimulation(0x1234abcd);
  assert.deepEqual(first.getState(), second.getState());
  for (let tick = 0; tick < 1800; tick += 1) {
    const commands = commandsAt(tick);
    assert.deepEqual(
      first.step(1 / 60, commands),
      second.step(1 / 60, commands),
      `determinism diverged at tick ${tick}`,
    );
  }
});

test("resetting to the same seed reproduces the initial authoritative state", () => {
  const simulation = createSimulation(0x10203040);
  const initial = simulation.getState();
  for (let tick = 0; tick < 240; tick += 1) simulation.step(1 / 60, commandsAt(tick));
  assert.deepEqual(simulation.reset({ seed: 0x10203040 }), initial);
});

test("different seeds change server-owned random results", () => {
  const first = createSimulation(11).getState();
  const second = createSimulation(12).getState();
  assert.notDeepEqual(first.combat.bullThresholds, second.combat.bullThresholds);
});

test("SimulationCore does not call Math.random while stepping rules", () => {
  const originalRandom = Math.random;
  Math.random = () => { throw new Error("shared simulation used Math.random"); };
  try {
    const simulation = createSimulation(99);
    for (let tick = 0; tick < 120; tick += 1) simulation.step(1 / 60, commandsAt(tick));
  } finally {
    Math.random = originalRandom;
  }
});

test("SimulationCore clamps network-style movement inputs to valid axes", () => {
  const simulation = createSimulation(7);
  simulation.combat.state = "NEUTRAL";
  const before = simulation.players[0].x;
  simulation.step(1 / 60, [{ x: 99, y: 0 }, { x: 0, y: 0 }]);
  assert.equal(simulation.players[0].x - before, MOVEMENT_CONFIG.moveSpeed / 60);
});

test("shared simulation dependency graph has no browser or real-clock globals", async () => {
  const sources = await Promise.all([
    "../shared/SimulationCore.js",
    "../shared/SeededRandom.js",
    "../shared/BalanceConfig.js",
    "../src/game/Arena.js",
    "../src/game/CombatSystem.js",
    "../src/game/LockSystem.js",
    "../src/game/Player.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const forbidden = /\b(?:document|window|performance|Date|requestAnimationFrame|HTMLCanvasElement)\b|Math\.random/;
  for (const source of sources) assert.doesNotMatch(source, forbidden);
});
