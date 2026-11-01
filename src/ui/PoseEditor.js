import { STANDARD_POSES, getCharacter } from "../characters/CharacterCatalog.js";
import {
  EDITABLE_JOINTS,
  adjustPoseJoint,
  clonePose,
  deletePoseSlot,
  getCharacterPoseRecord,
  mirrorPose,
  randomizePose,
  readPoseLibrary,
  savePoseSlot,
  setLastUsedPose,
  setPoseJointAngle,
  writePoseLibrary,
} from "../characters/PoseEditorModel.js";
import { DollRenderer } from "../rendering/DollRenderer.js";
import { resolveDollSkeleton } from "../rendering/Skeleton2D.js";

export class PoseEditor {
  constructor(elements, { storage = globalThis.localStorage, onComplete = () => {} } = {}) {
    this.elements = elements;
    this.storage = storage;
    this.onComplete = onComplete;
    this.library = readPoseLibrary(storage);
    this.dollRenderer = new DollRenderer();
    this.currentPose = clonePose(STANDARD_POSES[0]);
    this.basePose = clonePose(STANDARD_POSES[0]);
    this.characterId = null;
    this.playerIndex = 0;
    this.selectedJointId = "leftElbow";
    this.selectedSlotIndex = 0;
    this.draggingJointId = null;
    this.pendingOverwrite = null;
    this.pendingDelete = null;
    this.bindControls();
    this.buildStaticControls();
  }

  open({ characterId, playerIndex }) {
    this.characterId = characterId;
    this.playerIndex = playerIndex;
    const record = getCharacterPoseRecord(this.library, characterId);
    this.currentPose = clonePose(record.lastPose ?? getCharacter(characterId).customAsset?.lastPose ?? STANDARD_POSES[0]);
    this.basePose = clonePose(this.currentPose);
    this.selectedSlotIndex = Math.max(0, record.slots.findIndex((slot) => !slot));
    this.pendingOverwrite = null;
    this.pendingDelete = null;
    this.elements.overlay.hidden = false;
    this.elements.title.textContent = `P${playerIndex + 1} · ${getCharacter(characterId).name}`;
    this.elements.subtitle.textContent = playerIndex === 0
      ? "先把铁丝掰成你喜欢的样子"
      : "键盘交给 P2，再摆一具";
    this.setStatus("拖动发光关节，或选中关节后按方向键微调");
    this.render();
    this.elements.canvas.focus();
  }

  close() {
    this.draggingJointId = null;
    this.elements.overlay.hidden = true;
  }

  deleteCharacterData(characterId) {
    if (!characterId || !this.library[characterId]) return;
    delete this.library[characterId];
    writePoseLibrary(this.storage, this.library);
  }

  bindControls() {
    const e = this.elements;
    e.mirror.addEventListener("click", () => {
      this.currentPose = mirrorPose(this.currentPose);
      this.setStatus("已左右镜像");
      this.render();
    });
    e.reset.addEventListener("click", () => {
      this.currentPose = clonePose(this.basePose);
      this.setStatus("已重置到进入编辑时的 Pose");
      this.render();
    });
    e.random.addEventListener("click", () => {
      this.currentPose = randomizePose();
      this.setStatus("随机发癫完成，所有关节仍在安全范围内");
      this.render();
    });
    e.save.addEventListener("click", () => this.saveSelectedSlot());
    e.remove.addEventListener("click", () => this.deleteSelectedSlot());
    e.use.addEventListener("click", () => {
      const pose = setLastUsedPose(this.library, this.characterId, this.currentPose);
      writePoseLibrary(this.storage, this.library);
      this.close();
      this.onComplete({ pose: clonePose(pose), skipped: false });
    });
    e.skip.addEventListener("click", () => {
      const record = getCharacterPoseRecord(this.library, this.characterId);
      const pose = clonePose(record.lastPose ?? STANDARD_POSES[0]);
      this.close();
      this.onComplete({ pose, skipped: true });
    });
    e.canvas.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    e.canvas.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    e.canvas.addEventListener("pointerup", () => this.finishDrag());
    e.canvas.addEventListener("pointercancel", () => this.finishDrag());
    e.overlay.addEventListener("keydown", (event) => this.handleKeyDown(event));
  }

  buildStaticControls() {
    this.elements.joints.replaceChildren(...EDITABLE_JOINTS.map((joint) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.jointId = joint.id;
      button.textContent = joint.label;
      button.addEventListener("click", () => {
        this.selectedJointId = joint.id;
        this.setStatus(`${joint.label}已选中 · 方向键微调`);
        this.render();
        this.elements.canvas.focus();
      });
      return button;
    }));

