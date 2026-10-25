export class VoiceAnnouncer {
  constructor(speech = globalThis.speechSynthesis) {
    this.speech = speech;
    this.enabled = true;
    this.volume = 0.8;
  }

  setEnabled(value) {
    this.enabled = Boolean(value);
    if (!this.enabled) this.speech?.cancel?.();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value)));
  }

  speak(text) {
    const Utterance = globalThis.SpeechSynthesisUtterance;
    if (!this.enabled || !this.speech || !Utterance || !text) return false;
    const utterance = new Utterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.22;
    utterance.pitch = text === "牛来" ? 0.72 : 1.08;
    utterance.volume = this.volume;
    this.speech.cancel();
    this.speech.speak(utterance);
    return true;
  }

  destroy() {
    this.speech?.cancel?.();
  }
}
