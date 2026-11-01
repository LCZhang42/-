export const FALLEN_DOLL_POSE = Object.freeze({
  id: "fallen-rigid",
  name: "寿数耗尽",
  lean: 0.02,
  leftUpperArm: 1.62,
  leftForearm: 1.58,
  rightUpperArm: 1.52,
  rightForearm: 1.57,
  leftThigh: 1.56,
  leftShin: 1.57,
  rightThigh: 1.58,
  rightShin: 1.57,
});

const JOINT_KEYS = Object.freeze([
  "leftUpperArm", "leftForearm", "rightUpperArm", "rightForearm",
  "leftThigh", "leftShin", "rightThigh", "rightShin",
]);

const observedRoles = new WeakMap();
const observedRoleSwaps = new WeakMap();
const latestDolls = [null, null];

export function getLatestDollSnapshot() {
  if (!latestDolls[0] || !latestDolls[1]) return null;
  return {
    players: latestDolls.map((entry) => entry.player),
    customPoses: latestDolls.map((entry) => entry.pose),
    characterIds: latestDolls.map(
      (entry) => entry.player?.characterId ?? entry.player?.character?.id ?? "",
    ),
    poseIndexes: [0, 0],
  };
}

function includeObservedRoleSwap(player, scene, playerIndex) {
  if (!player || typeof player !== "object") return scene;

  const currentRole = player.role;
  const previousRole = observedRoles.get(player);
  if (previousRole && currentRole && previousRole !== currentRole) {
    observedRoleSwaps.set(player, performance.now() + 480);
  }
  if (currentRole) observedRoles.set(player, currentRole);

  const remaining = (observedRoleSwaps.get(player) ?? 0) - performance.now();
  if (remaining <= 0) {
    observedRoleSwaps.delete(player);
    return scene;
  }
  return { ...scene, roleSwapPulse: remaining / 1000, roleSwapIndex: playerIndex };
}

