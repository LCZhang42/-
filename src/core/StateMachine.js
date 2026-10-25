export class StateMachine {
  constructor(initialState, transitions = {}) {
    this.state = initialState;
    this.transitions = transitions;
    this.changedAt = 0;
  }

  canTransition(nextState) {
    return this.transitions[this.state]?.includes(nextState) ?? false;
  }

  transition(nextState, timestamp = performance.now()) {
    if (!this.canTransition(nextState)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${nextState}`);
    }
    this.state = nextState;
    this.changedAt = timestamp;
  }
}
