import { GAME_CONFIG } from "../config.js";
import { CharacterShareClient } from "../sharing/CharacterShareClient.js";

const SHARE_OWNER_STORAGE_KEY = "shoushu-share-owners-v1";

export class CharacterShareDialog {
  constructor(elements, {
    customCharacters,
    getSelectedId,
    onImported = () => {},
    storage = globalThis.localStorage,
  }) {
    this.elements = elements;
    this.customCharacters = customCharacters;
    this.getSelectedId = getSelectedId;
    this.onImported = onImported;
    this.storage = storage;
    this.client = new CharacterShareClient({ baseUrl: GAME_CONFIG.shareApiBase, storage });
    this.fetchedShare = null;
    this.bind();
    this.syncEndpoint();
  }

  open(mode = "share") {
    this.elements.overlay.hidden = false;
    this.elements.sharePanel.hidden = mode !== "share";
    this.elements.receivePanel.hidden = mode === "share";
    this.elements.result.hidden = true;
    this.elements.preview.hidden = true;
    this.fetchedShare = null;
    this.setStatus(this.client.configured
      ? "分享采用未公开代码；只有主动拿到代码的人才能下载。"
      : "分享服务尚未配置。本地角色、Pose 和离线对局不受影响。", !this.client.configured);
  }

  close() { this.elements.overlay.hidden = true; }

  bind() {
    const e = this.elements;
    e.close.addEventListener("click", () => this.close());
    e.saveEndpoint.addEventListener("click", () => this.saveEndpoint());
    e.upload.addEventListener("click", () => this.upload());
    e.copy.addEventListener("click", () => this.copyCode());
    e.deleteShare.addEventListener("click", () => this.deleteLastShare());
    e.lookup.addEventListener("click", () => this.lookup());
    e.import.addEventListener("click", () => this.importFetched());
    e.report.addEventListener("click", () => this.reportFetched());
  }

  syncEndpoint() {
    this.elements.endpoint.value = this.client.baseUrl;
  }

  saveEndpoint() {
    try {
      this.client.setBaseUrl(this.elements.endpoint.value);
      this.syncEndpoint();
      this.setStatus(this.client.configured ? "分享服务地址已保存" : "已关闭在线分享；本地功能保持可用");
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  async upload() {
    const id = this.getSelectedId();
    const record = this.customCharacters.getRecord(id);
    if (!record) { this.setStatus("请先在选角页选中一个本地自定义角色", true); return; }
    this.elements.upload.disabled = true;
    this.setStatus("正在上传重新编码后的角色纹理和关节数据……");
    try {
      const result = await this.client.share(record, {
        rights: this.elements.rights.checked,
        minorSafety: this.elements.minorSafety.checked,
        privacy: this.elements.privacy.checked,
      });
      this.elements.result.hidden = false;
      this.elements.code.value = result.code;
      this.elements.resultState.textContent = result.status === "active" ? "未公开分享已建立" : "内容正在等待审核";
      this.rememberOwner(result.code, result.deleteToken ?? "");
      this.setStatus(result.status === "active"
        ? "分享成功。请只把代码发给你信任的人。"
        : "上传成功，但在审核完成前无法被其他人下载。");
    } catch (error) {
      this.setStatus(error.message, true);
    } finally {
      this.elements.upload.disabled = false;
    }
  }

  async lookup() {
    this.elements.lookup.disabled = true;
    this.elements.preview.hidden = true;
    this.setStatus("正在读取未公开角色……");
    try {
      const share = await this.client.fetchShare(this.elements.receiveCode.value);
      this.fetchedShare = share;
      this.elements.preview.hidden = false;
      this.elements.previewName.textContent = share.package.character.name;
      this.elements.previewMode.textContent = share.package.character.mode === "jointed" ? "13 点关节纸偶" : "整片纸偶";
      this.elements.previewImage.src = share.package.character.imageData;
      this.setStatus("只在你点击“保存到本地”后，角色才会进入此浏览器的 IndexedDB。再分享需重新确认权利声明。");
    } catch (error) {
      this.setStatus(error.message, true);
    } finally {
      this.elements.lookup.disabled = false;
    }
  }

  async importFetched() {
    if (!this.fetchedShare?.package) return;
    this.elements.import.disabled = true;
    try {
      const character = await this.customCharacters.importSharedPackage(this.fetchedShare.package);
      this.onImported(character);
      this.close();
    } catch (error) {
      this.setStatus(error.message, true);
    } finally {
      this.elements.import.disabled = false;
    }
  }

  async reportFetched() {
    if (!this.fetchedShare?.code) return;
    if (!confirm("提交举报后，该分享可能在达到阈值时自动隔离。确认提交？")) return;
    try {
      await this.client.report(this.fetchedShare.code, this.elements.reportReason.value);
      this.setStatus("举报已提交。为防止刷举报，同一访问者对同一角色只计一次。", false);
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  async copyCode() {
    const code = this.elements.code.value;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.setStatus("分享码已复制");
    } catch {
      this.elements.code.select();
      this.setStatus("无法自动复制，已选中分享码，请手动复制");
    }
  }

  async deleteLastShare() {
    const code = this.elements.code.value;
    if (!code || !confirm("删除云端分享？已经导入到其他设备的本地副本不会被远程删除。")) return;
    try {
      await this.client.deleteShare(code, this.readOwnerToken(code));
      this.forgetOwner(code);
      this.elements.result.hidden = true;
      this.setStatus("云端图片和分享记录已删除");
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  rememberOwner(code, token) {
    if (!token) return;
    try {
      const data = JSON.parse(this.storage?.getItem(SHARE_OWNER_STORAGE_KEY) ?? "{}");
      data[code] = token;
      this.storage?.setItem(SHARE_OWNER_STORAGE_KEY, JSON.stringify(data));
    } catch { /* signed-in owners can still delete without the local token */ }
  }

  readOwnerToken(code) {
    try { return JSON.parse(this.storage?.getItem(SHARE_OWNER_STORAGE_KEY) ?? "{}")[code] ?? ""; } catch { return ""; }
  }

  forgetOwner(code) {
    try {
      const data = JSON.parse(this.storage?.getItem(SHARE_OWNER_STORAGE_KEY) ?? "{}");
      delete data[code];
      this.storage?.setItem(SHARE_OWNER_STORAGE_KEY, JSON.stringify(data));
    } catch { /* no-op */ }
  }

  setStatus(message, error = false) {
    this.elements.status.textContent = message;
    this.elements.status.classList.toggle("is-error", error);
  }
}
