import {
  CUSTOM_CHARACTER_LIMITS,
  CUSTOM_JOINT_IDS,
  CUSTOM_JOINT_LABELS,
  CustomCharacterStore,
  createCustomCharacterId,
  exportPackageToRecord,
  processCharacterImage,
  recordToExportPackage,
  validateImageFile,
} from "../characters/CustomCharacterStore.js";
import {
  registerCustomCharacter,
  unregisterCustomCharacter,
} from "../characters/CharacterCatalog.js";

export class CustomCharacterImport {
  constructor(elements, { onCatalogChanged = () => {}, onSaved = () => {} } = {}) {
    this.elements = elements;
    this.onCatalogChanged = onCatalogChanged;
    this.onSaved = onSaved;
    this.store = new CustomCharacterStore();
    this.records = new Map();
    this.sourceFile = null;
    this.bitmap = null;
    this.joints = {};
    this.activeJointIndex = 0;
    this.transform = { zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 };
    this.mode = "jointed";
    this.bind();
  }

  async init() {
    try {
      const records = await this.store.list();
      const failedIds = [];
      let restored = 0;
      for (const record of records) {
        try {
          const bitmap = await createImageBitmap(record.imageBlob);
          bitmap.close?.();
          this.register(record);
          restored += 1;
        } catch {
          failedIds.push(record.id);
        }
      }
      this.onCatalogChanged({ failedIds });
      this.setStatus(failedIds.length
        ? `${restored} 个角色已恢复；${failedIds.length} 个损坏角色已回退为默认大爷`
        : restored ? `已恢复 ${restored} 个本地角色` : "本地角色仓库已就绪");
    } catch (error) {
      this.setStatus(error.message, true);
    }
  }

  open() {
    this.elements.overlay.hidden = false;
    this.resetDraft();
    this.draw();
    this.elements.file.focus();
  }

  close() {
    this.elements.overlay.hidden = true;
  }

  async delete(id) {
    const record = this.records.get(id);
    if (!record) return false;
    if (!confirm(`彻底删除“${record.name}”？图片、缩略图和关节数据都会从此浏览器移除。`)) return false;
    await this.store.delete(id);
    this.records.delete(id);
    unregisterCustomCharacter(id);
    this.onCatalogChanged({ deletedId: id });
    this.setStatus(`已彻底删除 ${record.name}`);
    return true;
  }

  async export(id) {
    const record = this.records.get(id) ?? await this.store.get(id);
    if (!record) throw new Error("找不到要导出的本地角色");
    const text = await recordToExportPackage(record);
    downloadBlob(new Blob([text], { type: "application/json" }), `${safeName(record.name)}.shoushu.json`);
  }

  async savePose(id, pose) {
    const saved = await this.store.savePose(id, pose);
    if (!saved) return false;
    const updated = await this.store.get(id);
    if (updated) this.register(updated);
    return true;
  }

  bind() {
    const e = this.elements;
    e.close.addEventListener("click", () => this.close());
    e.file.addEventListener("change", () => this.loadFile(e.file.files?.[0]));
    e.importPackage.addEventListener("change", () => this.importPackage(e.importPackage.files?.[0]));
    e.zoom.addEventListener("input", () => { this.transform.zoom = Number(e.zoom.value); this.draw(); });
    e.rotation.addEventListener("input", () => { this.transform.rotation = Number(e.rotation.value); this.draw(); });
    e.offsetX.addEventListener("input", () => { this.transform.offsetX = Number(e.offsetX.value); this.draw(); });
    e.offsetY.addEventListener("input", () => { this.transform.offsetY = Number(e.offsetY.value); this.draw(); });
    for (const input of e.mode) input.addEventListener("change", () => {
      this.mode = input.value === "paper" ? "paper" : "jointed";
      e.jointGuide.hidden = this.mode === "paper";
      this.draw();
    });
    e.canvas.addEventListener("pointerdown", (event) => this.markJoint(event));
    e.undoJoint.addEventListener("click", () => this.undoJoint());
    e.resetJoints.addEventListener("click", () => { this.joints = {}; this.activeJointIndex = 0; this.renderJointGuide(); this.draw(); });
    e.save.addEventListener("click", () => this.save());
  }

  resetDraft() {
    this.sourceFile = null;
    this.bitmap?.close?.();
    this.bitmap = null;
    this.joints = {};
    this.activeJointIndex = 0;
    this.transform = { zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 };
    this.mode = "jointed";
    this.elements.file.value = "";
    this.elements.name.value = "";
    this.elements.zoom.value = "1";
    this.elements.rotation.value = "0";
    this.elements.offsetX.value = "0";
    this.elements.offsetY.value = "0";
    this.elements.mode[0].checked = true;
    this.elements.jointGuide.hidden = false;
    this.renderJointGuide();
    this.setStatus("选择一张透明 PNG/WebP；图片不会上传服务器");
  }

