import { STANDARD_POSES } from "./CharacterCatalog.js";

export const POSE_LIBRARY_STORAGE_KEY = "shoushu-pose-library-v1";
export const MAX_POSE_SLOTS = 3;

export const EDITABLE_JOINTS = Object.freeze([
  Object.freeze({ id: "lean", label: "躯干倾斜", key: "lean", min: -0.35, max: 0.35, point: "chest", origin: "hips" }),
  Object.freeze({ id: "leftElbow", label: "左肩", key: "leftUpperArm", min: -2.9, max: 2.9, point: "leftElbow", origin: "leftShoulder" }),
  Object.freeze({ id: "leftWrist", label: "左肘", key: "leftForearm", min: -2.9, max: 2.9, point: "leftWrist", origin: "leftElbow" }),
  Object.freeze({ id: "rightElbow", label: "右肩", key: "rightUpperArm", min: -2.9, max: 2.9, point: "rightElbow", origin: "rightShoulder" }),
  Object.freeze({ id: "rightWrist", label: "右肘", key: "rightForearm", min: -2.9, max: 2.9, point: "rightWrist", origin: "rightElbow" }),
  Object.freeze({ id: "leftKnee", label: "左胯", key: "leftThigh", min: 0.45, max: 2.7, point: "leftKnee", origin: "leftHip" }),
  Object.freeze({ id: "leftAnkle", label: "左膝", key: "leftShin", min: 0.45, max: 2.7, point: "leftAnkle", origin: "leftKnee" }),
  Object.freeze({ id: "rightKnee", label: "右胯", key: "rightThigh", min: 0.45, max: 2.7, point: "rightKnee", origin: "rightHip" }),
  Object.freeze({ id: "rightAnkle", label: "右膝", key: "rightShin", min: 0.45, max: 2.7, point: "rightAnkle", origin: "rightKnee" }),
]);

const JOINT_BY_ID = new Map(EDITABLE_JOINTS.map((joint) => [joint.id, joint]));

export function clonePose(pose = STANDARD_POSES[0]) {
  return {
    id: pose.id ?? "custom",
    name: pose.name ?? "自定义 Pose",
    lean: Number(pose.lean),
    leftUpperArm: Number(pose.leftUpperArm),
    leftForearm: Number(pose.leftForearm),
    rightUpperArm: Number(pose.rightUpperArm),
    rightForearm: Number(pose.rightForearm),
    leftThigh: Number(pose.leftThigh),
    leftShin: Number(pose.leftShin),
    rightThigh: Number(pose.rightThigh),
    rightShin: Number(pose.rightShin),
  };
}

export function sanitizePose(pose, fallback = STANDARD_POSES[0]) {
  const next = clonePose(fallback);
  next.id = typeof pose?.id === "string" ? pose.id : "custom";
  next.name = typeof pose?.name === "string" ? pose.name : "自定义 Pose";
  for (const joint of EDITABLE_JOINTS) {
    const value = Number(pose?.[joint.key]);
    next[joint.key] = clamp(Number.isFinite(value) ? value : next[joint.key], joint.min, joint.max);
  }
  return next;
}

export function adjustPoseJoint(pose, jointId, delta) {
  const joint = JOINT_BY_ID.get(jointId);
  if (!joint) return sanitizePose(pose);
  const next = sanitizePose(pose);
  next.id = "custom";
  next.name = "自定义 Pose";
  next[joint.key] = clamp(next[joint.key] + Number(delta || 0), joint.min, joint.max);
  return next;
}

export function setPoseJointAngle(pose, jointId, angle) {
  const joint = JOINT_BY_ID.get(jointId);
  if (!joint) return sanitizePose(pose);
  const next = sanitizePose(pose);
  next.id = "custom";
  next.name = "自定义 Pose";
  next[joint.key] = clamp(normalizeAngle(Number(angle)), joint.min, joint.max);
  return next;
}

export function mirrorPose(pose) {
  const source = sanitizePose(pose);
  const mirrorAngle = (angle) => normalizeAngle(Math.PI - angle);
  return sanitizePose({
    ...source,
    id: "custom",
    name: "镜像 Pose",
    lean: -source.lean,
    leftUpperArm: mirrorAngle(source.rightUpperArm),
    leftForearm: mirrorAngle(source.rightForearm),
    rightUpperArm: mirrorAngle(source.leftUpperArm),
    rightForearm: mirrorAngle(source.leftForearm),
    leftThigh: mirrorAngle(source.rightThigh),
    leftShin: mirrorAngle(source.rightShin),
    rightThigh: mirrorAngle(source.leftThigh),
    rightShin: mirrorAngle(source.leftShin),
  });
}

export function randomizePose(random = Math.random) {
  const pose = clonePose(STANDARD_POSES[0]);
  pose.id = "custom";
  pose.name = "随机发癫";
  for (const joint of EDITABLE_JOINTS) {
    const margin = (joint.max - joint.min) * 0.12;
    pose[joint.key] = joint.min + margin + random() * (joint.max - joint.min - margin * 2);
  }
  return sanitizePose(pose);
}

export function readPoseLibrary(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(POSE_LIBRARY_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writePoseLibrary(storage, library) {
  try {
    storage?.setItem(POSE_LIBRARY_STORAGE_KEY, JSON.stringify(library));
    return true;
  } catch {
    return false;
  }
}

export function getCharacterPoseRecord(library, characterId) {
  const raw = library?.[characterId];
  const slots = Array.from({ length: MAX_POSE_SLOTS }, (_, index) => {
    const slot = raw?.slots?.[index];
    return slot?.pose ? { ...slot, pose: sanitizePose(slot.pose) } : null;
  });
  return {
    slots,
    lastPose: raw?.lastPose ? sanitizePose(raw.lastPose) : null,
  };
}

export function savePoseSlot(library, characterId, slotIndex, pose, now = Date.now()) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_POSE_SLOTS) return false;
  const record = getCharacterPoseRecord(library, characterId);
  const savedPose = sanitizePose({ ...pose, id: `saved-${slotIndex + 1}`, name: `自存 Pose ${slotIndex + 1}` });
  record.slots[slotIndex] = { pose: savedPose, updatedAt: now };
  record.lastPose = clonePose(savedPose);
  library[characterId] = record;
  return true;
}

export function deletePoseSlot(library, characterId, slotIndex) {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_POSE_SLOTS) return false;
  const record = getCharacterPoseRecord(library, characterId);
  if (!record.slots[slotIndex]) return false;
  record.slots[slotIndex] = null;
  library[characterId] = record;
  return true;
}

export function setLastUsedPose(library, characterId, pose) {
  const record = getCharacterPoseRecord(library, characterId);
  record.lastPose = sanitizePose(pose);
  library[characterId] = record;
  return record.lastPose;
}

function normalizeAngle(angle) {
  if (!Number.isFinite(angle)) return 0;
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
