export class LockAudio {
  constructor() {
    this.context = null;
    this.oscillator = null;
    this.gain = null;
    this.masterVolume = 0.8;
    this.effectsVolume = 0.8;
  }

  setVolumes({ master = this.masterVolume, effects = this.effectsVolume } = {}) {
    this.masterVolume = Math.max(0, Math.min(1, Number(master)));
    this.effectsVolume = Math.max(0, Math.min(1, Number(effects)));
  }

  get outputScale() {
    return this.masterVolume * this.effectsVolume;
  }

  unlock() {
    if (!this.context) this.createGraph();
    if (this.context?.state === "suspended") {
      this.context.resume().catch(() => {});
    }
  }

  update(progress, active) {
    if (!this.context || !this.oscillator || !this.gain) return;
    const now = this.context.currentTime;
    const frequency = 170 + progress * 510;
    const volume = active ? (0.018 + progress * 0.035) * this.outputScale : 0;
    this.oscillator.frequency.setTargetAtTime(frequency, now, 0.025);
    this.gain.gain.setTargetAtTime(volume, now, 0.025);
  }

  pulse(success) {
    if (!this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = success ? "triangle" : "sawtooth";
    oscillator.frequency.setValueAtTime(success ? 760 : 115, now);
    oscillator.frequency.exponentialRampToValueAtTime(success ? 1120 : 74, now + 0.16);
    gain.gain.setValueAtTime(Math.max(0.0001, 0.07 * this.outputScale), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
  }

  combatCue(kind) {
    this.unlock();
    if (!this.context) return;

    const recipes = {
      callout: [180, 420, 0.24, "sawtooth"],
      bullCallout: [92, 138, 0.34, "square"],
      window: [520, 720, 0.12, "square"],
      bullWindow: [240, 190, 0.16, "triangle"],
      reflect: [820, 330, 0.3, "triangle"],
      perfect: [1080, 420, 0.4, "triangle"],
      early: [150, 78, 0.28, "sawtooth"],
      wrong: [190, 92, 0.3, "square"],
      timeout: [130, 65, 0.32, "sawtooth"],
      bullReflect: [132, 560, 0.36, "sawtooth"],
      bullStun: [105, 62, 0.48, "square"],
      bullTimeout: [96, 54, 0.42, "sawtooth"],
      family: [220, 82, 0.38, "square"],
    };
    const [from, to, duration, type] = recipes[kind] ?? recipes.timeout;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, 0.085 * this.outputScale), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  createGraph() {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.oscillator = this.context.createOscillator();
    this.gain = this.context.createGain();
    this.oscillator.type = "sine";
    this.gain.gain.value = 0;
    this.oscillator.connect(this.gain).connect(this.context.destination);
    this.oscillator.start();
  }

  destroy() {
    this.oscillator?.stop();
    this.context?.close();
  }
}