  async loadFile(file) {
    const errors = validateImageFile(file);
    if (errors.length) { this.setStatus(errors.join("；"), true); return; }
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > CUSTOM_CHARACTER_LIMITS.maxDecodeDimension || bitmap.height > CUSTOM_CHARACTER_LIMITS.maxDecodeDimension) {
        bitmap.close?.();
        throw new Error(`图片边长不能超过 ${CUSTOM_CHARACTER_LIMITS.maxDecodeDimension} 像素`);
      }
      this.bitmap?.close?.();
      this.bitmap = bitmap;
      this.sourceFile = file;
      this.joints = {};
      this.activeJointIndex = 0;
      this.elements.name.value = file.name.replace(/\.(png|webp)$/i, "").slice(0, 18);
      this.renderJointGuide();
      this.draw();
      this.setStatus(`${bitmap.width} × ${bitmap.height} · ${(file.size / 1024).toFixed(0)} KB · 已在本地解码`);
    } catch (error) {
      this.setStatus(error.message ?? "图片无法读取", true);
    }
  }

  markJoint(event) {
    if (!this.bitmap || this.mode !== "jointed" || this.activeJointIndex >= CUSTOM_JOINT_IDS.length) return;
    const rect = this.elements.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const id = CUSTOM_JOINT_IDS[this.activeJointIndex];
    this.joints[id] = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    this.activeJointIndex += 1;
    this.renderJointGuide();
    this.draw();
  }

  undoJoint() {
    if (this.activeJointIndex <= 0) return;
    this.activeJointIndex -= 1;
    delete this.joints[CUSTOM_JOINT_IDS[this.activeJointIndex]];
    this.renderJointGuide();
    this.draw();
  }

  renderJointGuide() {
    const next = CUSTOM_JOINT_IDS[this.activeJointIndex];
    this.elements.jointName.textContent = next
      ? `${this.activeJointIndex + 1} / ${CUSTOM_JOINT_IDS.length} · ${CUSTOM_JOINT_LABELS[next]}`
      : "13 / 13 · 标注完成";
    this.elements.jointList.replaceChildren(...CUSTOM_JOINT_IDS.map((id, index) => {
      const chip = document.createElement("span");
      chip.textContent = CUSTOM_JOINT_LABELS[id];
      chip.className = index < this.activeJointIndex ? "is-done" : index === this.activeJointIndex ? "is-active" : "";
      return chip;
    }));
  }

  draw() {
    const canvas = this.elements.canvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTransparencyGrid(ctx, canvas.width, canvas.height);
    if (!this.bitmap) {
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.font = "700 16px Microsoft YaHei UI";
      ctx.textAlign = "center";
      ctx.fillText("等待一具野生老鼠干……", canvas.width / 2, canvas.height / 2);
      return;
    }
    drawTransformedBitmap(ctx, canvas, this.bitmap, this.transform);
    if (this.mode === "jointed") this.drawJointMarkers(ctx);
  }

  drawJointMarkers(ctx) {
    const canvas = this.elements.canvas;
    ctx.save();
    ctx.font = "700 10px Microsoft YaHei UI";
    for (const [index, id] of CUSTOM_JOINT_IDS.entries()) {
      const point = this.joints[id];
      if (!point) continue;
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      ctx.fillStyle = "#f6df71";
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#15130c"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#111"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(index + 1), x, y + 0.5);
    }
    ctx.restore();
  }

  async save() {
    if (!this.sourceFile) { this.setStatus("请先选择图片", true); return; }
    if (this.mode === "jointed" && this.activeJointIndex !== CUSTOM_JOINT_IDS.length) {
      this.setStatus("请标完 13 个关节点，或者切换到整片纸偶模式", true);
      return;
    }
    this.elements.save.disabled = true;
    this.setStatus("正在去除元数据、压缩并写入本地仓库……");
    try {
      const processed = await processCharacterImage(this.sourceFile, this.transform);
      const record = await this.store.put({
        id: createCustomCharacterId(),
        name: this.elements.name.value,
        mode: this.mode,
        joints: this.joints,
        imageBlob: processed.blob,
        width: processed.width,
        height: processed.height,
        createdAt: Date.now(),
      });
      const character = this.register(record);
      this.onCatalogChanged({ addedId: record.id });
      this.onSaved(character);
      this.close();
    } catch (error) {
      this.setStatus(error.message ?? "保存失败，可能是浏览器内存或空间不足", true);
    } finally {
      this.elements.save.disabled = false;
    }
  }

  async importPackage(file) {
    if (!file) return;
    try {
      if (file.size > CUSTOM_CHARACTER_LIMITS.maxFileBytes * 1.5) throw new Error("角色包过大");
      const record = await exportPackageToRecord(await file.text());
      const saved = await this.store.put(record);
      const character = this.register(saved);
      this.onCatalogChanged({ addedId: saved.id });
      this.onSaved(character);
      this.close();
    } catch (error) {
      this.setStatus(error.message ?? "角色包导入失败", true);
    } finally {
      this.elements.importPackage.value = "";
    }
  }

  register(record) {
    this.records.set(record.id, record);
    return registerCustomCharacter(record);
  }

  setStatus(message, isError = false) {
    this.elements.status.textContent = message;
    this.elements.status.classList.toggle("is-error", isError);
  }
}

function drawTransparencyGrid(ctx, width, height) {
  ctx.fillStyle = "#181a1f"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#22252b";
  const size = 20;
  for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) {
    if ((x / size + y / size) % 2 === 0) ctx.fillRect(x, y, size, size);
  }
}

function drawTransformedBitmap(ctx, canvas, bitmap, transform) {
  const fit = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height) * 0.84;
  ctx.save();
  ctx.translate(
    canvas.width / 2 + transform.offsetX * canvas.width * 0.42,
    canvas.height / 2 + transform.offsetY * canvas.height * 0.42,
  );
  ctx.rotate(transform.rotation * Math.PI / 180);
  ctx.scale(fit * transform.zoom, fit * transform.zoom);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  ctx.restore();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeName(value) {
  return String(value).replace(/[\\/:*?"<>|]/g, "-").slice(0, 40) || "custom-doll";
}
