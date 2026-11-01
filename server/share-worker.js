const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const DAILY_UPLOADS = 5;
const DAILY_BYTES = 8 * 1024 * 1024;
const REPORT_THRESHOLD = 3;
const SHARE_TTL_DAYS = 30;
const JOINT_IDS = [
  "head", "leftShoulder", "leftElbow", "leftWrist", "rightShoulder", "rightElbow", "rightWrist",
  "leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle",
];
const REPORT_REASONS = new Set(["copyright", "portrait", "minor", "sexual", "violent", "hate", "spam", "other"]);

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      return json({ error: error?.message ?? "分享服务内部错误" }, error?.status ?? 500, request, env);
    }
  },
};

export function normalizeShareId(value) {
  const id = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{8,32}$/.test(id)) throw httpError(400, "分享码格式无效");
  return id;
}

export function validateSharePayload(body) {
  if (!body?.declarations?.rights || !body?.declarations?.privacy || !body?.declarations?.minorSafety) {
    throw httpError(400, "必须确认版权、肖像权、未成年人和隐私声明");
  }
  const pkg = body.package;
  if (pkg?.format !== "shoushu-custom-character" || pkg.version !== 1) throw httpError(400, "角色包格式无效");
  const character = pkg.character ?? {};
  const name = String(character.name ?? "").trim().slice(0, 18);
  if (!name) throw httpError(400, "角色名不能为空");
  const mode = character.mode === "jointed" ? "jointed" : "paper";
  if (mode === "jointed") {
    for (const id of JOINT_IDS) {
      const point = character.joints?.[id];
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
        throw httpError(400, `关节点 ${id} 无效`);
      }
    }
  }
  const match = String(character.imageData ?? "").match(/^data:image\/(png|webp);base64,([a-z0-9+/=]+)$/i);
  if (!match) throw httpError(400, "图片必须是 PNG 或 WebP");
  const bytes = decodeBase64(match[2]);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) throw httpError(413, "分享图片不能超过 2 MB");
  const mime = `image/${match[1].toLowerCase()}`;
  if (!hasValidMagic(bytes, mime)) throw httpError(400, "图片内容与文件格式不匹配");
  return {
    package: {
      format: pkg.format,
      version: 1,
      character: {
        id: String(character.id ?? "shared"),
        name,
        mode,
        joints: mode === "jointed" ? character.joints : {},
        lastPose: sanitizePose(character.lastPose),
      },
    },
    imageBytes: bytes,
    imageMime: mime,
  };
}

export function normalizeReportReason(value) {
  const reason = String(value ?? "");
  if (!REPORT_REASONS.has(reason)) throw httpError(400, "举报原因无效");
  return reason;
}

async function route(request, env) {
  if (!env.DB || !env.BUCKET) throw httpError(503, "分享服务尚未绑定 D1 / R2");
  if (!originAllowed(request, env)) throw httpError(403, "当前网页来源未获准访问分享服务");
  if (request.method === "OPTIONS") return corsResponse(request, env);
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, service: "shoushu-character-share", version: 1 }, 200, request, env);
  }
  if (url.pathname === "/api/shares" && request.method === "POST") return createShare(request, env);
  if (parts[0] === "api" && parts[1] === "shares" && parts[2]) {
    const id = normalizeShareId(parts[2]);
    if (parts.length === 3 && request.method === "GET") return getShare(request, env, id);
    if (parts.length === 3 && request.method === "DELETE") return deleteShare(request, env, id);
    if (parts[3] === "reports" && request.method === "POST") return reportShare(request, env, id);
  }
  if (parts[0] === "api" && parts[1] === "admin" && parts[2] === "shares" && parts[3] && parts[4] === "status" && request.method === "POST") {
    return moderateShare(request, env, normalizeShareId(parts[3]));
  }
  throw httpError(404, "接口不存在");
}

