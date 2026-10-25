export class GameLoop {
  constructor({
    fixedTimeStep = 1 / 60,
    maxFrameDelta = 0.25,
    maxUpdatesPerFrame = 8,
    onFrame = () => {},
    onUpdate = () => {},
    onRender = () => {},
    requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
    cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
  } = {}) {
    if (!requestFrame || !cancelFrame) {
      throw new Error("GameLoop requires requestAnimationFrame and cancelAnimationFrame.");
    }

    this.fixedTimeStep = fixedTimeStep;
    this.maxFrameDelta = maxFrameDelta;
    this.maxUpdatesPerFrame = maxUpdatesPerFrame;
    this.onFrame = onFrame;
    this.onUpdate = onUpdate;
    this.onRender = onRender;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;

    this.running = false;
    this.paused = false;
    this.frameHandle = null;
    this.lastTimestamp = null;
    this.accumulator = 0;
    this.elapsed = 0;
    this.stats = {
      fps: 0,
      frameTimeMs: 0,
      updatesThisFrame: 0,
      totalFrames: 0,
      droppedUpdateFrames: 0,
    };

    this.boundTick = this.tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = null;
    this.frameHandle = this.requestFrame(this.boundTick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.lastTimestamp = null;
    this.accumulator = 0;
  }

  setPaused(value) {
    this.paused = Boolean(value);
    this.accumulator = 0;
  }

  togglePaused() {
    this.setPaused(!this.paused);
    return this.paused;
  }

  tick(timestamp) {
    if (!this.running) return;

    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
    }

    const rawDelta = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    const frameDelta = Math.min(rawDelta, this.maxFrameDelta);
    this.lastTimestamp = timestamp;

    this.stats.frameTimeMs = rawDelta * 1000;
    this.stats.fps = rawDelta > 0 ? 1 / rawDelta : 0;
    this.stats.updatesThisFrame = 0;
    this.stats.totalFrames += 1;

    this.onFrame(frameDelta, this);

    if (!this.paused) {
      this.accumulator += frameDelta;

      while (
        this.accumulator >= this.fixedTimeStep &&
        this.stats.updatesThisFrame < this.maxUpdatesPerFrame
      ) {
        this.onUpdate(this.fixedTimeStep, this.elapsed);
        this.elapsed += this.fixedTimeStep;
        this.accumulator -= this.fixedTimeStep;
        this.stats.updatesThisFrame += 1;
      }

      if (this.accumulator >= this.fixedTimeStep) {
        this.accumulator %= this.fixedTimeStep;
        this.stats.droppedUpdateFrames += 1;
      }
    }

    const interpolation = this.paused ? 0 : this.accumulator / this.fixedTimeStep;
    this.onRender(interpolation, this);
    this.frameHandle = this.requestFrame(this.boundTick);
  }
}
