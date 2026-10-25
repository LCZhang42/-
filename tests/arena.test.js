import test from "node:test";
import assert from "node:assert/strict";
import {
  Arena,
  resolvePlayerPair,
  segmentIntersectsCircle,
} from "../src/game/Arena.js";

const arena = new Arena({
  bounds: { left: 0, right: 500, top: 0, bottom: 300 },
  obstacles: [{ id: "pole", type: "circle", x: 250, y: 150, radius: 40 }],
});

test("constrains a player to the arena bounds", () => {
  const player = { x: -100, y: 500, radius: 20 };
  arena.constrainPlayer(player);
  assert.equal(player.x, 20);
  assert.equal(player.y, 280);
});

test("pushes a player out of the circular obstacle", () => {
  const player = { x: 250, y: 150, radius: 20 };
  arena.constrainPlayer(player);
  assert.equal(Math.hypot(player.x - 250, player.y - 150), 60);
});

test("separates overlapping players evenly", () => {
  const first = { x: 100, y: 100, radius: 30 };
  const second = { x: 140, y: 100, radius: 30 };
  const collided = resolvePlayerPair(first, second);

  assert.equal(collided, true);
  assert.equal(first.x, 90);
  assert.equal(second.x, 150);
});

test("detects whether a pole blocks a sight segment", () => {
  const pole = { x: 250, y: 150, radius: 40 };
  assert.equal(
    segmentIntersectsCircle({ x: 50, y: 150 }, { x: 450, y: 150 }, pole),
    true,
  );
  assert.equal(
    segmentIntersectsCircle({ x: 50, y: 40 }, { x: 450, y: 40 }, pole),
    false,
  );
});
