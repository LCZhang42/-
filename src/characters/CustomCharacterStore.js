export const CUSTOM_CHARACTER_LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxDecodeDimension: 4096,
  textureWidth: 768,
  textureHeight: 1024,
  maxStoredBytes: 24 * 1024 * 1024,
});

export const CUSTOM_JOINT_IDS = Object.freeze([
  "head",
  "leftShoulder", "leftElbow", "leftWrist",
  "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle",
  "rightHip", "rightKnee", "rightAnkle",
]);

export const CUSTOM_JOINT_LABELS = Object.freeze({
  head: "头顶中心",
  leftShoulder: "画面左肩", leftElbow: "画面左肘", leftWrist: "画面左腕",
  rightShoulder: "画面右肩", rightElbow: "画面右肘", rightWrist: "画面右腕",
  leftHip: "画面左胯", leftKnee: "画面左膝", leftAnkle: "画面左踝",
  rightHip: "画面右胯", rightKnee: "画面右膝", rightAnkle: "画面右踝",
});

const DB_NAME = "shoushu-custom-characters";
const DB_VERSION = 1;
const STORE_NAME = "characters";
const PACKAGE_VERSION = 1;

export function validateImageFile(file, limits = CUSTOM_CHARACTER_LIMITS) {
  if (!file) return ["请选择 PNG 或 WebP 图片"];
  const errors = [];
  if (!["image/png", "image/webp"].includes(file.type)) errors.push("只支持 PNG / WebP");
  if (!Number.isFinite(file.size) || file.size <= 0) errors.push("图片文件为空或已损坏");
  if (file.size > limits.maxFileBytes) errors.push(`原图不能超过 ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB`);
  return errors;
}

export function normalizeCustomRecord(record) {
  if (!record || typeof record !== "object") throw new Error("自定义角色数据无效");
  const id = String(record.id ?? "");
  if (!/^custom-[a-z0-9-]{6,}$/i.test(id)) throw new Error("自定义角色 ID 无效");
  const name = String(record.name ?? "").trim().slice(0, 18);
  if (!name) throw new Error("请给老鼠干起个名字");
  const mode = record.mode === "jointed" ? "jointed" : "paper";
  const joints = {};
  for (const jointId of CUSTOM_JOINT_IDS) {
    const point = record.joints?.[jointId];
    if (!point) continue;
    const x = Number(point.x);
    const y = Number(point.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      joints[jointId] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }
  }
  if (mode === "jointed" && Object.keys(joints).length !== CUSTOM_JOINT_IDS.length) {
    throw new Error("关节模式需要标完 13 个关节点");
  }
  if (!(record.imageBlob instanceof Blob)) throw new Error("自定义角色缺少图片");
  if (!["image/png", "image/webp"].includes(record.imageBlob.type)) throw new Error("角色纹理格式无效");
  return {
    ...record,
    id,
    name,
    mode,
    joints,
    width: CUSTOM_CHARACTER_LIMITS.textureWidth,
    height: CUSTOM_CHARACTER_LIMITS.textureHeight,
    bytes: record.imageBlob.size,
    updatedAt: Number(record.updatedAt) || Date.now(),
    createdAt: Number(record.createdAt) || Date.now(),
  };
}

export async function processCharacterImage(file, transform = {}, limits = CUSTOM_CHARACTER_LIMITS) {
  const errors = validateImageFile(file, limits);
  if (errors.length) throw new Error(errors.join("；"));
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("图片无法解码，可能已经损坏");
  }
  try {
    if (bitmap.width > limits.maxDecodeDimension || bitmap.height > limits.maxDecodeDimension) {
      throw new Error(`图片边长不能超过 ${limits.maxDecodeDimension} 像素`);
    }
    const canvas = document.createElement("canvas");
    canvas.width = limits.textureWidth;
    canvas.height = limits.textureHeight;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("浏览器无法创建图片处理画布");
    const fit = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height) * 0.84;
    const zoom = Math.max(0.35, Math.min(2.4, Number(transform.zoom) || 1));
    const rotation = Math.max(-180, Math.min(180, Number(transform.rotation) || 0)) * Math.PI / 180;
    const offsetX = Math.max(-1, Math.min(1, Number(transform.offsetX) || 0)) * canvas.width * 0.42;
    const offsetY = Math.max(-1, Math.min(1, Number(transform.offsetY) || 0)) * canvas.height * 0.42;
    ctx.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
    ctx.rotate(rotation);
    ctx.scale(fit * zoom, fit * zoom);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片压缩失败")), "image/webp", 0.88);
    });
    return { blob, width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close?.();
  }
}

