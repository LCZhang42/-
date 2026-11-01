export const COMBAT_STATES = Object.freeze({
  roundStart: "ROUND_START",
  neutral: "NEUTRAL",
  locking: "LOCKING",
  callout: "CALLOUT",
  reaction: "REACTION_WINDOW",
  reflect: "REFLECT",
  recovery: "DAMAGE_RECOVERY",
  roundOver: "ROUND_OVER",
});

export class CombatSystem {
  constructor(config, random) {
    if (typeof random !== "function") {
      throw new TypeError("CombatSystem requires an injected random source");
    }
    this.config = config;
    this.random = random;
    this.events = [];
    this.reset();
  }

  reset() {
    this.life = [this.config.initialLife, this.config.initialLife];
    this.roundRemaining = this.config.roundDuration;
    this.attackerIndex = this.random() < 0.5 ? 0 : 1;
    this.state = COMBAT_STATES.roundStart;
    this.stateTimeRemaining = this.config.roundStartDuration;
    this.safeTimeRemaining = 0;
    this.hitStopRemaining = 0;
    this.reactionElapsed = 0;
    this.attackKind = "shou";
    this.outcome = null;
    this.outcomeDisplayRemaining = 0;
    this.winnerIndex = null;
    this.bullCharge = [0, 0];
    this.bullTokens = [false, false];
    this.bullThresholds = [this.nextBullThreshold(), this.nextBullThreshold()];
    this.bullCooldownRemaining = [0, 0];
    this.forceBullTokens = false;
    this.events.length = 0;
  }

  setReactionTiming(reactionWindow, perfectWindow) {
    this.reactionWindowDuration = Math.max(0.12, reactionWindow);
    this.perfectWindowDuration = Math.min(
      this.reactionWindowDuration,
      Math.max(0.02, perfectWindow),
    );
  }

  update(deltaTime, inputs = {}) {
    this.outcomeDisplayRemaining = Math.max(0, this.outcomeDisplayRemaining - deltaTime);
    this.safeTimeRemaining = Math.max(0, this.safeTimeRemaining - deltaTime);
    this.bullCooldownRemaining = this.bullCooldownRemaining.map((value) =>
      Math.max(0, value - deltaTime),
    );

    if (this.state === COMBAT_STATES.roundOver) return;

    if (this.state === COMBAT_STATES.roundStart) {
      this.advanceTimer(deltaTime, COMBAT_STATES.neutral);
      return;
    }

    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining = Math.max(0, this.hitStopRemaining - deltaTime);
      return;
    }

    this.roundRemaining = Math.max(0, this.roundRemaining - deltaTime);
    if (this.roundRemaining <= 0) {
      this.finishRound();
      return;
    }

    const defenderPressedShou = Boolean(inputs.shouPressed?.[this.defenderIndex]);
    const defenderPressedNiu = Boolean(inputs.niuPressed?.[this.defenderIndex]);

    if (
      (this.state === COMBAT_STATES.neutral || this.state === COMBAT_STATES.locking) &&
      inputs.threatActive &&
      (defenderPressedShou || defenderPressedNiu)
    ) {
      this.resolveFailure("early");
      return;
    }

    if (this.state === COMBAT_STATES.callout) {
      if (defenderPressedShou || defenderPressedNiu) {
        this.resolveFailure("early");
        return;
      }
      this.stateTimeRemaining = Math.max(0, this.stateTimeRemaining - deltaTime);
      if (this.stateTimeRemaining <= 0) {
        this.state = COMBAT_STATES.reaction;
        this.stateTimeRemaining = this.reactionWindowDuration ?? this.config.reactionWindow;
        this.reactionElapsed = 0;
        this.events.push({ type: "reactionOpened" });
      }
      return;
    }

