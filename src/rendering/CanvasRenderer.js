import { VisualEffectsPool } from "./VisualEffectsPool.js";
import { DollRenderer } from "./DollRenderer.js";

const PLAYER_DRAW_OFFSET_Y = -92;

export class CanvasRenderer {
  constructor(canvas, { width, height }) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("当前浏览器无法创建 Canvas 2D 上下文。");
    }

    this.canvas = canvas;
    this.context = context;
    this.width = width;
    this.height = height;
    this.displaySize = { width: 0, height: 0 };
    this.effects = new VisualEffectsPool();
    this.dollRenderer = new DollRenderer();
    this.lastSceneTime = 0;
    this.lastOutcome = null;
    this.lastAttackerIndex = null;
    this.roleSwapRemaining = 0;
    this.roleSwapFromIndex = null;
    this.roleSwapToIndex = null;
  }

  resizeDisplayMetrics() {
    const rect = this.canvas.getBoundingClientRect();
    this.displaySize.width = Math.round(rect.width);
    this.displaySize.height = Math.round(rect.height);
  }

  render(scene) {
    const ctx = this.context;
    const { width, height } = this;
    const deltaTime = Math.min(0.05, Math.max(0, scene.time - this.lastSceneTime));
    this.lastSceneTime = scene.time;
    this.updateEffects(scene, deltaTime);

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    const impactStrength = scene.combat.outcomeDisplayRemaining > 0
      ? Math.min(1, scene.combat.outcomeDisplayRemaining * 2.2)
      : 0;
    const zoom = scene.lowEffects ? 1 : 1 + impactStrength * 0.025;
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-width / 2, -height / 2);
    if (!scene.lowEffects && scene.combat.hitStopRemaining > 0) {
      const shake = Math.sin(scene.time * 190) * 7;
      ctx.translate(shake, -shake * 0.45);
    }

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, "#23242a");
    background.addColorStop(0.58, "#181a1f");
    background.addColorStop(1, "#0d0f12");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    this.drawBackdrop(ctx, scene.time, scene.lowEffects);
    this.drawArena(ctx);
    this.drawCenterMark(ctx);
    this.drawAttackCone(ctx, scene.attacker, scene.lock);
    this.drawLineOfSightCue(ctx, scene);
    if (scene.debugVisible) {
      this.drawLockDebug(ctx, [scene.attacker, scene.defender], scene.lock);
    }
    this.drawObstacles(ctx, scene.arena.obstacles);

    const playersByDepth = [...scene.players].sort((first, second) => first.y - second.y);
    for (const player of playersByDepth) {
      this.drawPlayer(ctx, player, scene);
    }

    this.drawLockFrame(ctx, scene.defender, scene.lock, scene.time);
    this.drawLockResult(ctx, scene.lock);
    this.effects.draw(ctx);
    this.drawCombatEffects(ctx, scene);
    this.drawRoleSwapSweep(ctx, scene);

    this.drawVignette(ctx);
    ctx.restore();
  }

  updateEffects(scene, deltaTime) {
    this.effects.setLowEffects(scene.lowEffects);
    this.effects.update(deltaTime);
    this.roleSwapRemaining = Math.max(0, this.roleSwapRemaining - deltaTime);

    if (scene.combat.outcome && scene.combat.outcome !== this.lastOutcome) {
      const outcome = scene.combat.outcome;
      const source = scene.players[outcome.sourceIndex];
      const target = scene.players[outcome.targetIndex];
      const color = outcome.attackKind === "bull"
        ? "#d9ef70"
        : outcome.type === "reflect" || outcome.type === "perfect"
          ? "#ffe36c"
          : "#ff6f52";
      this.effects.spawnImpact({
        x: target.x,
        y: target.y - 62 + PLAYER_DRAW_OFFSET_Y,
        color,
        direction: Math.sign(target.x - source.x) || 1,
        intensity: outcome.type === "perfect" ? 1.35 : 1,
      });
    }

    if (
      scene.combat.state !== "ROUND_START" &&
      this.lastAttackerIndex !== null &&
      scene.combat.attackerIndex !== this.lastAttackerIndex
    ) {
      this.roleSwapRemaining = 0.62;
      this.roleSwapFromIndex = this.lastAttackerIndex;
      this.roleSwapToIndex = scene.combat.attackerIndex;
    }

    if (scene.combat.state === "ROUND_START" && this.lastOutcome) {
      this.effects.clear();
    }
    if (scene.combat.state === "ROUND_START") this.roleSwapRemaining = 0;
    this.lastOutcome = scene.combat.outcome;
    this.lastAttackerIndex = scene.combat.attackerIndex;
  }

  get effectCount() {
    return this.effects.activeCount;
  }

  drawBackdrop(ctx, time, lowEffects) {
    ctx.save();
    ctx.globalAlpha = 0.88;

    const haze = ctx.createLinearGradient(0, 64, 0, 430);
    haze.addColorStop(0, "#33323a");
    haze.addColorStop(1, "#202127");
    ctx.fillStyle = haze;
    ctx.fillRect(45, 92, 290, 338);
    ctx.fillRect(350, 62, 258, 368);
    ctx.fillRect(672, 90, 226, 340);
    ctx.fillRect(922, 45, 315, 385);

    ctx.fillStyle = "rgba(246, 202, 112, 0.2)";
    for (let building = 0; building < 4; building += 1) {
      const baseX = [45, 350, 672, 922][building];
      const columns = building % 2 === 0 ? 4 : 3;
      for (let row = 0; row < 4; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const shimmer = lowEffects ? 0.76 : 0.72 + Math.sin(time * 0.6 + row + column) * 0.08;
          ctx.globalAlpha = shimmer * 0.32;
          const x = baseX + 25 + column * 61;
          const y = 126 + row * 64;
          ctx.fillRect(x, y, 31, 23);
          ctx.fillStyle = "rgba(15, 16, 20, 0.42)";
          ctx.fillRect(x - 5, y + 28, 42, 5);
          ctx.fillStyle = "rgba(246, 202, 112, 0.2)";
        }
      }
    }

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = "#34353b";
    ctx.fillRect(80, 360, 195, 70);
    ctx.fillRect(968, 350, 205, 80);
    ctx.fillStyle = "#b9ab82";
    ctx.font = "700 17px 'Microsoft YaHei UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("便 民 活 动 室", 177, 395);
    ctx.fillText("幸 福 小 区", 1070, 386);

    ctx.strokeStyle = "rgba(218, 216, 203, 0.48)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(110, 184); ctx.lineTo(285, 208);
    ctx.moveTo(1000, 174); ctx.lineTo(1185, 144);
    ctx.stroke();
    for (let index = 0; index < 6; index += 1) {
      const x = 126 + index * 29;
      ctx.fillStyle = index % 2 ? "#74a7b5" : "#a8665c";
      ctx.fillRect(x, 187 + index * 4, 20, 11);
    }

    this.drawTree(ctx, 92, 408, 0.82);
    this.drawTree(ctx, 1182, 414, 0.9);
    this.drawBench(ctx, 252, 416, 1);
    this.drawBench(ctx, 1016, 418, -1);

    ctx.strokeStyle = "rgba(166, 178, 166, 0.52)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(785, 402); ctx.lineTo(785, 340); ctx.lineTo(817, 320);
    ctx.moveTo(785, 366); ctx.lineTo(750, 340);
    ctx.moveTo(1090, 405); ctx.lineTo(1090, 342); ctx.lineTo(1124, 342);
    ctx.stroke();

    ctx.restore();
  }

  drawTree(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#4b3d32";
    ctx.fillRect(-8, -92, 16, 98);
    ctx.fillStyle = "#31483d";
    ctx.beginPath();
    ctx.arc(-24, -96, 38, 0, Math.PI * 2);
    ctx.arc(18, -112, 47, 0, Math.PI * 2);
    ctx.arc(34, -75, 35, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBench(ctx, x, y, direction) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(direction, 1);
    ctx.fillStyle = "#705745";
    ctx.fillRect(-58, -28, 116, 13);
    ctx.fillRect(-58, -10, 116, 11);
    ctx.fillStyle = "#282a2e";
    ctx.fillRect(-43, 0, 8, 28);
    ctx.fillRect(35, 0, 8, 28);
    ctx.restore();
  }

  drawArena(ctx) {
    const groundTop = 430;
    const ground = ctx.createLinearGradient(0, groundTop, 0, this.height);
    ground.addColorStop(0, "#292b30");
    ground.addColorStop(1, "#111318");
    ctx.fillStyle = ground;
    ctx.fillRect(0, groundTop, this.width, this.height - groundTop);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.055)";
    ctx.lineWidth = 1;
    for (let y = groundTop; y <= this.height; y += 42) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    for (let x = -200; x <= this.width + 200; x += 84) {
      ctx.beginPath();
      ctx.moveTo(this.width / 2 + (x - this.width / 2) * 0.35, groundTop);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(197, 53, 43, 0.12)";
    ctx.beginPath();
    ctx.ellipse(this.width / 2, 620, 310, 52, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCenterMark(ctx) {
    ctx.save();
    ctx.translate(this.width / 2, 470);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 14]);
    ctx.beginPath();
    ctx.ellipse(0, 0, 110, 32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawAttackCone(ctx, attacker, lock) {
    if (!lock.isFocusing && lock.progress <= 0) return;

    const alpha = lock.isReady ? 0.34 : lock.isValid ? 0.23 : 0.12;
    const color = lock.isReady ? "255, 224, 102" : "255, 126, 54";
    const originY = attacker.y - 22 + PLAYER_DRAW_OFFSET_Y;
    const start = lock.aimAngle - lock.config.coneHalfAngle;
    const end = lock.aimAngle + lock.config.coneHalfAngle;
    const gradient = ctx.createRadialGradient(
      attacker.x,
      originY,
      10,
      attacker.x,
      originY,
      lock.config.range,
    );
    gradient.addColorStop(0, `rgba(${color}, ${alpha + 0.12})`);
    gradient.addColorStop(0.68, `rgba(${color}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${color}, 0)`);

    ctx.save();
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(attacker.x, originY);
    ctx.arc(attacker.x, originY, lock.config.range, start, end);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(${color}, ${lock.isValid ? 0.72 : 0.34})`;
    ctx.lineWidth = lock.isReady ? 5 : 2;
    ctx.setLineDash(lock.isValid ? [] : [10, 10]);
    ctx.stroke();
    ctx.restore();
  }

  drawLineOfSightCue(ctx, scene) {
    if (!scene.lock.isFocusing || scene.lock.conditions.lineOfSight) return;
    const start = {
      x: scene.attacker.x,
      y: scene.attacker.y - 46 + PLAYER_DRAW_OFFSET_Y,
    };
    const end = {
      x: scene.defender.x,
      y: scene.defender.y - 46 + PLAYER_DRAW_OFFSET_Y,
    };
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    ctx.save();
    ctx.strokeStyle = "rgba(255, 83, 67, 0.9)";
    ctx.lineWidth = 5;
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(middle.x - 24, middle.y);
    ctx.moveTo(middle.x + 24, middle.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(middle.x - 14, middle.y - 14);
    ctx.lineTo(middle.x + 14, middle.y + 14);
    ctx.moveTo(middle.x + 14, middle.y - 14);
    ctx.lineTo(middle.x - 14, middle.y + 14);
    ctx.stroke();
    if (scene.subtitlesEnabled) {
      ctx.font = "900 18px 'Microsoft YaHei UI', sans-serif";
      ctx.textAlign = "center";
      const label = "视线受阻 · 绕开电线杆";
      const width = ctx.measureText(label).width + 28;
      ctx.fillStyle = "rgba(12, 13, 17, 0.9)";
      roundedRect(ctx, middle.x - width / 2, middle.y - 55, width, 30, 7);
      ctx.fill();
      ctx.fillStyle = "#ff8072";
      ctx.fillText(label, middle.x, middle.y - 34);
    }
    ctx.restore();
  }

  drawLockDebug(ctx, players, lock) {
    const [first, second] = players;
    ctx.save();
    ctx.strokeStyle = lock.conditions.lineOfSight
      ? "rgba(174, 255, 190, 0.48)"
      : "rgba(255, 90, 72, 0.55)";
    ctx.lineWidth = 3;
    ctx.setLineDash(lock.conditions.lineOfSight ? [10, 14] : [4, 13]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y - 18 + PLAYER_DRAW_OFFSET_Y);
    ctx.lineTo(second.x, second.y - 18 + PLAYER_DRAW_OFFSET_Y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 149, 70, 0.24)";
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 10]);
    ctx.beginPath();
    ctx.arc(first.x, first.y - 22, lock.config.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawLockFrame(ctx, target, lock, time) {
    if (!lock.isFocusing && lock.progress <= 0 && lock.resultFlashRemaining <= 0) return;

    const centerY = target.y - 47 + PLAYER_DRAW_OFFSET_Y;
    const size = 108 + Math.sin(time * 8) * 3;
    const half = size / 2;
    const corner = 22;
    const color = lock.isReady
      ? "rgba(255, 232, 112, 0.98)"
      : lock.isValid
        ? "rgba(255, 133, 56, 0.95)"
        : "rgba(255, 96, 67, 0.56)";

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lock.isReady ? 6 : 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = lock.isValid ? 18 : 6;
    ctx.beginPath();
    drawCorner(ctx, target.x - half, centerY - half, corner, 1, 1);
    drawCorner(ctx, target.x + half, centerY - half, corner, -1, 1);
    drawCorner(ctx, target.x - half, centerY + half, corner, 1, -1);
    drawCorner(ctx, target.x + half, centerY + half, corner, -1, -1);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(target.x, centerY, 68, -Math.PI / 2, Math.PI * 1.5);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      target.x,
      centerY,
      68,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * lock.progress,
    );
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "900 20px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(lock.progress * 100)}%`, target.x, centerY + 7);
    ctx.restore();
  }

  drawLockResult(ctx, lock) {
    if (lock.resultFlashRemaining <= 0 || lock.lastResult !== "early") return;
    const alpha = Math.min(1, lock.resultFlashRemaining * 3);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "900 58px 'Microsoft YaHei UI', sans-serif";
    ctx.fillStyle = "#ff654c";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 28;
    ctx.fillText("喊早了！", this.width / 2, 245);
    ctx.restore();
  }

  drawCombatEffects(ctx, scene) {
    const { combat } = scene;
    if (!scene.lowEffects && (
      combat.state === "CALLOUT" ||
      combat.state === "REACTION_WINDOW" ||
      combat.state === "REFLECT"
    )) {
      this.drawSpeedLines(ctx, scene.time, combat.attackKind === "bull");
    }
    if (scene.flashesEnabled && combat.hitStopRemaining > 0) {
      this.drawImpactFlash(ctx, scene.lowEffects, combat.attackKind === "bull");
    }

    if (combat.state === "ROUND_START") {
      this.drawImpactText(ctx, "开寿！", "#f5eee2", 0.62);
    } else if (combat.state === "CALLOUT") {
      if (combat.attackKind === "bull") {
        this.drawBullSilhouette(ctx, this.width / 2, 330, 1.8, 1, 0.22);
        this.drawImpactText(ctx, "牛 来", "#dff178", 1);
        if (scene.subtitlesEnabled) this.drawVarietyCaption(ctx, "前 摇 加 长 · 别 抢 答", "#dff178");
      } else {
        this.drawImpactText(ctx, "寿 来", "#ff754a", 1);
        if (scene.subtitlesEnabled) this.drawVarietyCaption(ctx, "借 寿 发 起", "#ff8a5d");
      }
    } else if (combat.state === "REACTION_WINDOW") {
      const isBull = combat.attackKind === "bull";
      this.drawImpactText(ctx, isBull ? "妈！" : "回！", isBull ? "#dff178" : "#ffe672", 0.9);
      if (scene.subtitlesEnabled) this.drawVarietyCaption(ctx, "现 在 回 应", isBull ? "#dff178" : "#ffe672");
      ctx.save();
      ctx.strokeStyle = isBull
        ? "rgba(214, 239, 107, 0.9)"
        : "rgba(255, 230, 114, 0.88)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.arc(
        this.width / 2,
        285,
        84,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - combat.reactionProgress),
      );
      ctx.stroke();
      ctx.restore();
    } else if (combat.state === "REFLECT") {
      this.drawImpactText(
        ctx,
        combat.outcome?.type === "bullReflect"
          ? "妈 妈"
          : combat.outcome?.type === "perfect"
            ? "完美寿回"
            : "寿 回",
        combat.outcome?.type === "bullReflect" ? "#dff178" : "#ffe672",
        combat.outcome?.type === "perfect" ? 0.72 : 0.9,
      );
    } else if (combat.state === "DAMAGE_RECOVERY" && combat.outcome) {
      const labels = {
        early: "抢 答",
        wrong: "答 错",
        timeout: "借 到 了",
        family: "认 亲",
        bullStun: "牛 头 眩 晕",
        bullTimeout: "撞 到 了",
      };
      const bullFailure = combat.outcome.attackKind === "bull";
      this.drawImpactText(
        ctx,
        labels[combat.outcome.type] ?? "命 中",
        bullFailure ? "#d7ed72" : "#ff6b51",
        0.68,
      );
    }

    if (!combat.outcome || combat.outcomeDisplayRemaining <= 0) return;
    const outcome = combat.outcome;
    const source = scene.players[outcome.sourceIndex];
    const target = scene.players[outcome.targetIndex];
    const isBull = outcome.attackKind === "bull";
    const isReflect = outcome.type === "reflect" || outcome.type === "perfect";
    const isBullReflect = outcome.type === "bullReflect";
    const alpha = Math.min(1, combat.outcomeDisplayRemaining * 2.5);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (isReflect) {
      const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
      gradient.addColorStop(0, "rgba(255, 242, 164, 0.1)");
      gradient.addColorStop(0.5, "rgba(255, 230, 94, 1)");
      gradient.addColorStop(1, "rgba(255, 98, 63, 0.32)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = outcome.type === "perfect" ? 18 : 11;
      ctx.shadowColor = "#ffe35f";
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.moveTo(source.x, source.y - 52 + PLAYER_DRAW_OFFSET_Y);
      ctx.lineTo(target.x, target.y - 52 + PLAYER_DRAW_OFFSET_Y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "900 34px 'STKaiti', 'KaiTi', serif";
      ctx.fillStyle = "#fff2a1";
      for (let step = 0.2; step <= 0.8; step += 0.2) {
        const x = source.x + (target.x - source.x) * step;
        const y = source.y - 52 + PLAYER_DRAW_OFFSET_Y + (target.y - source.y) * step;
        ctx.fillText("寿", x, y);
      }
    }

    if (isBull) {
      const phase = 1 - Math.min(1, combat.outcomeDisplayRemaining / 1.15);
      const x = source.x + (target.x - source.x) * Math.min(1, phase * 1.8);
      const y = source.y - 50 + PLAYER_DRAW_OFFSET_Y + (target.y - source.y) * Math.min(1, phase * 1.8);
      this.drawBullSilhouette(
        ctx,
        x,
        y,
        isBullReflect ? 1.15 : 0.95,
        Math.sign(target.x - source.x) || 1,
        0.88,
      );
    }

    if (outcome.type === "bullStun" || outcome.type === "family") {
      this.drawBullHead(ctx, target.x, target.y - 83 + PLAYER_DRAW_OFFSET_Y, outcome.type === "family");
    }

    ctx.textAlign = "center";
    ctx.font = "900 30px 'Microsoft YaHei UI', sans-serif";
    ctx.fillStyle = isReflect || isBullReflect ? "#e7f77f" : "#ff755d";
    ctx.fillText(`-${outcome.damage} 年`, target.x, target.y - 172 + PLAYER_DRAW_OFFSET_Y);
    ctx.restore();
  }

  drawSpeedLines(ctx, time, isBull) {
    ctx.save();
    ctx.translate(this.width / 2, 285);
    ctx.strokeStyle = isBull ? "rgba(217, 239, 112, 0.2)" : "rgba(255, 129, 74, 0.18)";
    ctx.lineWidth = 3;
    for (let index = 0; index < 22; index += 1) {
      const angle = index * Math.PI * 2 / 22 + time * 0.06;
      const inner = 125 + (index % 3) * 20;
      const outer = inner + 80 + (index % 4) * 24;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner * 0.65);
      ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer * 0.65);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawImpactFlash(ctx, lowEffects, isBull) {
    ctx.save();
    ctx.fillStyle = isBull
      ? `rgba(223, 241, 120, ${lowEffects ? 0.05 : 0.15})`
      : `rgba(255, 235, 199, ${lowEffects ? 0.04 : 0.13})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  drawVarietyCaption(ctx, text, color) {
    ctx.save();
    ctx.translate(this.width / 2, 334);
    ctx.rotate(-0.025);
    ctx.font = "900 20px 'Microsoft YaHei UI', sans-serif";
    const width = ctx.measureText(text).width + 44;
    ctx.fillStyle = "rgba(10, 11, 14, 0.82)";
    roundedRect(ctx, -width / 2, -24, width, 36, 7);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  drawImpactText(ctx, text, color, scale) {
    ctx.save();
    ctx.translate(this.width / 2, 260);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.font = "900 112px 'STKaiti', 'KaiTi', serif";
    ctx.fillStyle = color;
    ctx.strokeStyle = "rgba(24, 8, 8, 0.9)";
    ctx.lineWidth = 14;
    ctx.shadowColor = color;
    ctx.shadowBlur = 34;
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  drawBullSilhouette(ctx, x, y, scale, direction, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale * direction, scale);
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "#d8ed72";
    ctx.shadowColor = "#c8e761";
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(0, 0, 62, 32, 0, 0, Math.PI * 2);
    ctx.ellipse(55, -19, 27, 23, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#d8ed72";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-34, 18); ctx.lineTo(-42, 52);
    ctx.moveTo(18, 20); ctx.lineTo(9, 53);
    ctx.moveTo(65, -34); ctx.lineTo(86, -54);
    ctx.moveTo(49, -38); ctx.lineTo(35, -59);
    ctx.stroke();
    ctx.restore();
  }

  drawBullHead(ctx, x, y, confused) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = confused ? "rgba(255, 173, 91, 0.9)" : "rgba(211, 237, 111, 0.94)";
    ctx.strokeStyle = "rgba(22, 25, 16, 0.9)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-25, -20); ctx.lineTo(-58, -48); ctx.lineTo(-44, -4);
    ctx.moveTo(25, -20); ctx.lineTo(58, -48); ctx.lineTo(44, -4);
    ctx.ellipse(0, 0, 43, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#171914";
    ctx.beginPath();
    ctx.arc(-15, -5, 5, 0, Math.PI * 2);
    ctx.arc(15, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "900 24px 'Microsoft YaHei UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(confused ? "妈?" : "晕", 0, 12);
    ctx.restore();
  }

  drawObstacles(ctx, obstacles) {
    for (const obstacle of obstacles) {
      if (obstacle.type !== "circle") continue;

      ctx.save();
      const poleGradient = ctx.createLinearGradient(
        obstacle.x - 24,
        0,
        obstacle.x + 24,
        0,
      );
      poleGradient.addColorStop(0, "#303138");
      poleGradient.addColorStop(0.48, "#77746d");
      poleGradient.addColorStop(1, "#25262b");
      ctx.fillStyle = poleGradient;
      ctx.fillRect(obstacle.x - 23, 128, 46, obstacle.y - 128);

      ctx.fillStyle = "#22242a";
      ctx.fillRect(obstacle.x - 70, 135, 140, 15);
      ctx.fillRect(obstacle.x - 38, 205, 76, 9);

      ctx.strokeStyle = "rgba(20, 20, 24, 0.78)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(obstacle.x - 70, 142);
      ctx.lineTo(0, 120);
      ctx.moveTo(obstacle.x + 70, 142);
      ctx.lineTo(this.width, 104);
      ctx.stroke();

      ctx.fillStyle = "#bdb8a9";
      ctx.fillRect(obstacle.x - 17, 245, 34, 75);
      ctx.fillStyle = "#34353b";
      ctx.font = "700 14px 'Microsoft YaHei UI', sans-serif";
      ctx.textAlign = "center";
      ctx.save();
      ctx.translate(obstacle.x, 282);
      ctx.rotate(Math.PI / 2);
      ctx.fillText("邻里和睦", 0, 5);
      ctx.restore();

      ctx.fillStyle = "rgba(0, 0, 0, 0.36)";
      ctx.beginPath();
      ctx.ellipse(obstacle.x, obstacle.y + 23, obstacle.radius + 17, 24, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#44454b";
      ctx.beginPath();
      ctx.arc(obstacle.x, obstacle.y, obstacle.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlayer(ctx, player, scene) {
    if (scene.characterArtMode === "doll") {
      this.dollRenderer.draw(ctx, player, scene, { drawOffsetY: PLAYER_DRAW_OFFSET_Y });
      return;
    }
    this.drawLegacyPlayer(ctx, player, scene);
  }

  drawLegacyPlayer(ctx, player, scene) {
    const { time } = scene;
    const pulse = 1 + Math.sin(time * 2.4 + (player.id === "P1" ? 0 : Math.PI)) * 0.018;
    const speed = Math.hypot(player.velocityX, player.velocityY);
    const stride = Math.sin(time * 13 + (player.id === "P1" ? 0 : Math.PI)) * Math.min(1, speed / 120);
    const facing = player.facingX === 0 && player.facingY === 0
      ? { x: player.id === "P1" ? 1 : -1, y: 0 }
      : { x: player.facingX, y: player.facingY };
    const playerIndex = scene.players.findIndex((candidate) => candidate.id === player.id);
    const isSpeaking = (
      scene.combat.state === "CALLOUT" && player.role === "attacker"
    ) || (
      (scene.combat.state === "REACTION_WINDOW" || scene.combat.state === "REFLECT") &&
      player.role === "defender"
    );
    const wasHit = scene.combat.outcomeDisplayRemaining > 0 &&
      scene.combat.outcome?.targetIndex === playerIndex;
    const reach = player.role === "attacker" && scene.lock.isFocusing
      ? 15 + scene.lock.progress * 30
      : 0;

    ctx.save();
    ctx.translate(player.x, player.y + PLAYER_DRAW_OFFSET_Y + Math.abs(stride) * -3);
    ctx.scale(pulse, pulse);

    this.drawRoleAura(ctx, player, time);

    const trailCount = scene.lowEffects ? 1 : 4;
    if (player.isDashing) {
      for (let index = trailCount; index >= 1; index -= 1) {
        ctx.globalAlpha = 0.045 + 0.045 * index;
        ctx.fillStyle = player.color;
        ctx.beginPath();
        ctx.ellipse(
          -facing.x * index * 25,
          -36 - facing.y * index * 13,
          37,
          62,
          -facing.x * 0.08,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(0, 39, 58, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(231, 222, 207, 0.9)";
    this.drawSpringLimb(ctx, -14, 4, -21 - stride * 8, 31, 10, 2);
    this.drawSpringLimb(ctx, 14, 4, 21 + stride * 8, 31, 10, 2);

    ctx.fillStyle = player.id === "P1" ? "#e74e38" : "#25aebd";
    ctx.beginPath();
    ctx.ellipse(-24 - stride * 8, 35, 20, 7, -0.08, 0, Math.PI * 2);
    ctx.ellipse(24 + stride * 8, 35, 20, 7, 0.08, 0, Math.PI * 2);
    ctx.fill();

    const handDirection = player.role === "attacker" ? facing.x || (player.id === "P1" ? 1 : -1) : 0;
    ctx.strokeStyle = "rgba(231, 222, 207, 0.92)";
    this.drawSpringLimb(ctx, -26, -36, -48 - handDirection * reach, -8 + stride * 3, 9, 3);
    this.drawSpringLimb(ctx, 26, -36, 48 + handDirection * reach, -10 - stride * 3, 9, 3);

    ctx.shadowColor = player.glow;
    ctx.shadowBlur = scene.lowEffects ? 8 : player.isDashing ? 46 : 26;
    ctx.fillStyle = player.color;
    roundedRect(ctx, -34, -66, 68, 80, 22);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = player.role === "attacker"
      ? "rgba(255, 231, 139, 0.72)"
      : "rgba(202, 246, 255, 0.62)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "rgba(9, 10, 13, 0.58)";
    ctx.beginPath();
    ctx.moveTo(-18, -6); ctx.lineTo(0, 8); ctx.lineTo(18, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colorWithAlpha(player.color, 0.95);
    ctx.beginPath();
    ctx.ellipse(0, -91, 45, 43, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "rgba(8, 10, 13, 0.82)";
    ctx.beginPath();
    ctx.arc(-14 + facing.x * 7, -97 + facing.y * 4, wasHit ? 3 : 6, 0, Math.PI * 2);
    ctx.arc(14 + facing.x * 7, -97 + facing.y * 4, wasHit ? 3 : 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(8, 10, 13, 0.78)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (player.role === "attacker") {
      ctx.moveTo(-25, -111); ctx.lineTo(-7, -106);
      ctx.moveTo(7, -106); ctx.lineTo(25, -111);
    } else {
      ctx.moveTo(-25, -106); ctx.quadraticCurveTo(-16, -114, -7, -106);
      ctx.moveTo(7, -106); ctx.quadraticCurveTo(16, -114, 25, -106);
    }
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (isSpeaking) {
      ctx.fillStyle = "rgba(8, 10, 13, 0.8)";
      ctx.ellipse(facing.x * 5, -76, 13, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 221, 201, 0.86)";
      ctx.beginPath();
      ctx.ellipse(facing.x * 5, -69, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.moveTo(-13 + facing.x * 4, -77);
      ctx.quadraticCurveTo(facing.x * 5, wasHit ? -84 : -68, 14 + facing.x * 4, -78);
      ctx.strokeStyle = "rgba(8, 10, 13, 0.72)";
      ctx.stroke();
    }

    ctx.font = "800 16px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#0a0b0e";
    ctx.fillText(player.id, 0, -26);

    ctx.fillStyle = player.role === "attacker" ? "#ffbc6c" : "#8ce9f2";
    roundedRect(ctx, -39, -157, 78, 23, 10);
    ctx.fill();
    ctx.font = "800 13px 'Microsoft YaHei UI', sans-serif";
    ctx.fillStyle = "#111318";
    ctx.fillText(`${player.role === "attacker" ? "攻" : "守"} · ${player.name}`, 0, -145);

    if (player.isLockImmune) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(0, -37, 66, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (scene.debugVisible) {
      ctx.strokeStyle = "rgba(185, 248, 170, 0.38)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawRoleAura(ctx, player, time) {
    ctx.save();
    if (player.role === "attacker") {
      ctx.strokeStyle = "rgba(255, 139, 67, 0.68)";
      ctx.lineWidth = 5;
      for (let ray = 0; ray < 8; ray += 1) {
        const angle = ray * Math.PI / 4 + Math.sin(time * 2) * 0.04;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 55, -45 + Math.sin(angle) * 70);
        ctx.lineTo(Math.cos(angle) * 69, -45 + Math.sin(angle) * 88);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "rgba(92, 220, 238, 0.58)";
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 9]);
      ctx.beginPath();
      ctx.ellipse(0, -42, 61, 84, Math.sin(time * 0.8) * 0.03, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  drawSpringLimb(ctx, startX, startY, endX, endY, width, coils) {
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    const segments = coils * 2 + 1;
    for (let segment = 1; segment < segments; segment += 1) {
      const progress = segment / segments;
      const offset = (segment % 2 === 0 ? -1 : 1) * width * 0.34;
      ctx.lineTo(
        startX + dx * progress + normalX * offset,
        startY + dy * progress + normalY * offset,
      );
    }
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  drawRoleSwapSweep(ctx, scene) {
    if (this.roleSwapRemaining <= 0) return;
    const progress = 1 - this.roleSwapRemaining / 0.62;
    const alpha = Math.sin(Math.PI * Math.min(1, progress));
    const fromColor = this.roleSwapFromIndex === 0 ? "255, 101, 63" : "64, 217, 232";
    const toColor = this.roleSwapToIndex === 0 ? "255, 101, 63" : "64, 217, 232";
    ctx.save();
    ctx.globalAlpha = scene.lowEffects ? alpha * 0.34 : alpha * 0.62;
    const x = -this.width * 0.5 + progress * this.width * 2;
    const gradient = ctx.createLinearGradient(x - 260, 0, x + 260, 0);
    gradient.addColorStop(0, `rgba(${fromColor}, 0)`);
    gradient.addColorStop(0.42, `rgba(${fromColor}, 0.55)`);
    gradient.addColorStop(0.58, `rgba(${toColor}, 0.74)`);
    gradient.addColorStop(1, `rgba(${toColor}, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.font = "900 58px 'STKaiti', 'KaiTi', serif";
    ctx.fillStyle = "#fff4cf";
    ctx.strokeStyle = "rgba(12, 12, 16, 0.88)";
    ctx.lineWidth = 10;
    ctx.strokeText("攻 守 逆 转", this.width / 2, 382);
    ctx.fillText("攻 守 逆 转", this.width / 2, 382);
    ctx.restore();
  }

  drawVignette(ctx) {
    const vignette = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      this.height * 0.18,
      this.width / 2,
      this.height / 2,
      this.width * 0.68,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
}

function colorWithAlpha(hex, alpha) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawCorner(ctx, x, y, size, directionX, directionY) {
  ctx.moveTo(x + size * directionX, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + size * directionY);
}
