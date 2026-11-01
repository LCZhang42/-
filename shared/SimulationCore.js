import { Arena, resolvePlayerPair } from "../src/game/Arena.js";
import { CombatSystem } from "../src/game/CombatSystem.js";
import { LockSystem } from "../src/game/LockSystem.js";
import { Player } from "../src/game/Player.js";
import { SeededRandom } from "./SeededRandom.js";

const EMPTY_COMMAND = Object.freeze({
  x: 0,
  y: 0,
  dashPressed: false,
  shouDown: false,
  shouPressed: false,
  niuPressed: false,
});

export class SimulationCore {
  constructor({
    arenaConfig,
    combatConfig,
    lockConfig,
    movementConfig,
    playerConfigs,
    seed = 0x6d2b79f5,
    reactionTiming = null,
  }) {
    if (!arenaConfig || !combatConfig || !lockConfig || !movementConfig) {
      throw new TypeError("SimulationCore requires arena, combat, lock, and movement configs");
    }
    if (!Array.isArray(playerConfigs) || playerConfigs.length !== 2) {
      throw new TypeError("SimulationCore requires exactly two player configs");
    }

    this.config = Object.freeze({
      arena: arenaConfig,
      combat: combatConfig,
      lock: lockConfig,
      movement: movementConfig,
      players: playerConfigs,
    });
    this.random = new SeededRandom(seed);
    this.arena = new Arena(arenaConfig);
    this.players = playerConfigs.map((playerConfig) => new Player(playerConfig, movementConfig));
    this.lock = new LockSystem(lockConfig);
    this.combat = new CombatSystem(combatConfig, () => this.random.next());
    this.reactionTiming = reactionTiming ? { ...reactionTiming } : null;
    this.tick = 0;
    this.lineOfSightClear = false;
    this.reset({ seed, reactionTiming });
  }

  reset({ seed = this.random.initialSeed, reactionTiming = this.reactionTiming } = {}) {
    this.random.reset(seed);
    for (const player of this.players) player.reset();
    this.combat.reset();
    if (reactionTiming) this.setReactionTiming(
      reactionTiming.reactionWindow,
      reactionTiming.perfectWindow,
    );
    this.lock.reset(this.players[this.combat.attackerIndex]);
    this.tick = 0;
    this.updateLineOfSight();
    return this.getState();
  }

  setReactionTiming(reactionWindow, perfectWindow) {
    this.reactionTiming = { reactionWindow, perfectWindow };
    this.combat.setReactionTiming(reactionWindow, perfectWindow);
  }

  setForceBullTokens(value) {
    this.combat.setForceBullTokens(value);
    return this.flushCombatEvents();
  }

  step(deltaTime, inputCommands = []) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      throw new TypeError("SimulationCore.step requires a positive finite deltaTime");
    }
    const commands = [0, 1].map((index) => normalizeCommand(inputCommands[index]));
    const events = [];
    this.tick += 1;

    const shouPressed = commands.map((command) => command.shouPressed);
    const niuPressed = commands.map((command) => command.niuPressed);
    this.combat.update(deltaTime, {
      shouPressed,
      niuPressed,
      threatActive: this.lock.isFocusing,
    });
    this.collectCombatEvents(events);

    if (
      niuPressed[this.combat.attackerIndex] &&
      this.combat.triggerBullCallout()
    ) {
      this.lock.reset(this.players[this.combat.attackerIndex]);
      this.collectCombatEvents(events);
    }

    const attacker = this.players[this.combat.attackerIndex];
    const target = this.players[this.combat.defenderIndex];
    const wantsFocus = this.combat.canLock && commands[this.combat.attackerIndex].shouDown;
    const movementAllowed = this.combat.movementAllowed && this.combat.hitStopRemaining <= 0;

    for (const [index, player] of this.players.entries()) {
      player.beginStep();
      const axis = movementAllowed ? commands[index] : EMPTY_COMMAND;
      player.update(deltaTime, {
        ...axis,
        dashPressed: movementAllowed && commands[index].dashPressed,
        moveSpeed:
          player === attacker && wantsFocus && !this.lock.isRecovering
            ? this.config.movement.focusMoveSpeed
            : this.config.movement.moveSpeed,
      });
    }

    for (let pass = 0; pass < this.config.movement.collisionPasses; pass += 1) {
      for (const player of this.players) this.arena.constrainPlayer(player);
      resolvePlayerPair(this.players[0], this.players[1]);
    }
    for (const player of this.players) this.arena.constrainPlayer(player);
    this.updateLineOfSight();

    const lockEvent = this.lock.update(deltaTime, {
      attacker,
      target,
      wantsFocus,
      hasLineOfSight: this.lineOfSightClear,
      targetLockImmune: target.isLockImmune,
    });
    this.combat.setLocking(this.lock.isFocusing);
    if (lockEvent) this.resolveLockEvent(lockEvent, events);
    this.collectCombatEvents(events);

    return { state: this.getState(), events };
  }

  flushCombatEvents() {
    const events = [];
    this.collectCombatEvents(events);
    return events;
  }

  resolveLockEvent(lockEvent, events) {
    const attackerIndex = this.combat.attackerIndex;
    const defenderIndex = this.combat.defenderIndex;
    events.push({
      type: "lockAttempt",
      result: lockEvent.type,
      attackerIndex,
      defenderIndex,
    });
    if (lockEvent.type === "complete") {
      this.combat.addBullCharge(attackerIndex, this.config.combat.bullChargeLock);
      this.combat.triggerCallout("shou");
      return;
    }
    this.combat.addBullCharge(defenderIndex, this.config.combat.bullChargeDodge);
  }

  collectCombatEvents(events) {
    for (const event of this.combat.drainEvents()) {
      if (["cancelLock", "roleSwap", "roundOver"].includes(event.type)) {
        this.lock.reset(this.players[this.combat.attackerIndex]);
      }
      events.push(event);
    }
  }

  updateLineOfSight() {
    this.lineOfSightClear = this.arena.hasLineOfSight(
      this.players[this.combat.attackerIndex],
      this.players[this.combat.defenderIndex],
    );
    return this.lineOfSightClear;
  }

  getState() {
    return {
      tick: this.tick,
      randomState: this.random.state,
      lineOfSightClear: this.lineOfSightClear,
      players: this.players.map(snapshotPlayer),
      combat: snapshotCombat(this.combat),
      lock: snapshotLock(this.lock),
    };
  }
}

