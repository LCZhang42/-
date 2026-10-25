import test from "node:test";
import assert from "node:assert/strict";
import { InputManager } from "../src/core/InputManager.js";

class FakeTarget extends EventTarget {
  emit(type, code, repeat = false) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      code: { value: code },
      repeat: { value: repeat },
    });
    this.dispatchEvent(event);
    return event;
  }
}

test("tracks simultaneous keys without collapsing them", () => {
  const target = new FakeTarget();
  const input = new InputManager({ target });

  target.emit("keydown", "KeyW");
  target.emit("keydown", "KeyF");
  target.emit("keydown", "ArrowLeft");
  target.emit("keydown", "KeyK");

  assert.deepEqual(input.getActiveKeys(), ["ArrowLeft", "KeyF", "KeyK", "KeyW"]);
  assert.equal(input.isDown("KeyW"), true);
  assert.equal(input.isDown("KeyK"), true);

  input.destroy();
});

test("distinguishes left and right Shift by KeyboardEvent.code", () => {
  const target = new FakeTarget();
  const input = new InputManager({ target });

  target.emit("keydown", "ShiftLeft");
  target.emit("keydown", "ShiftRight");
  assert.equal(input.isDown("ShiftLeft"), true);
  assert.equal(input.isDown("ShiftRight"), true);

  target.emit("keyup", "ShiftLeft");
  assert.equal(input.isDown("ShiftLeft"), false);
  assert.equal(input.isDown("ShiftRight"), true);

  input.destroy();
});

test("clears held input when the window loses focus", () => {
  const target = new FakeTarget();
  const input = new InputManager({ target });

  target.emit("keydown", "KeyA");
  target.dispatchEvent(new Event("blur"));

  assert.deepEqual(input.getActiveKeys(), []);
  assert.match(input.lastEvent, /输入已清空/);

  input.destroy();
});
