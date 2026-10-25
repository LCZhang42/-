import { AI_DIFFICULTY_CONFIG, LOCK_CONFIG } from "../config.js";
import { COMBAT_STATES } from "../game/CombatSystem.js";

export class AIController {
  constructor({ playerIndex = 1, difficulty = "balanced", random = Math.random } = {}) {
    this.playerIndex = playerIndex;
    this.random = random;
    this.setDifficulty(difficulty);
    this.reset();
  }

  setDifficulty(key) {
    this.difficulty = AI_DIFFICULTY_CONFIG[key] ? key : "balanced";
    this.profile = AI_DIFFICULTY_CONFIG[this.difficulty];
  }

  reset() {
    this.elapsed = 0;
    this.lastCombatState = null;
    this.reactionPlan = null;
    this.bullDecisionCooldown = 0.45;
    this.dashDecisionCooldown = 0;
  }

  update(deltaTime, { self, opponent, combat, lock, lineOfSight }) {
    this.elapsed += deltaTime;
    this.bullDecisionCooldown = Math.max(0, this.bullDecisionCooldown - deltaTime);
    this.dashDecisionCooldown = Math.max(0, this.dashDecisionCooldown - deltaTime);

    if (combat.state === COMBAT_STATES.reaction && this.lastCombatState !== COMBAT_STATES.reaction) {
      this.planReaction(combat);
    } else if (combat.state !== COMBAT_STATES.reaction) {
      this.reactionPlan = null;
    }

    const isAttacker = combat.attackerIndex === this.playerIndex;
    const movement = isAttacker
      ? this.getAttackMovement(self, opponent, lineOfSight)
      : this.getDefenseMovement(self, opponent, lock);
    const command = {
      ...movement,
      dashPressed: false,
      shouDown: false,
      shouPressed: false,
      niuPressed: false,
    };

    if (isAttacker) {
      command.shouDown = Boolean(
        combat.canLock &&
        lineOfSight &&
        !lock.isRecovering &&
        !lock.isReady &&
        distance(self, opponent) <= LOCK_CONFIG.range * 0.96
      );
      if (combat.canUseBull && this.bullDecisionCooldown <= 0) {
        command.niuPressed = this.random() < this.profile.bullUseChance;
        this.bullDecisionCooldown = command.niuPressed ? 1.4 : 0.55;
      }
    } else {
      command.dashPressed = this.shouldDash(self, lock);
      this.applyReaction(command, combat);
    }

    this.lastCombatState = combat.state;
    return command;
  }

  planReaction(combat) {
    const outcomeRoll = this.random();
    const outcome = outcomeRoll < this.profile.correctChance
      ? "correct"
      : outcomeRoll < this.profile.correctChance + this.profile.wrongChance
        ? "wrong"
        : "miss";
    const duration = combat.reactionWindowDuration ?? combat.config.reactionWindow;
    const jitter = (this.random() * 2 - 1) * this.profile.responseJitter;
    this.reactionPlan = {
      outcome,
      attackKind: combat.attackKind,
      delay: Math.max(0.04, duration * (this.profile.responseRatio + jitter)),
      used: false,
    };
  }

  applyReaction(command, combat) {
    const plan = this.reactionPlan;
    if (!plan || plan.used || plan.outcome === "miss" || combat.reactionElapsed < plan.delay) return;

    const correctIsBull = plan.attackKind === "bull";
    const pressBull = plan.outcome === "correct" ? correctIsBull : !correctIsBull;
    command.niuPressed = pressBull;
    command.shouPressed = !pressBull;
    plan.used = true;
  }

  shouldDash(self, lock) {
    if (
      !lock.isFocusing ||
      lock.progress < this.profile.dashThreshold ||
      self.dashCooldownRemaining > 0 ||
      this.dashDecisionCooldown > 0
    ) {
      return false;
    }
    this.dashDecisionCooldown = 0.7;
    return true;
  }

  getAttackMovement(self, opponent, lineOfSight) {
    const direction = unit(opponent.x - self.x, opponent.y - self.y);
    const orbitSign = Math.sin(this.elapsed * 1.35) >= 0 ? 1 : -1;
    const perpendicular = { x: -direction.y * orbitSign, y: direction.x * orbitSign };
    const gap = distance(self, opponent);

    if (!lineOfSight) return unit(perpendicular.x + direction.x * 0.25, perpendicular.y + direction.y * 0.25);
    if (gap > 345) return unit(direction.x + perpendicular.x * 0.26, direction.y + perpendicular.y * 0.26);
    if (gap < 185) return unit(-direction.x * 0.5 + perpendicular.x, -direction.y * 0.5 + perpendicular.y);
    return unit(perpendicular.x * 0.7 + direction.x * 0.18, perpendicular.y * 0.7 + direction.y * 0.18);
  }

  getDefenseMovement(self, opponent, lock) {
    const away = unit(self.x - opponent.x, self.y - opponent.y);
    const dodgeSign = Math.sin(this.elapsed * 2.1) >= 0 ? 1 : -1;
    const perpendicular = { x: -away.y * dodgeSign, y: away.x * dodgeSign };
    if (lock.isFocusing) {
      return unit(perpendicular.x + away.x * 0.42, perpendicular.y + away.y * 0.42);
    }
    return unit(perpendicular.x * 0.55 + away.x * 0.3, perpendicular.y * 0.55 + away.y * 0.3);
  }
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function unit(x, y) {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}
