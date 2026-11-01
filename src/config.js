import {
  ARENA_CONFIG,
  COMBAT_CONFIG,
  DIFFICULTY_CONFIG,
  LOCK_CONFIG,
  MOVEMENT_CONFIG,
  PLAYER_CONFIGS,
} from "../shared/BalanceConfig.js";

export {
  ARENA_CONFIG,
  COMBAT_CONFIG,
  DIFFICULTY_CONFIG,
  LOCK_CONFIG,
  MOVEMENT_CONFIG,
  PLAYER_CONFIGS,
};

export const GAME_CONFIG = Object.freeze({
  title: "寿数回战",
  version: "0.22.0",
  stageLabel: "联机 N6 · 断线重连",
  shareApiBase: "",
  logicalWidth: 1280,
  logicalHeight: 720,
  fixedTimeStep: 1 / 60,
  maxFrameDelta: 0.25,
  maxUpdatesPerFrame: 8,
  debugRefreshRate: 8,
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
