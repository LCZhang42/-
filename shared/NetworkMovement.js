import { ARENA_CONFIG, MOVEMENT_CONFIG } from "./BalanceConfig.js";

const EPSILON = 0.0001;

export const NETWORK_TICK_RATE = 60;
export const NETWORK_INTERPOLATION_DELAY = 100;
export const NETWORK_CORRECTION_SMOOTH_MS = 65;

export function applyNetworkInput(player, input, deltaTime) {
  if (!player || !Number.isFinite(deltaTime) || deltaTime <= 0) return;

  const direction = normalizeAxis(input?.moveX, input?.moveY);
  player.velocityX = direction.x * MOVEMENT_CONFIG.moveSpeed;
  player.velocityY = direction.y * MOVEMENT_CONFIG.moveSpeed;
  player.x += player.velocityX * deltaTime;
  player.y += player.velocityY * deltaTime;
  constrainNetworkPlayer(player);
}

export function constrainNetworkPlayer(player) {
  const radius = MOVEMENT_CONFIG.playerRadius;
  const bounds = ARENA_CONFIG.bounds;
  player.x = clamp(player.x, bounds.left + radius, bounds.right - radius);
  player.y = clamp(player.y, bounds.top + radius, bounds.bottom - radius);

  for (const obstacle of ARENA_CONFIG.obstacles) {
    if (obstacle.type !== "circle") continue;
    const dx = player.x - obstacle.x;
    const dy = player.y - obstacle.y;
    const minimumDistance = radius + obstacle.radius;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared >= minimumDistance * minimumDistance) continue;

    let normalX = 1;
    let normalY = 0;
    let distance = 0;
    if (distanceSquared > EPSILON) {
      distance = Math.sqrt(distanceSquared);
      normalX = dx / distance;
      normalY = dy / distance;
    }
    const correction = minimumDistance - distance;
    player.x += normalX * correction;
    player.y += normalY * correction;
  }

  player.x = clamp(player.x, bounds.left + radius, bounds.right - radius);
  player.y = clamp(player.y, bounds.top + radius, bounds.bottom - radius);
}

export function resolveNetworkWorld(players) {
  const list = Array.from(players ?? []);
  for (let pass = 0; pass < MOVEMENT_CONFIG.collisionPasses; pass += 1) {
    for (const player of list) constrainNetworkPlayer(player);
    if (list.length >= 2) resolveNetworkPlayerPair(list[0], list[1]);
  }
  for (const player of list) constrainNetworkPlayer(player);
}

export function resolveNetworkPlayerPair(first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimumDistance = MOVEMENT_CONFIG.playerRadius * 2;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared >= minimumDistance * minimumDistance) return false;

  let normalX = 1;
  let normalY = 0;
  let distance = 0;
  if (distanceSquared > EPSILON) {
    distance = Math.sqrt(distanceSquared);
    normalX = dx / distance;
    normalY = dy / distance;
  }

  const correction = (minimumDistance - distance) / 2;
  first.x -= normalX * correction;
  first.y -= normalY * correction;
  second.x += normalX * correction;
  second.y += normalY * correction;
  return true;
}

function normalizeAxis(rawX, rawY) {
  const x = clamp(Number.isFinite(Number(rawX)) ? Number(rawX) : 0, -1, 1);
  const y = clamp(Number.isFinite(Number(rawY)) ? Number(rawY) : 0, -1, 1);
  const length = Math.hypot(x, y);
  if (length <= EPSILON) return { x: 0, y: 0 };
  return { x: x / Math.max(1, length), y: y / Math.max(1, length) };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
