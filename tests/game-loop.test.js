import test from "node:test";
import assert from "node:assert/strict";
import { GameLoop } from "../src/core/GameLoop.js";

function createFakeAnimationClock() {
  let callback = null;
  let nextHandle = 0;
  return {
    requestFrame(nextCallback) {
      callback = nextCallback;
      nextHandle += 1;
      return nextHandle;
    },
    cancelFrame() {
      callback = null;
    },
    step(timestamp) {
      const current = callback;
      callback = null;
      current?.(timestamp);
    },
  };
}

test("runs updates at a fixed timestep", () => {
  const clock = createFakeAnimationClock();
  let updates = 0;
  const loop = new GameLoop({
    fixedTimeStep: 0.01,
    onUpdate: () => {
      updates += 1;
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  loop.start();
  clock.step(0);
  clock.step(35);

  assert.equal(updates, 3);
  assert.ok(Math.abs(loop.accumulator - 0.005) < 1e-9);
  loop.stop();
});

test("continues rendering while paused without updating simulation", () => {
  const clock = createFakeAnimationClock();
  let updates = 0;
  let renders = 0;
  const loop = new GameLoop({
    fixedTimeStep: 0.01,
    onUpdate: () => {
      updates += 1;
    },
    onRender: () => {
      renders += 1;
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  loop.start();
  clock.step(0);
  loop.setPaused(true);
  clock.step(100);

  assert.equal(updates, 0);
  assert.equal(renders, 2);
  loop.stop();
});

test("caps catch-up work after a long frame", () => {
  const clock = createFakeAnimationClock();
  let updates = 0;
  const loop = new GameLoop({
    fixedTimeStep: 0.01,
    maxFrameDelta: 1,
    maxUpdatesPerFrame: 4,
    onUpdate: () => {
      updates += 1;
    },
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  loop.start();
  clock.step(0);
  clock.step(100);

  assert.equal(updates, 4);
  assert.equal(loop.stats.droppedUpdateFrames, 1);
  loop.stop();
});
