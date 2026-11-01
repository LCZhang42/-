import { defineCharacter, REQUIRED_EXPRESSION_IDS, validateCharacterCatalog } from "./CharacterDefinition.js";

export const DOLL_EXPRESSIONS = Object.freeze({
  neutral: "麻木", focus: "用力", shock: "震惊",
  shout: "喊话", triumph: "看淡生死", hurt: "五官错位",
});

export const STANDARD_POSES = Object.freeze([
  Object.freeze({
    id: "deadpan", name: "门口放空", lean: -0.03,
    leftUpperArm: 1.83, leftForearm: 1.66, rightUpperArm: 1.31, rightForearm: 1.47,
    leftThigh: 1.7, leftShin: 1.48, rightThigh: 1.42, rightShin: 1.63,
  }),
  Object.freeze({
    id: "hands-on-hips", name: "小区监察", lean: 0.055,
    leftUpperArm: 2.48, leftForearm: 0.68, rightUpperArm: 0.66, rightForearm: 2.45,
    leftThigh: 1.78, leftShin: 1.53, rightThigh: 1.34, rightShin: 1.6,
  }),
  Object.freeze({
    id: "wild", name: "铁丝发癫", lean: -0.11,
    leftUpperArm: -2.28, leftForearm: -1.55, rightUpperArm: 0.48, rightForearm: 1.18,
    leftThigh: 2.02, leftShin: 1.38, rightThigh: 1.16, rightShin: 1.83,
  }),
]);

const common = {
  assetCredit: "OpenAI built-in image generation · original A1 character",
  assetMetadataPath: "./assets/characters/manifest.json",
  expressions: REQUIRED_EXPRESSION_IDS,
  poses: STANDARD_POSES,
};

export const CHARACTER_CATALOG = Object.freeze([
  defineCharacter({
    ...common,
    id: "strolling-grandpa", slug: "grandpa", name: "遛弯大爷",
    tagline: "看透小区一切的门口哲学家",
    bio: "步子慢，眼神更慢。铁丝腰看似随时会折，关键时刻却能用最小动作把寿数原路退回。",
    conceptPath: "./assets/characters/grandpa/portrait.png",
    visual: { hairStyle: "sparse", outfit: "vest", faceStyle: "weary", torsoScale: 0.86 },
    palette: {
      skin: "#b8a17c", skinDark: "#78684f", thread: "#4c4335",
      shirt: "#d7d0bd", shirtShadow: "#8f897b", trousers: "#252c3d",
      trousersLight: "#41495e", shoes: "#15171a", hair: "#918f89",
    },
  }),
  defineCharacter({
    ...common,
    id: "thermos-uncle", slug: "uncle", name: "保温杯大叔",
    tagline: "保温杯不离手的资深指导员",
    bio: "擅长用皱眉和叹气制造压迫感。身体干瘪得像晒过头的豆角，训人时手臂却格外有劲。",
    conceptPath: "./assets/characters/uncle/portrait.png",
    visual: { hairStyle: "short", outfit: "polo", faceStyle: "stern", torsoScale: 0.95 },
    palette: {
      skin: "#b89c73", skinDark: "#715d45", thread: "#49392b",
      shirt: "#6d735b", shirtShadow: "#444a39", trousers: "#5b493c",
      trousersLight: "#776353", shoes: "#161719", hair: "#3f3b38",
    },
  }),
  defineCharacter({
    ...common,
    id: "dance-auntie", slug: "auntie", name: "广场舞大妈",
    tagline: "踩着重拍回寿的广场中心",
    bio: "每个关节都能拐向意想不到的方向。笑容越灿烂，下一声“妈妈”就越可能来得突然。",
    conceptPath: "./assets/characters/auntie/portrait.png",
    visual: { hairStyle: "curly", outfit: "floral", faceStyle: "confident", torsoScale: 0.94 },
    palette: {
      skin: "#c0a17b", skinDark: "#785c47", thread: "#58352e",
      shirt: "#b92f69", shirtShadow: "#701c42", trousers: "#242529",
      trousersLight: "#44454c", shoes: "#a92a32", hair: "#75213a",
    },
  }),
  defineCharacter({
    ...common,
    id: "market-sister", slug: "sister", name: "菜市场大姐",
    tagline: "一眼看穿斤两与借寿套路",
    bio: "围裙里装着无穷判断力。她不一定先动，但只要眉毛一挑，对面的寿来就已经显得心虚。",
    conceptPath: "./assets/characters/sister/portrait.png",
    visual: { hairStyle: "ponytail", outfit: "apron", faceStyle: "skeptical", torsoScale: 0.98 },
    palette: {
      skin: "#b79870", skinDark: "#72573f", thread: "#50362a",
      shirt: "#b57a28", shirtShadow: "#744819", trousers: "#303036",
      trousersLight: "#515159", shoes: "#17181b", hair: "#292527", apron: "#244e50",
    },
  }),
  defineCharacter({
    ...common,
    id: "flat-youth", slug: "slacker", name: "躺平青年",
    tagline: "能不站直就绝不站直",
    bio: "低电量表情、松垮四肢和神秘反射神经并存。看似已经放弃，其实只是等你先喊错。",
    conceptPath: "./assets/characters/slacker/portrait.png",
    visual: { hairStyle: "messy", outfit: "oversized", faceStyle: "sleepy", torsoScale: 1.03 },
    palette: {
      skin: "#b69a74", skinDark: "#705d49", thread: "#4d392e",
      shirt: "#817d77", shirtShadow: "#504d49", trousers: "#404452",
      trousersLight: "#656b7c", shoes: "#253d59", hair: "#2c292b",
    },
  }),
]);

