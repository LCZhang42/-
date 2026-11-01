export class NetworkEventDeduplicator {
  constructor(maxRemembered = 256) {
    this.maxRemembered = Math.max(16, Math.floor(maxRemembered));
    this.seen = new Set();
    this.order = [];
  }

  accept(event) {
    const id = Number(event?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    while (this.order.length > this.maxRemembered) {
      this.seen.delete(this.order.shift());
    }
    return true;
  }

  reset() {
    this.seen.clear();
    this.order.length = 0;
  }
}
