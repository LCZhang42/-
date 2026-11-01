import { recordToExportPackage } from "../characters/CustomCharacterStore.js";

export const SHARE_API_STORAGE_KEY = "shoushu-share-api-v1";

export function normalizeShareApiBase(value) {
  const text = String(value ?? "").trim().replace(/\/+$/, "");
  if (!text) return "";
  let url;
  try { url = new URL(text); } catch { throw new Error("分享服务地址无效"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("分享服务必须使用 HTTPS；本机调试可使用 HTTP localhost");
  }
  return url.toString().replace(/\/$/, "");
}

export function normalizeShareCode(value) {
  const code = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{8,32}$/.test(code)) throw new Error("分享码格式无效");
  return code;
}

export class CharacterShareClient {
  constructor({ baseUrl = "", storage = globalThis.localStorage, fetch = globalThis.fetch } = {}) {
    this.storage = storage;
    this.fetch = fetch;
    this.baseUrl = this.readSavedBase() || normalizeShareApiBase(baseUrl);
  }

  get configured() { return Boolean(this.baseUrl && this.fetch); }

  setBaseUrl(value) {
    this.baseUrl = normalizeShareApiBase(value);
    try {
      if (this.baseUrl) this.storage?.setItem(SHARE_API_STORAGE_KEY, this.baseUrl);
      else this.storage?.removeItem(SHARE_API_STORAGE_KEY);
    } catch {
      // The endpoint still works for this tab when storage is disabled.
    }
    return this.baseUrl;
  }

  async health() {
    return this.request("/api/health", { method: "GET" });
  }

  async share(record, declarations) {
    if (!declarations?.rights || !declarations?.privacy || !declarations?.minorSafety) {
      throw new Error("请先确认版权、肖像权、未成年人和隐私声明");
    }
    const packageData = JSON.parse(await recordToExportPackage(record));
    return this.request("/api/shares", {
      method: "POST",
      body: JSON.stringify({
        package: packageData,
        declarations: { rights: true, privacy: true, minorSafety: true },
      }),
    });
  }

  async fetchShare(code) {
    return this.request(`/api/shares/${encodeURIComponent(normalizeShareCode(code))}`, { method: "GET" });
  }

  async report(code, reason) {
    const allowed = new Set(["copyright", "portrait", "minor", "sexual", "violent", "hate", "spam", "other"]);
    if (!allowed.has(reason)) throw new Error("请选择举报原因");
    return this.request(`/api/shares/${encodeURIComponent(normalizeShareCode(code))}/reports`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async deleteShare(code, deleteToken = "") {
    const headers = deleteToken ? { "X-Delete-Token": deleteToken } : {};
    return this.request(`/api/shares/${encodeURIComponent(normalizeShareCode(code))}`, {
      method: "DELETE",
      headers,
    });
  }

  async request(path, options) {
    if (!this.configured) throw new Error("尚未配置在线分享服务；本地角色功能仍可正常使用");
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        credentials: "include",
        ...options,
        headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
      });
    } catch {
      throw new Error("无法连接分享服务；请检查网络或继续使用本地角色");
    }
    let data = null;
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error(data?.error ?? `分享服务返回 ${response.status}`);
    return data;
  }

  readSavedBase() {
    try { return normalizeShareApiBase(this.storage?.getItem(SHARE_API_STORAGE_KEY) ?? ""); } catch { return ""; }
  }
}
