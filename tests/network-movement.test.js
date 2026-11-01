import test from "node:test";
import assert from "node:assert/strict";
import {
  applyNetworkInput,
  constrainNetworkPlayer,
  resolveNetworkPlayerPair,
} from "../shared/NetworkMovement.js";

test("N2 movement clamps forged axes and ignores client speed fields", () => {
  const player = { x: 350, y: 438, velocityX: 0, velocityY: 0 };
  applyNetworkInput(player, { moveX: 127, moveY: 0, speed: 99999 }, 0.5);
  assert.equal(player.x, 470);
  assert.equal(player.y, 438);
  assert.equal(player.velocityX, 240);
});

test("N2 movement normalizes diagonals with the shared server speed", () => {
  const player = { x: 350, y: 438, velocityX: 0, velocityY: 0 };
  applyNetworkInput(player, { moveX: 1, moveY: 1 }, 0.25);
  assert.ok(Math.abs(Math.hypot(player.x - 350, player.y - 438) - 60) < 0.0001);
});

test("N2 authoritative collision keeps players inside bounds and outside the pole", () => {
  const boundaryPlayer = { x: -1000, y: 1000 };
  constrainNetworkPlayer(boundaryPlayer);
  assert.equal(boundaryPlayer.x, 116);
  assert.equal(boundaryPlayer.y, 552);

  const polePlayer = { x: 640, y: 422 };
  constrainNetworkPlayer(polePlayer);
  assert.ok(Math.hypot(polePlayer.x - 640, polePlayer.y - 422) >= 88);
});

test("N2 authoritative player collision separates overlapping circles", () => {
  const first = { x: 500, y: 438 };
  const second = { x: 520, y: 438 };
  assert.equal(resolveNetworkPlayerPair(first, second), true);
  assert.ok(Math.abs(Math.hypot(second.x - first.x, second.y - first.y) - 68) < 0.0001);
});
