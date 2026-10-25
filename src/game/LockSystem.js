const TAU = Math.PI * 2;

export class LockSystem {
  constructor(config) {
    this.config = config;
    this.reset();
  }

  reset(attacker = null) {
    this.progress = 0;
    this.recoveryRemaining = 0;
    this.resultFlashRemaining = 0;
    this.lastResult = null;
    this.isFocusing = false;
    this.isValid = false;
    this.conditions = createConditions();
    this.distance = 0;
    this.angleError = 0;
    this.aimAngle = attacker
      ? Math.atan2(attacker.facingY, attacker.facingX)
      : 0;
  }

  update(deltaTime, {
    attacker,
    target,
    wantsFocus,
    hasLineOfSight,
    targetLockImmune,
  }) {
    this.recoveryRemaining = Math.max(0, this.recoveryRemaining - deltaTime);
    this.resultFlashRemaining = Math.max(0, this.resultFlashRemaining - deltaTime);

    const targetAngle = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    const justStarted = wantsFocus && !this.isFocusing && this.recoveryRemaining <= 0;
    const justReleased = !wantsFocus && this.isFocusing;

    if (justStarted) {
      this.aimAngle = Math.atan2(attacker.facingY, attacker.facingX);
      this.lastResult = null;
    }

    this.isFocusing = wantsFocus && this.recoveryRemaining <= 0;
    if (this.isFocusing) {
      this.aimAngle = rotateToward(
        this.aimAngle,
        targetAngle,
        this.config.turnSpeed * deltaTime,
      );
    }

    this.distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
    this.angleError = Math.abs(shortestAngle(this.aimAngle, targetAngle));
    this.conditions = {
      inRange: this.distance <= this.config.range,
      inCone: this.angleError <= this.config.coneHalfAngle,
      lineOfSight: hasLineOfSight,
      targetVulnerable: !targetLockImmune,
    };
    this.isValid = this.isFocusing && Object.values(this.conditions).every(Boolean);

    let event = null;
    if (justReleased) {
      if (this.progress >= 1) {
        event = { type: "complete" };
        this.lastResult = "complete";
      } else {
        event = { type: "early" };
        this.lastResult = "early";
        this.recoveryRemaining = this.config.earlyReleaseRecovery;
      }
      this.resultFlashRemaining = this.config.resultFlashDuration;
      this.progress = 0;
      this.isValid = false;
    } else if (this.isValid) {
      this.progress = Math.min(1, this.progress + deltaTime / this.config.lockDuration);
    } else if (this.progress > 0 && this.progress < 1) {
      this.progress = Math.max(
        0,
        this.progress - (deltaTime / this.config.lockDuration) * this.config.decayMultiplier,
      );
    }

    return event;
  }

  get isReady() {
    return this.progress >= 1;
  }

  get isRecovering() {
    return this.recoveryRemaining > 0;
  }

  get status() {
    if (this.isRecovering) return "RECOVERY";
    if (this.isReady) return "LOCKED";
    if (this.isValid) return "LOCKING";
    if (this.isFocusing) return "SEARCHING";
    return "IDLE";
  }
}

export function rotateToward(current, target, maximumStep) {
  const delta = shortestAngle(current, target);
  if (Math.abs(delta) <= maximumStep) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(delta) * maximumStep);
}

export function shortestAngle(from, to) {
  return ((to - from + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function normalizeAngle(angle) {
  return ((angle % TAU) + TAU) % TAU;
}

function createConditions() {
  return {
    inRange: false,
    inCone: false,
    lineOfSight: false,
    targetVulnerable: false,
  };
}