    this.elements.presets.replaceChildren(...STANDARD_POSES.map((pose, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.presetIndex = String(index);
      button.innerHTML = `<b>${index + 1}</b><span>${pose.name}</span>`;
      button.addEventListener("click", () => {
        this.currentPose = clonePose(pose);
        this.basePose = clonePose(pose);
        this.setStatus(`已套用安全预设：${pose.name}`);
        this.render();
      });
      return button;
    }));
  }

  render() {
    if (!this.characterId) return;
    this.renderCanvas();
    this.renderJointButtons();
    this.renderSlots();
    this.elements.poseName.textContent = this.currentPose.name;
  }

  renderCanvas() {
    const canvas = this.elements.canvas;
    const ctx = canvas.getContext("2d");
    const character = getCharacter(this.characterId);
    const player = {
      id: "P1", x: canvas.width / 2, y: canvas.height - 52,
      velocityX: 0, velocityY: 0, role: "attacker", facingX: 1,
      isLockImmune: false, isDashing: false, color: "#ff754e", radius: 34,
    };
    const scene = {
      players: [player], characterIds: [character.id], customPoses: [this.currentPose],
      poseIndexes: [0], grandpaPoseIndex: 0, time: 0, lowEffects: true,
      debugVisible: false, flashesEnabled: false,
      lock: { isFocusing: false, progress: 0 },
      combat: { outcome: null, outcomeDisplayRemaining: 0, state: "IDLE" },
    };
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawGrid(ctx, canvas.width, canvas.height, character.palette.shirt);
    this.dollRenderer.draw(ctx, player, scene, { drawOffsetY: -92 });
    this.drawJointHandles(ctx, player);
  }

  drawGrid(ctx, width, height, color) {
    ctx.save();
    ctx.fillStyle = "#080a0e";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.045)";
    ctx.lineWidth = 1;
    for (let x = 20; x < width; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 20; y < height; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width * 0.55);
    gradient.addColorStop(0, `${color}2c`);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawJointHandles(ctx, player) {
    const skeleton = resolveDollSkeleton(this.currentPose);
    ctx.save();
    ctx.translate(player.x, player.y - 92);
    ctx.scale(0.9, 0.9);
    for (const joint of EDITABLE_JOINTS) {
      const point = skeleton[joint.point];
      const selected = joint.id === this.selectedJointId;
      ctx.beginPath();
      ctx.arc(point.x, point.y, selected ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = selected ? "#ffe277" : "rgba(255,255,255,.86)";
      ctx.fill();
      ctx.strokeStyle = selected ? "#ff704b" : "rgba(10,12,16,.9)";
      ctx.lineWidth = selected ? 4 : 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  renderJointButtons() {
    for (const button of this.elements.joints.querySelectorAll("button")) {
      button.classList.toggle("is-selected", button.dataset.jointId === this.selectedJointId);
    }
  }

  renderSlots() {
    const record = getCharacterPoseRecord(this.library, this.characterId);
    this.elements.slots.replaceChildren(...record.slots.map((slot, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.slotIndex = String(index);
      button.className = index === this.selectedSlotIndex ? "is-selected" : "";
      const label = slot ? slot.pose.name : "空槽位";
      button.innerHTML = `<b>${index + 1}</b><span>${label}</span>`;
      button.addEventListener("click", () => {
        this.selectedSlotIndex = index;
        this.pendingOverwrite = null;
        this.pendingDelete = null;
        if (slot) {
          this.currentPose = clonePose(slot.pose);
          this.basePose = clonePose(slot.pose);
          this.setStatus(`已载入槽位 ${index + 1}`);
        } else {
          this.setStatus(`槽位 ${index + 1} 为空，可保存当前 Pose`);
        }
        this.render();
      });
      return button;
    }));
    const occupied = Boolean(record.slots[this.selectedSlotIndex]);
    this.elements.save.textContent = occupied && this.pendingOverwrite === this.selectedSlotIndex
      ? "再次点击确认覆盖"
      : occupied ? "覆盖此槽位" : "保存到此槽位";
    this.elements.remove.disabled = !occupied;
    this.elements.remove.textContent = occupied && this.pendingDelete === this.selectedSlotIndex
      ? "再次点击确认删除"
      : "删除槽位";
  }

  saveSelectedSlot() {
    const record = getCharacterPoseRecord(this.library, this.characterId);
    const occupied = Boolean(record.slots[this.selectedSlotIndex]);
    if (occupied && this.pendingOverwrite !== this.selectedSlotIndex) {
      this.pendingOverwrite = this.selectedSlotIndex;
      this.pendingDelete = null;
      this.setStatus("这个槽位已有 Pose，再点一次确认覆盖");
      this.renderSlots();
      return;
    }
    savePoseSlot(this.library, this.characterId, this.selectedSlotIndex, this.currentPose);
    writePoseLibrary(this.storage, this.library);
    this.currentPose = clonePose(getCharacterPoseRecord(this.library, this.characterId).slots[this.selectedSlotIndex].pose);
    this.basePose = clonePose(this.currentPose);
    this.pendingOverwrite = null;
    this.setStatus(`已保存到槽位 ${this.selectedSlotIndex + 1}`);
    this.render();
  }

  deleteSelectedSlot() {
    const record = getCharacterPoseRecord(this.library, this.characterId);
    if (!record.slots[this.selectedSlotIndex]) return;
    if (this.pendingDelete !== this.selectedSlotIndex) {
      this.pendingDelete = this.selectedSlotIndex;
      this.pendingOverwrite = null;
      this.setStatus("删除后无法恢复，再点一次确认删除");
      this.renderSlots();
      return;
    }
    deletePoseSlot(this.library, this.characterId, this.selectedSlotIndex);
    writePoseLibrary(this.storage, this.library);
    this.pendingDelete = null;
    this.setStatus(`槽位 ${this.selectedSlotIndex + 1} 已删除`);
    this.renderSlots();
  }

  handleKeyDown(event) {
    if (this.elements.overlay.hidden || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const step = event.shiftKey ? 0.012 : 0.04;
    this.currentPose = adjustPoseJoint(this.currentPose, this.selectedJointId, direction * step);
    this.setStatus(`${EDITABLE_JOINTS.find((joint) => joint.id === this.selectedJointId)?.label} · ${event.shiftKey ? "精细" : "普通"}微调`);
    this.render();
  }

  handlePointerDown(event) {
    const point = this.eventToCanvasPoint(event);
    const skeleton = resolveDollSkeleton(this.currentPose);
    const local = this.canvasPointToSkeleton(point);
    let best = null;
    for (const joint of EDITABLE_JOINTS) {
      const target = skeleton[joint.point];
      const distance = Math.hypot(local.x - target.x, local.y - target.y);
      if (!best || distance < best.distance) best = { joint, distance };
    }
    if (!best || best.distance > 22) return;
    this.selectedJointId = best.joint.id;
    this.draggingJointId = best.joint.id;
    this.elements.canvas.setPointerCapture?.(event.pointerId);
    this.updatePoseFromPointer(point);
  }

  handlePointerMove(event) {
    if (!this.draggingJointId) return;
    this.updatePoseFromPointer(this.eventToCanvasPoint(event));
  }

  finishDrag() {
    if (!this.draggingJointId) return;
    this.setStatus(`${EDITABLE_JOINTS.find((joint) => joint.id === this.draggingJointId)?.label}调整完成`);
    this.draggingJointId = null;
  }

  updatePoseFromPointer(canvasPoint) {
    const joint = EDITABLE_JOINTS.find((candidate) => candidate.id === this.draggingJointId);
    if (!joint) return;
    const skeleton = resolveDollSkeleton(this.currentPose);
    const point = this.canvasPointToSkeleton(canvasPoint);
    if (joint.id === "lean") {
      const lean = Math.asin(Math.max(-0.34, Math.min(0.34, point.x / 55)));
      this.currentPose = setPoseJointAngle(this.currentPose, joint.id, lean);
    } else {
      const origin = skeleton[joint.origin];
      this.currentPose = setPoseJointAngle(
        this.currentPose,
        joint.id,
        Math.atan2(point.y - origin.y, point.x - origin.x),
      );
    }
    this.render();
  }

  eventToCanvasPoint(event) {
    const rect = this.elements.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.elements.canvas.width / rect.width,
      y: (event.clientY - rect.top) * this.elements.canvas.height / rect.height,
    };
  }

  canvasPointToSkeleton(point) {
    return {
      x: (point.x - this.elements.canvas.width / 2) / 0.9,
      y: (point.y - (this.elements.canvas.height - 52 - 92)) / 0.9,
    };
  }

  setStatus(message) {
    this.elements.status.textContent = message;
  }
}