export function emptySimulationCommand() {
  return { ...EMPTY_COMMAND };
}

function normalizeCommand(command = EMPTY_COMMAND) {
  return {
    x: clampAxis(command.x),
    y: clampAxis(command.y),
    dashPressed: Boolean(command.dashPressed),
    shouDown: Boolean(command.shouDown),
    shouPressed: Boolean(command.shouPressed),
    niuPressed: Boolean(command.niuPressed),
  };
}

function clampAxis(value) {
  const number = Number(value) || 0;
  return Math.max(-1, Math.min(1, number));
}

function snapshotPlayer(player) {
  return {
    id: player.id,
    x: player.x,
    y: player.y,
    previousX: player.previousX,
    previousY: player.previousY,
    velocityX: player.velocityX,
    velocityY: player.velocityY,
    facingX: player.facingX,
    facingY: player.facingY,
    dashDirectionX: player.dashDirectionX,
    dashDirectionY: player.dashDirectionY,
    dashTimeRemaining: player.dashTimeRemaining,
    dashCooldownRemaining: player.dashCooldownRemaining,
    lockImmunityRemaining: player.lockImmunityRemaining,
    dashCount: player.dashCount,
  };
}

function snapshotCombat(combat) {
  return {
    state: combat.state,
    stateTimeRemaining: combat.stateTimeRemaining,
    roundRemaining: combat.roundRemaining,
    safeTimeRemaining: combat.safeTimeRemaining,
    hitStopRemaining: combat.hitStopRemaining,
    reactionElapsed: combat.reactionElapsed,
    reactionWindowDuration: combat.reactionWindowDuration,
    perfectWindowDuration: combat.perfectWindowDuration,
    attackerIndex: combat.attackerIndex,
    defenderIndex: combat.defenderIndex,
    attackKind: combat.attackKind,
    life: [...combat.life],
    outcome: combat.outcome ? { ...combat.outcome } : null,
    outcomeDisplayRemaining: combat.outcomeDisplayRemaining,
    winnerIndex: combat.winnerIndex,
    bullCharge: [...combat.bullCharge],
    bullTokens: [...combat.bullTokens],
    bullThresholds: [...combat.bullThresholds],
    bullCooldownRemaining: [...combat.bullCooldownRemaining],
    forceBullTokens: combat.forceBullTokens,
  };
}

function snapshotLock(lock) {
  return {
    progress: lock.progress,
    recoveryRemaining: lock.recoveryRemaining,
    resultFlashRemaining: lock.resultFlashRemaining,
    lastResult: lock.lastResult,
    isFocusing: lock.isFocusing,
    isValid: lock.isValid,
    isReady: lock.isReady,
    isRecovering: lock.isRecovering,
    conditions: { ...lock.conditions },
    distance: lock.distance,
    angleError: lock.angleError,
    aimAngle: lock.aimAngle,
  };
}
