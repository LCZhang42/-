export const MOVEMENT_CONFIG = Object.freeze({
  moveSpeed: 240,
  focusMoveSpeed: 145,
  playerRadius: 34,
  dashSpeed: 520,
  dashDuration: 0.16,
  dashCooldown: 1.8,
  dashLockImmunity: 0.24,
  collisionPasses: 3,
});

export const LOCK_CONFIG = Object.freeze({
  range: 470,
  coneHalfAngle: Math.PI * (25 / 180),
  turnSpeed: Math.PI * (155 / 180),
  lockDuration: 0.75,
  decayMultiplier: 1.5,
  earlyReleaseRecovery: 0.65,
  resultFlashDuration: 0.7,
});

export const COMBAT_CONFIG = Object.freeze({
  initialLife: 60,
  roundDuration: 75,
  roundStartDuration: 1.2,
  calloutLeadDuration: 0.16,
  reactionWindow: 0.42,
  perfectWindow: 0.1,
  normalDamage: 6,
  perfectDamage: 9,
  damageRecovery: 0.5,
  reflectDuration: 0.42,
  hitStopDuration: 0.07,
  roleSwapSafety: 0.45,
  outcomeDisplayDuration: 1.15,
  bullDamage: 5,
  bullWindupDuration: 0.34,
  bullStunDuration: 1,
  recognitionStunDuration: 0.8,
  bullChargeThresholdMin: 80,
  bullChargeThresholdVariance: 20,
  bullChargeLock: 28,
  bullChargePerfect: 44,
  bullChargeDodge: 18,
  bullTokenCooldown: 8,
});

export const DIFFICULTY_CONFIG = Object.freeze({
  relaxed: Object.freeze({ label: "宽松", reactionWindow: 0.68, perfectWindow: 0.18 }),
  standard: Object.freeze({ label: "标准", reactionWindow: 0.5, perfectWindow: 0.12 }),
  expert: Object.freeze({ label: "高手", reactionWindow: 0.34, perfectWindow: 0.08 }),
});

export const ARENA_CONFIG = Object.freeze({
  bounds: Object.freeze({
    left: 82,
    right: 1198,
    top: 315,
    bottom: 586,
  }),
  obstacles: Object.freeze([
    Object.freeze({
      id: "utility-pole",
      type: "circle",
      x: 640,
      y: 422,
      radius: 54,
    }),
  ]),
});

export const PLAYER_CONFIGS = Object.freeze([
  Object.freeze({
    id: "P1",
    name: "朱寿",
    color: "#ff653f",
    glow: "rgba(255, 101, 63, 0.36)",
    start: Object.freeze({ x: 350, y: 438 }),
    controls: Object.freeze({
      up: "KeyW",
      down: "KeyS",
      left: "KeyA",
      right: "KeyD",
      shou: "KeyF",
      niu: "KeyG",
      dash: "ShiftLeft",
    }),
  }),
  Object.freeze({
    id: "P2",
    name: "青寿",
    color: "#40d9e8",
    glow: "rgba(64, 217, 232, 0.34)",
    start: Object.freeze({ x: 930, y: 438 }),
    controls: Object.freeze({
      up: "ArrowUp",
      down: "ArrowDown",
      left: "ArrowLeft",
      right: "ArrowRight",
      shou: "KeyK",
      niu: "KeyL",
      dash: "ShiftRight",
    }),
  }),
]);
