const EPSILON = 0.0001;

export class Arena {
  constructor(config) {
    this.bounds = config.bounds;
    this.obstacles = config.obstacles;
  }

  constrainPlayer(player) {
    const radius = player.radius;
    player.x = clamp(player.x, this.bounds.left + radius, this.bounds.right - radius);
    player.y = clamp(player.y, this.bounds.top + radius, this.bounds.bottom - radius);

    for (const obstacle of this.obstacles) {
      if (obstacle.type === "circle") {
        resolveCircleObstacle(player, obstacle);
      }
    }

    player.x = clamp(player.x, this.bounds.left + radius, this.bounds.right - radius);
    player.y = clamp(player.y, this.bounds.top + radius, this.bounds.bottom - radius);
  }

  hasLineOfSight(from, to) {
    return !this.obstacles.some((obstacle) => {
      if (obstacle.type !== "circle") return false;
      return segmentIntersectsCircle(from, to, obstacle);
    });
  }
}

export function resolvePlayerPair(first, second) {
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const minimumDistance = first.radius + second.radius;
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

export function resolveCircleObstacle(player, obstacle) {
  const dx = player.x - obstacle.x;
  const dy = player.y - obstacle.y;
  const minimumDistance = player.radius + obstacle.radius;
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

  const correction = minimumDistance - distance;
  player.x += normalX * correction;
  player.y += normalY * correction;
  return true;
}

export function segmentIntersectsCircle(from, to, circle) {
  const segmentX = to.x - from.x;
  const segmentY = to.y - from.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (lengthSquared <= EPSILON) {
    return squaredDistance(from, circle) <= circle.radius * circle.radius;
  }

  const projection = clamp(
    ((circle.x - from.x) * segmentX + (circle.y - from.y) * segmentY) /
      lengthSquared,
    0,
    1,
  );
  const closest = {
    x: from.x + segmentX * projection,
    y: from.y + segmentY * projection,
  };
  return squaredDistance(closest, circle) <= circle.radius * circle.radius;
}

function squaredDistance(first, second) {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
