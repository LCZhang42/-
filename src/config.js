export const GAME_CONFIG = Object.freeze({
  title: "寿数回战",
  version: "0.11.0",
  stageLabel: "美术扩展 A2 · 选角界面",
  logicalWidth: 1280,
  logicalHeight: 720,
  fixedTimeStep: 1 / 60,
  maxFrameDelta: 0.25,
  maxUpdatesPerFrame: 8,
  debugRefreshRate: 8,
});

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

export const AI_DIFFICULTY_CONFIG = Object.freeze({
  rookie: Object.freeze({
    label: "新手",
    correctChance: 0.68,
    wrongChance: 0.17,
    responseRatio: 0.7,
    responseJitter: 0.13,
    dashThreshold: 0.72,
    bullUseChance: 0.3,
  }),
  balanced: Object.freeze({
    label: "普通",
    correctChance: 0.86,
    wrongChance: 0.08,
    responseRatio: 0.54,
    responseJitter: 0.07,
    dashThreshold: 0.56,
    bullUseChance: 0.58,
  }),
  master: Object.freeze({
    label: "高手",
    correctChance: 0.97,
    wrongChance: 0.02,
    responseRatio: 0.5,
    responseJitter: 0.025,
    dashThreshold: 0.4,
    bullUseChance: 0.78,
  }),
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

export const SYSTEM_KEYS = Object.freeze({
  pause: "Escape",
  toggleDebug: "F3",
  restart: "KeyR",
  forceBull: "KeyB",
  toggleLowEffects: "KeyV",
  tutorial: "KeyT",
  settings: "KeyO",
  fullscreen: "KeyX",
  toggleCharacterArt: "KeyM",
  cyclePose: "KeyP",
  cycleP1Character: "KeyC",
  cycleP2Character: "KeyN",
});

export const PREVENT_DEFAULT_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "F3",
]);