export function resolveDollAnimation(player, scene, playerIndex, pose) {
  latestDolls[playerIndex] = { player, pose };
  scene = includeObservedRoleSwap(player, scene, playerIndex);
  const time = Number(scene.time ?? 0);
  const facing = Math.sign(player.facingX || (player.id === "P1" ? 1 : -1));
  const lowEffects = Boolean(scene.lowEffects);
  const jointOffsets = Object.fromEntries(JOINT_KEYS.map((key) => [key, 0]));
  const animation = {
    kind: "idle",
    lean: 0,
    headX: 0,
    headY: 0,
    armSwing: 0,
    reach: 0,
    rotation: 0,
    jointOffsets,
  };

  const clothAmount = lowEffects ? 0.004 : 0.018;
  jointOffsets.leftForearm += Math.sin(time * 5.3 + playerIndex) * clothAmount;
  jointOffsets.rightForearm += Math.sin(time * 4.7 + 1.4 + playerIndex) * clothAmount;
  jointOffsets.leftShin += Math.sin(time * 4.1 + 0.5) * clothAmount * 0.6;
  jointOffsets.rightShin += Math.sin(time * 4.4 + 2.1) * clothAmount * 0.6;
  animation.headX = Math.sin(time * 2.1 + playerIndex) * (lowEffects ? 0.35 : 1.5);

  const outcome = scene.combat?.outcome;
  const isHit = scene.combat?.outcomeDisplayRemaining > 0 && outcome?.targetIndex === playerIndex;
  if (isHit) {
    animation.kind = "failure";
    animation.lean = -0.22 * facing;
    animation.headX = -8 * facing;
    animation.headY = 5;
    animation.rotation = -0.055 * facing;
    applyTargets(jointOffsets, pose, {
      leftUpperArm: 2.34, leftForearm: 2.08,
      rightUpperArm: 0.76, rightForearm: 1.08,
      leftThigh: 1.38, leftShin: 1.72,
      rightThigh: 1.76, rightShin: 1.42,
    }, 0.9);
    return animation;
  }

  if (scene.combat?.state === "REFLECT" && outcome?.sourceIndex === playerIndex) {
    const isMama = outcome.type === "bullReflect";
    animation.kind = isMama ? "mama" : "shou-hui";
    animation.lean = 0.12 * facing;
    animation.headY = -4;
    if (isMama) {
      applyTargets(jointOffsets, pose, {
        leftUpperArm: -2.28, leftForearm: -1.52,
        rightUpperArm: -0.86, rightForearm: -1.58,
        leftThigh: 1.82, rightThigh: 1.28,
      }, 0.94);
    } else {
      const targets = facing > 0
        ? { leftUpperArm: 0.34, leftForearm: 0.05, rightUpperArm: 0.06, rightForearm: -0.05 }
        : { leftUpperArm: 3.02, leftForearm: -3.08, rightUpperArm: 2.8, rightForearm: 3.05 };
      applyTargets(jointOffsets, pose, targets, 0.92);
    }
    return animation;
  }

  if (scene.combat?.state === "CALLOUT" && player.role === "attacker") {
    const isBull = scene.combat.attackKind === "bull";
    animation.kind = isBull ? "niu-lai" : "shou-lai";
    animation.lean = 0.18 * facing;
    animation.headX = 4 * facing;
    animation.headY = isBull ? 3 : -2;
    if (isBull) {
      const pulse = 0.9 + Math.sin(time * 24) * 0.08;
      applyTargets(jointOffsets, pose, {
        leftUpperArm: -2.34, leftForearm: -1.42,
        rightUpperArm: -0.8, rightForearm: -1.7,
        leftThigh: 1.95, rightThigh: 1.18,
      }, pulse);
    } else {
      const targets = facing > 0
        ? { rightUpperArm: 0.05, rightForearm: -0.04, leftUpperArm: 1.9, leftForearm: 1.2 }
        : { leftUpperArm: 3.08, leftForearm: -3.1, rightUpperArm: 1.24, rightForearm: 1.92 };
      applyTargets(jointOffsets, pose, targets, 0.9);
      animation.reach = 26;
    }
    return animation;
  }

  if (scene.roleSwapPulse > 0 && scene.roleSwapIndex === playerIndex) {
    const pulse = Math.min(1, scene.roleSwapPulse / 0.48);
    animation.kind = "role-swap";
    animation.lean = Math.sin(pulse * Math.PI * 2) * 0.16;
    animation.rotation = (1 - pulse) * 0.14 * facing;
    animation.headY = -Math.sin(pulse * Math.PI) * 7;
    applyTargets(jointOffsets, pose, {
      leftUpperArm: -2.42, leftForearm: -1.64,
      rightUpperArm: -0.72, rightForearm: -1.46,
    }, Math.sin(pulse * Math.PI) * 0.82);
    return animation;
  }

  if (player.isDashing) {
    animation.kind = "dash";
    animation.lean = 0.28 * facing;
    animation.headX = 9 * facing;
    animation.headY = 2;
    const targets = facing > 0
      ? {
          leftUpperArm: 2.86, leftForearm: 2.94,
          rightUpperArm: 2.72, rightForearm: 2.92,
          leftThigh: 2.1, leftShin: 1.1,
          rightThigh: 0.98, rightShin: 1.92,
        }
      : {
          leftUpperArm: 0.28, leftForearm: 0.2,
          rightUpperArm: 0.42, rightForearm: 0.2,
          leftThigh: 2.1, leftShin: 1.1,
          rightThigh: 0.98, rightShin: 1.92,
        };
    applyTargets(jointOffsets, pose, targets, 0.84);
    return animation;
  }

  if (scene.combat?.state === "REACTION_WINDOW" && player.role === "defender") {
    animation.kind = "reaction";
    animation.headY = -5;
    animation.lean = -0.07 * facing;
    return animation;
  }

  if (player.role === "attacker" && scene.lock?.isFocusing) {
    animation.kind = "focus";
    animation.lean = 0.13 * facing;
    animation.reach = 9 + (scene.lock.progress ?? 0) * 23;
  }
  return animation;
}

function applyTargets(offsets, pose, targets, weight) {
  const safeWeight = Math.max(0, Math.min(1, weight));
  for (const [key, target] of Object.entries(targets)) {
    if (!(key in offsets) || !Number.isFinite(pose?.[key])) continue;
    offsets[key] += shortestAngle(target - pose[key]) * safeWeight;
  }
}

function shortestAngle(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}