async function createShare(request, env) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw httpError(413, "上传内容过大");
  const identity = await requestIdentity(request, env, { requireUser: env.ALLOW_ANONYMOUS_UPLOADS !== "true" });
  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_BYTES * 1.4) throw httpError(413, "上传内容过大");
  let body;
  try { body = JSON.parse(bodyText); } catch { throw httpError(400, "请求 JSON 无效"); }
  const validated = validateSharePayload(body);
  const now = Date.now();
  const since = now - 24 * 60 * 60 * 1000;
  const quota = await env.DB.prepare(
    "SELECT COUNT(*) AS count, COALESCE(SUM(image_bytes), 0) AS bytes FROM character_shares WHERE owner_id = ? AND created_at >= ? AND status != 'deleted'",
  ).bind(identity.ownerId, since).first();
  if (Number(quota?.count) >= DAILY_UPLOADS || Number(quota?.bytes) + validated.imageBytes.byteLength > DAILY_BYTES) {
    throw httpError(429, "今日分享配额已用完，请明天再试");
  }
  const id = randomCode();
  const deleteToken = randomToken();
  const deleteHash = await sha256(deleteToken);
  const imageKey = `characters/${id}.${validated.imageMime === "image/png" ? "png" : "webp"}`;
  const status = identity.authenticated ? "active" : "quarantined";
  await env.BUCKET.put(imageKey, validated.imageBytes, {
    httpMetadata: { contentType: validated.imageMime, cacheControl: "private, max-age=3600" },
    customMetadata: { shareId: id },
  });
  try {
    await env.DB.prepare(
      "INSERT INTO character_shares (id, owner_id, name, mode, joints_json, pose_json, image_key, image_type, image_bytes, status, delete_token_hash, rights_confirmed, minor_confirmed, report_count, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?)",
    ).bind(
      id, identity.ownerId, validated.package.character.name, validated.package.character.mode,
      JSON.stringify(validated.package.character.joints), JSON.stringify(validated.package.character.lastPose),
      imageKey, validated.imageMime, validated.imageBytes.byteLength, status, deleteHash,
      now, now + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).run();
  } catch (error) {
    await env.BUCKET.delete(imageKey);
    throw error;
  }
  return json({ code: id, status, deleteToken, expiresAt: now + SHARE_TTL_DAYS * 86400000 }, 201, request, env);
}

async function getShare(request, env, id) {
  const row = await env.DB.prepare("SELECT * FROM character_shares WHERE id = ?").bind(id).first();
  if (!row || row.status === "deleted") throw httpError(404, "分享不存在或已删除");
  if (row.status !== "active") throw httpError(423, "该分享正在审核或已被隔离");
  if (Number(row.expires_at) <= Date.now()) throw httpError(410, "分享已经过期");
  const object = await env.BUCKET.get(row.image_key);
  if (!object) throw httpError(404, "分享图片已丢失");
  const bytes = new Uint8Array(await object.arrayBuffer());
  const pkg = {
    format: "shoushu-custom-character",
    version: 1,
    character: {
      id: `shared-${id}`,
      name: row.name,
      mode: row.mode,
      joints: parseJson(row.joints_json, {}),
      lastPose: parseJson(row.pose_json, null),
      imageData: `data:${row.image_type};base64,${encodeBase64(bytes)}`,
    },
  };
  return json({ code: id, package: pkg, expiresAt: Number(row.expires_at) }, 200, request, env);
}

async function deleteShare(request, env, id) {
  const row = await env.DB.prepare("SELECT owner_id, image_key, delete_token_hash, status FROM character_shares WHERE id = ?").bind(id).first();
  if (!row || row.status === "deleted") throw httpError(404, "分享不存在或已删除");
  const identity = await requestIdentity(request, env, { requireUser: false });
  const token = request.headers.get("x-delete-token") ?? "";
  const tokenMatches = token && await sha256(token) === row.delete_token_hash;
  if (identity.ownerId !== row.owner_id && !tokenMatches) throw httpError(403, "只有上传者可以删除这个分享");
  await env.BUCKET.delete(row.image_key);
  await env.DB.prepare("UPDATE character_shares SET status = 'deleted', deleted_at = ? WHERE id = ?").bind(Date.now(), id).run();
  return json({ deleted: true }, 200, request, env);
}

