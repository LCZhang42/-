import test from "node:test";
import assert from "node:assert/strict";
import { Player } from "../src/game/Player.js";

const config = {
  id: "P1",
  name: "Test",
  color: "#ffffff",
  glow: "transparent",
  controls: {},
  start: { x: 100, y: 100 },
};

const movement = {
  playerRadius: 30,
  moveSpeed: 240,
  dashSpeed: 500,
  dashDuration: 0.16,
  dashCooldown: 1.8,
  dashLockImmunity: 0.24,
};

test("normalizes diagonal movement", () => {
  const player = new Player(config, movement);
  player.beginStep();
  player.update(1, { x: 1, y: 1, dashPressed: false });

  assert.ok(Math.abs(Math.hypot(player.velocityX, player.velocityY) - 240) < 1e-9);
});

test("starts a directional dash and enters cooldown", () => {
  const player = new Player(config, movement);
  player.beginStep();
  player.update(0.01, { x: 1, y: 0, dashPressed: true });

  assert.equal(player.isDashing, true);
  assert.equal(player.isLockImmune, true);
  assert.ok(player.dashCooldownRemaining > 1.7);
  assert.equal(player.velocityX, 500);
  assert.equal(player.dashCount, 1);
});

test("cannot start a second dash during cooldown", () => {
  const player = new Player(config, movement);
  player.update(0.01, { x: 1, y: 0, dashPressed: true });
  player.dashTimeRemaining = 0;
  player.update(0.01, { x: -1, y: 0, dashPressed: true });

  assert.equal(player.dashCount, 1);
  assert.equal(player.velocityX, -240);
});

test("reset restores spawn and clears movement state", () => {
  const player = new Player(config, movement);
  player.update(0.01, { x: 1, y: 0, dashPressed: true });
  player.reset();

  assert.equal(player.x, 100);
  assert.equal(player.y, 100);
  assert.equal(player.dashCooldownRemaining, 0);
  assert.equal(player.dashCount, 0);
});