const catalogErrors = validateCharacterCatalog(CHARACTER_CATALOG);
if (catalogErrors.length > 0) throw new Error(`角色目录无效：${catalogErrors.join("；")}`);

export const CHARACTER_BY_ID = new Map(CHARACTER_CATALOG.map((character) => [character.id, character]));
const CUSTOM_CHARACTER_BY_ID = new Map();
const CUSTOM_OBJECT_URLS = new Map();
export const GRANDPA_CHARACTER = CHARACTER_CATALOG[0];
export const GRANDPA_POSES = STANDARD_POSES;

export function getCharacter(id) {
  return CUSTOM_CHARACTER_BY_ID.get(id) ?? CHARACTER_BY_ID.get(id) ?? GRANDPA_CHARACTER;
}

export function getCharacterIndex(id) {
  const index = getAvailableCharacters().findIndex((character) => character.id === id);
  return index < 0 ? 0 : index;
}

export function getAvailableCharacters() {
  return [...CHARACTER_CATALOG, ...CUSTOM_CHARACTER_BY_ID.values()];
}

export function registerCustomCharacter(record) {
  if (!record?.id || !(record.imageBlob instanceof Blob)) throw new Error("自定义角色数据不完整");
  unregisterCustomCharacter(record.id);
  const conceptPath = URL.createObjectURL(record.imageBlob);
  CUSTOM_OBJECT_URLS.set(record.id, conceptPath);
  const character = Object.freeze({
    ...GRANDPA_CHARACTER,
    id: record.id,
    slug: record.id,
    name: record.name,
    tagline: record.mode === "jointed" ? "亲手标过关节的野生老鼠干" : "整片纸偶模式的野生老鼠干",
    bio: record.mode === "jointed"
      ? "图片只留在这个浏览器里。十三个关节点会跟随战斗 Pose 弯折，判定仍与所有角色完全相同。"
      : "图片只留在这个浏览器里。它会整体倾斜和弹动，无法拆分时也能照常参加寿数回战。",
    conceptPath,
    assetCredit: "玩家本地导入 · 未上传服务器",
    customAsset: Object.freeze({
      mode: record.mode,
      joints: Object.freeze({ ...record.joints }),
      width: record.width,
      height: record.height,
      imageBlob: record.imageBlob,
      lastPose: record.lastPose ? Object.freeze({ ...record.lastPose }) : null,
    }),
  });
  CUSTOM_CHARACTER_BY_ID.set(record.id, character);
  return character;
}

export function unregisterCustomCharacter(id) {
  const url = CUSTOM_OBJECT_URLS.get(id);
  if (url) URL.revokeObjectURL(url);
  CUSTOM_OBJECT_URLS.delete(id);
  return CUSTOM_CHARACTER_BY_ID.delete(id);
}

export function isCustomCharacter(id) {
  return CUSTOM_CHARACTER_BY_ID.has(id);
}

export function getCharacterPose(characterOrId, index = 0) {
  const character = typeof characterOrId === "string" ? getCharacter(characterOrId) : characterOrId;
  const normalized = ((Math.trunc(index) % character.poses.length) + character.poses.length)
    % character.poses.length;
  return character.poses[normalized];
}

export function getGrandpaPose(index = 0) {
  return getCharacterPose(GRANDPA_CHARACTER, index);
}