async function reportShare(request, env, id) {
  const row = await env.DB.prepare("SELECT status, report_count FROM character_shares WHERE id = ?").bind(id).first();
  if (!row || row.status === "deleted") throw httpError(404, "分享不存在或已删除");
  const reason = normalizeReportReason((await readJson(request)).reason);
  const reporter = await requestIdentity(request, env, { requireUser: false });
  const reportId = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO character_reports (id, share_id, reporter_hash, reason, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(reportId, id, reporter.ownerId, reason, Date.now()).run();
  } catch {
    return json({ accepted: true, duplicate: true }, 200, request, env);
  }
  const count = Number(row.report_count) + 1;
  const status = count >= REPORT_THRESHOLD ? "quarantined" : row.status;
  await env.DB.prepare("UPDATE character_shares SET report_count = ?, status = ? WHERE id = ?").bind(count, status, id).run();
  return json({ accepted: true, status }, 201, request, env);
}

async function moderateShare(request, env, id) {
  if (!env.MODERATOR_TOKEN || request.headers.get("authorization") !== `Bearer ${env.MODERATOR_TOKEN}`) {
    throw httpError(403, "管理员凭证无效");
  }
  const { status } = await readJson(request);
  if (!["active", "quarantined", "deleted"].includes(status)) throw httpError(400, "审核状态无效");
  const row = await env.DB.prepare("SELECT image_key FROM character_shares WHERE id = ?").bind(id).first();
  if (!row) throw httpError(404, "分享不存在");
  if (status === "deleted") await env.BUCKET.delete(row.image_key);
  await env.DB.prepare("UPDATE character_shares SET status = ?, moderated_at = ? WHERE id = ?").bind(status, Date.now(), id).run();
  return json({ code: id, status }, 200, request, env);
}

async function requestIdentity(request, env, { requireUser }) {
  const userId = request.headers.get("oai-authenticated-user-id");
  if (userId) return { authenticated: true, ownerId: `user:${userId}` };
  if (requireUser) throw httpError(401, "请先登录后再分享角色");
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return { authenticated: false, ownerId: `anon:${await sha256(`${ip}:${env.IP_HASH_SALT ?? "local"}`)}` };
}

function originAllowed(request, env) {
  const allowed = String(env.SHARE_ORIGIN ?? "").trim();
  const origin = request.headers.get("origin");
  return !allowed || !origin || origin === allowed;
}

function corsResponse(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = String(env.SHARE_ORIGIN ?? "").trim();
  return {
    "Access-Control-Allow-Origin": allowed || origin || "null",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, X-Delete-Token, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(request, env) },
  });
}

async function readJson(request) {
  try { return await request.json(); } catch { throw httpError(400, "请求 JSON 无效"); }
}

function sanitizePose(pose) {
  if (!pose || typeof pose !== "object") return null;
  const keys = ["lean", "leftUpperArm", "leftForearm", "rightUpperArm", "rightForearm", "leftThigh", "leftShin", "rightThigh", "rightShin"];
  const clean = { id: "shared", name: "分享 Pose" };
  for (const key of keys) {
    const value = Number(pose[key]);
    if (!Number.isFinite(value) || Math.abs(value) > Math.PI) return null;
    clean[key] = value;
  }
  return clean;
}

function hasValidMagic(bytes, mime) {
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function decodeBase64(value) {
  let binary;
  try { binary = atob(value); } catch { throw httpError(400, "图片 Base64 已损坏"); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(bytes) {
  let result = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    result += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(result);
}

function randomCode() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return encodeBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
