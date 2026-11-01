export class SeededRandom {
  constructor(seed = 0x6d2b79f5) {
    this.reset(seed);
  }

  reset(seed) {
    if (!Number.isFinite(seed)) throw new TypeError("random seed must be finite");
    this.initialSeed = Number(seed) >>> 0;
    this.state = this.initialSeed;
    return this.state;
  }

  next() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

export function createSeededRandom(seed) {
  const generator = new SeededRandom(seed);
  return () => generator.next();
}
