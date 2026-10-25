export class MatchStats {
  constructor() {
    this.reset();
  }

  reset() {
    this.lockAttempts = [0, 0];
    this.responses = [0, 0];
    this.successfulResponses = [0, 0];
    this.attackerSeconds = [0, 0];
    this.outcomes = [];
  }

  update(deltaTime, attackerIndex, active = true) {
    if (!active) return;
    this.attackerSeconds[attackerIndex] += deltaTime;
  }

  recordLock(playerIndex) {
    this.lockAttempts[playerIndex] += 1;
  }

  recordOutcome(outcome, defenderIndex) {
    const success = ["reflect", "perfect", "bullReflect"].includes(outcome.type);
    this.responses[defenderIndex] += 1;
    if (success) this.successfulResponses[defenderIndex] += 1;
    this.outcomes.push({
      type: outcome.type,
      attackKind: outcome.attackKind,
      damage: outcome.damage,
    });
  }

  get totalResponses() {
    return this.responses[0] + this.responses[1];
  }

  get totalSuccessfulResponses() {
    return this.successfulResponses[0] + this.successfulResponses[1];
  }

  get responseRate() {
    if (this.totalResponses === 0) return 0;
    return this.totalSuccessfulResponses / this.totalResponses;
  }
}