export function createCustomCharacterId(random = Math.random) {
  const stamp = Date.now().toString(36);
  const tail = Math.floor(random() * 0xffffff).toString(36).padStart(5, "0");
  return `custom-${stamp}-${tail}`;
}

export async function recordToExportPackage(record) {
  const normalized = normalizeCustomRecord(record);
  const imageData = await blobToDataUrl(normalized.imageBlob);
  return JSON.stringify({
    format: "shoushu-custom-character",
    version: PACKAGE_VERSION,
    character: {
      id: normalized.id,
      name: normalized.name,
      mode: normalized.mode,
      joints: normalized.joints,
      lastPose: normalized.lastPose ?? null,
      imageData,
      createdAt: normalized.createdAt,
    },
  }, null, 2);
}

export async function exportPackageToRecord(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("导入包不是有效 JSON"); }
  if (data?.format !== "shoushu-custom-character" || data.version !== PACKAGE_VERSION) {
    throw new Error("不是受支持的寿数回战角色包");
  }
  const character = data.character ?? {};
  const imageBlob = dataUrlToBlob(character.imageData);
  return normalizeCustomRecord({
    ...character,
    id: createCustomCharacterId(),
    name: `${String(character.name ?? "自定义老鼠干").slice(0, 14)}·导入`,
    imageBlob,
    updatedAt: Date.now(),
  });
}

export class CustomCharacterStore {
  constructor({ indexedDB = globalThis.indexedDB } = {}) {
    this.indexedDB = indexedDB;
    this.databasePromise = null;
  }

  async list() {
    const db = await this.open();
    return requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll());
  }

  async put(record) {
    const normalized = normalizeCustomRecord(record);
    const existing = await this.list();
    const usedBytes = existing.reduce((sum, item) => sum + (item.id === normalized.id ? 0 : Number(item.bytes) || 0), 0);
    if (usedBytes + normalized.bytes > CUSTOM_CHARACTER_LIMITS.maxStoredBytes) {
      throw new Error(`自定义角色总占用不能超过 ${Math.round(CUSTOM_CHARACTER_LIMITS.maxStoredBytes / 1024 / 1024)} MB`);
    }
    const db = await this.open();
    await transactionDone(db.transaction(STORE_NAME, "readwrite"), (store) => store.put(normalized));
    return normalized;
  }

  async delete(id) {
    const db = await this.open();
    await transactionDone(db.transaction(STORE_NAME, "readwrite"), (store) => store.delete(id));
  }

  async get(id) {
    const db = await this.open();
    return requestResult(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id));
  }

  async savePose(id, pose) {
    const record = await this.get(id);
    if (!record) return false;
    await this.put({ ...record, lastPose: pose ? { ...pose } : null, updatedAt: Date.now() });
    return true;
  }

  async open() {
    if (!this.indexedDB) throw new Error("当前浏览器不支持 IndexedDB，无法保存自定义角色");
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("无法打开本地角色仓库"));
      request.onblocked = () => reject(new Error("角色仓库被另一个页面占用，请关闭其他游戏标签页"));
    });
    return this.databasePromise;
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("本地存储操作失败"));
  });
}

function transactionDone(transaction, operation) {
  return new Promise((resolve, reject) => {
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地存储写入失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地存储写入被取消"));
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法导出角色图片"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !/^data:image\/(png|webp);base64,/i.test(dataUrl)) {
    throw new Error("角色包图片格式无效");
  }
  const [header, payload] = dataUrl.split(",", 2);
  const mime = header.match(/^data:([^;]+)/i)?.[1] ?? "image/webp";
  let binary;
  try { binary = atob(payload); } catch { throw new Error("角色包图片已损坏"); }
  if (binary.length > CUSTOM_CHARACTER_LIMITS.maxFileBytes) throw new Error("角色包图片过大");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}
