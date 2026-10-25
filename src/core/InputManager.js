export class InputManager {
  constructor({ target, preventDefaultKeys = new Set() }) {
    if (!target?.addEventListener || !target?.removeEventListener) {
      throw new TypeError("InputManager requires an EventTarget-like target.");
    }

    this.target = target;
    this.preventDefaultKeys = preventDefaultKeys;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.lastEvent = "—";
    this.eventCount = 0;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);

    this.target.addEventListener("keydown", this.handleKeyDown);
    this.target.addEventListener("keyup", this.handleKeyUp);
    this.target.addEventListener("blur", this.handleBlur);
  }

  handleKeyDown(event) {
    const code = event.code;
    if (!code) return;

    if (this.preventDefaultKeys.has(code)) {
      event.preventDefault?.();
    }

    if (!this.down.has(code)) {
      this.pressed.add(code);
    }

    this.down.add(code);
    this.lastEvent = `↓ ${code}${event.repeat ? " (repeat)" : ""}`;
    this.eventCount += 1;
  }

  handleKeyUp(event) {
    const code = event.code;
    if (!code) return;

    if (this.preventDefaultKeys.has(code)) {
      event.preventDefault?.();
    }

    if (this.down.delete(code)) {
      this.released.add(code);
    }

    this.lastEvent = `↑ ${code}`;
    this.eventCount += 1;
  }

  handleBlur() {
    if (this.down.size > 0) {
      this.lastEvent = "窗口失焦 · 输入已清空";
    }
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  wasReleased(code) {
    return this.released.has(code);
  }

  getAxis(controls) {
    const horizontal = Number(this.isDown(controls.right)) - Number(this.isDown(controls.left));
    const vertical = Number(this.isDown(controls.down)) - Number(this.isDown(controls.up));
    return { x: horizontal, y: vertical };
  }

  getActiveKeys() {
    return [...this.down].sort();
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  destroy() {
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("blur", this.handleBlur);
    this.handleBlur();
  }
}