    if (this.state === COMBAT_STATES.reaction) {
      this.reactionElapsed += deltaTime;
      this.stateTimeRemaining = Math.max(0, this.stateTimeRemaining - deltaTime);
      const correctPressed = this.attackKind === "bull"
        ? defenderPressedNiu
        : defenderPressedShou;
      const wrongPressed = this.attackKind === "bull"
        ? defenderPressedShou
        : defenderPressedNiu;
      if (wrongPressed) {
        this.resolveFailure("wrong");
      } else if (correctPressed) {
        this.resolveSuccess(this.attackKind === "shou" && this.isPerfectTiming());
      } else if (this.stateTimeRemaining <= 0) {
        this.resolveFailure("timeout");
      }
      return;
    }

    if (this.state === COMBAT_STATES.reflect) {
      this.stateTimeRemaining = Math.max(0, this.stateTimeRemaining - deltaTime);
      if (this.stateTimeRemaining <= 0) this.swapRoles();
      return;
    }

    if (this.state === COMBAT_STATES.recovery) {
      this.advanceTimer(deltaTime, COMBAT_STATES.neutral);
    }
  }

  setLocking(active) {
    if (this.state === COMBAT_STATES.neutral && active) {
      this.state = COMBAT_STATES.locking;
    } else if (this.state === COMBAT_STATES.locking && !active) {
      this.state = COMBAT_STATES.neutral;
    }
  }

  triggerCallout(kind = "shou") {
    if (!this.canLock) return false;
    this.attackKind = kind;
    this.state = COMBAT_STATES.callout;
    this.stateTimeRemaining = kind === "bull"
      ? this.config.bullWindupDuration
      : this.config.calloutLeadDuration;
    this.events.push({
      type: "callout",
      kind,
      attackerIndex: this.attackerIndex,
      defenderIndex: this.defenderIndex,
    });
    return true;
  }

  triggerBullCallout() {
    if (!this.canUseBull) return false;
    this.consumeBullToken(this.attackerIndex);
    return this.triggerCallout("bull");
  }

  resolveSuccess(perfect) {
    const isBull = this.attackKind === "bull";
    const damage = isBull
      ? this.config.bullDamage
      : perfect
        ? this.config.perfectDamage
        : this.config.normalDamage;
    const damagedIndex = this.attackerIndex;
    this.life[damagedIndex] = Math.max(0, this.life[damagedIndex] - damage);
    this.outcome = {
      type: isBull ? "bullReflect" : perfect ? "perfect" : "reflect",
      attackKind: this.attackKind,
      damage,
      damagedIndex,
      sourceIndex: this.defenderIndex,
      targetIndex: damagedIndex,
    };
    this.outcomeDisplayRemaining = this.config.outcomeDisplayDuration;
    this.hitStopRemaining = this.config.hitStopDuration * (perfect ? 1.7 : 1);
    this.state = COMBAT_STATES.reflect;
    this.stateTimeRemaining = this.config.reflectDuration;
    this.events.push({ type: "outcome", outcome: this.outcome });
    if (perfect) this.addBullCharge(this.defenderIndex, this.config.bullChargePerfect);
    this.checkLifeEnd();
  }

  resolveFailure(reason) {
    const isBull = this.attackKind === "bull";
    const outcomeType = reason === "wrong"
      ? isBull ? "bullStun" : "family"
      : reason === "timeout" && isBull
        ? "bullTimeout"
        : reason;
    const damage = isBull ? this.config.bullDamage : this.config.normalDamage;
    const damagedIndex = this.defenderIndex;
    this.life[damagedIndex] = Math.max(
      0,
      this.life[damagedIndex] - damage,
    );
    this.outcome = {
      type: outcomeType,
      attackKind: this.attackKind,
      damage,
      damagedIndex,
      sourceIndex: this.attackerIndex,
      targetIndex: damagedIndex,
    };
    this.outcomeDisplayRemaining = this.config.outcomeDisplayDuration;
    this.hitStopRemaining = this.config.hitStopDuration;
    this.state = COMBAT_STATES.recovery;
    this.stateTimeRemaining = outcomeType === "bullStun"
      ? this.config.bullStunDuration
      : outcomeType === "family"
        ? this.config.recognitionStunDuration
        : this.config.damageRecovery;
    this.events.push({ type: "outcome", outcome: this.outcome });
    this.events.push({ type: "cancelLock" });
    this.checkLifeEnd();
  }

  swapRoles() {
    this.attackerIndex = this.defenderIndex;
    this.safeTimeRemaining = this.config.roleSwapSafety;
    this.state = COMBAT_STATES.neutral;
    this.events.push({ type: "roleSwap", attackerIndex: this.attackerIndex });
  }

  addBullCharge(playerIndex, amount) {
    if (
      this.bullTokens[playerIndex] ||
      this.bullCooldownRemaining[playerIndex] > 0 ||
      amount <= 0
    ) {
      return false;
    }

    this.bullCharge[playerIndex] = Math.min(
      this.bullThresholds[playerIndex],
      this.bullCharge[playerIndex] + amount,
    );
    if (this.bullCharge[playerIndex] < this.bullThresholds[playerIndex]) return false;

    this.bullTokens[playerIndex] = true;
    this.events.push({ type: "bullToken", playerIndex });
    return true;
  }

  consumeBullToken(playerIndex) {
    if (!this.forceBullTokens) this.bullTokens[playerIndex] = false;
    this.bullCharge[playerIndex] = 0;
    this.bullCooldownRemaining[playerIndex] = this.config.bullTokenCooldown;
    this.bullThresholds[playerIndex] = this.nextBullThreshold();
  }

  setForceBullTokens(value) {
    this.forceBullTokens = Boolean(value);
    this.events.push({ type: "forceBull", enabled: this.forceBullTokens });
  }

  nextBullThreshold() {
    return (
      this.config.bullChargeThresholdMin +
      this.random() * this.config.bullChargeThresholdVariance
    );
  }

  isPerfectTiming() {
    const reactionWindow = this.reactionWindowDuration ?? this.config.reactionWindow;
    const perfectWindow = this.perfectWindowDuration ?? this.config.perfectWindow;
    const center = reactionWindow / 2;
    return Math.abs(this.reactionElapsed - center) <= perfectWindow / 2;
  }

  finishRound() {
    if (this.life[0] === this.life[1]) {
      this.winnerIndex = null;
    } else {
      this.winnerIndex = this.life[0] > this.life[1] ? 0 : 1;
    }
    this.state = COMBAT_STATES.roundOver;
    this.stateTimeRemaining = 0;
    this.events.push({ type: "roundOver", winnerIndex: this.winnerIndex });
  }

  checkLifeEnd() {
    if (this.life.some((value) => value <= 0)) this.finishRound();
  }

  advanceTimer(deltaTime, nextState) {
    this.stateTimeRemaining = Math.max(0, this.stateTimeRemaining - deltaTime);
    if (this.stateTimeRemaining <= 0) this.state = nextState;
  }

  drainEvents() {
    return this.events.splice(0);
  }

  get defenderIndex() {
    return this.attackerIndex === 0 ? 1 : 0;
  }

  get canLock() {
    return (
      (this.state === COMBAT_STATES.neutral || this.state === COMBAT_STATES.locking) &&
      this.safeTimeRemaining <= 0
    );
  }

  get canUseBull() {
    return this.canLock && (this.forceBullTokens || this.bullTokens[this.attackerIndex]);
  }

  get movementAllowed() {
    return this.state === COMBAT_STATES.neutral || this.state === COMBAT_STATES.locking;
  }

  get reactionProgress() {
    if (this.state !== COMBAT_STATES.reaction) return 0;
    const duration = this.reactionWindowDuration ?? this.config.reactionWindow;
    return Math.min(1, this.reactionElapsed / duration);
  }
}
