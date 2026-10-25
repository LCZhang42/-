export const REQUIRED_EXPRESSION_IDS = Object.freeze([
  "neutral", "focus", "shock", "shout", "triumph", "hurt",
]);

const REQUIRED_PALETTE_KEYS = Object.freeze([
  "skin", "skinDark", "thread", "shirt", "shirtShadow",
  "trousers", "trousersLight", "shoes", "hair",
]);

const REQUIRED_POSE_KEYS = Object.freeze([
  "id", "name", "lean", "leftUpperArm", "leftForearm", "rightUpperArm",
  "rightForearm", "leftThigh", "leftShin", "rightThigh", "rightShin",
]);

export function validateCharacterDefinition(character) {
  const errors = [];
  if (!character || typeof character !== "object") return ["角色定义必须是对象"];
  if (!character.id) errors.push("缺少 id");
  if (!character.slug) errors.push("缺少 slug");
  if (!character.name) errors.push("缺少 name");
  if (!character.conceptPath) errors.push("缺少 conceptPath");
  if (!character.assetMetadataPath) errors.push("缺少 assetMetadataPath");
  for (const key of REQUIRED_PALETTE_KEYS) {
    if (!character.palette?.[key]) errors.push(`palette 缺少 ${key}`);
  }
  if (!Array.isArray(character.expressions)) {
    errors.push("expressions 必须是数组");
  } else {
    for (const expression of REQUIRED_EXPRESSION_IDS) {
      if (!character.expressions.includes(expression)) errors.push(`缺少表情 ${expression}`);
    }
  }
  if (!Array.isArray(character.poses) || character.poses.length < 3) {
    errors.push("至少需要 3 个 Pose");
  } else {
    character.poses.forEach((pose, index) => {
      for (const key of REQUIRED_POSE_KEYS) {
        const value = pose?.[key];
        if (value === undefined || value === null || value === "") {
          errors.push(`Pose ${index + 1} 缺少 ${key}`);
        }
      }
    });
  }
  return errors;
}

export function defineCharacter(character) {
  const errors = validateCharacterDefinition(character);
  if (errors.length > 0) {
    throw new Error(`角色 ${character?.id ?? "unknown"} 定义无效：${errors.join("；")}`);
  }
  return deepFreeze(character);
}

export function validateCharacterCatalog(catalog) {
  const errors = [];
  const ids = new Set();
  const slugs = new Set();
  for (const character of catalog) {
    for (const error of validateCharacterDefinition(character)) errors.push(`${character?.id ?? "unknown"}: ${error}`);
    if (ids.has(character.id)) errors.push(`重复角色 id：${character.id}`);
    if (slugs.has(character.slug)) errors.push(`重复角色 slug：${character.slug}`);
    ids.add(character.id);
    slugs.add(character.slug);
  }
  return errors;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
