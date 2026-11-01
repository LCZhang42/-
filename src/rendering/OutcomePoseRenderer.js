import { FALLEN_DOLL_POSE } from "./DollAnimation.js";
import { DollRenderer } from "./DollRenderer.js";

export class OutcomePoseRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dollRenderer = new DollRenderer();
  }

  draw({ players, winnerIndex, characterIds, customPoses, poseIndexes }) {
    const { canvas, ctx } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawBackdrop(ctx, canvas.width, canvas.height, winnerIndex);

    if (winnerIndex === null) {
      for (const [index, source] of players.entries()) {
        const player = this.makePlayer(source, index === 0 ? 190 : 430, 225, index === 0 ? 1 : -1, "defender");
        const scene = this.makeScene(players, characterIds, customPoses, poseIndexes, null);
        this.dollRenderer.draw(ctx, player, scene, {
          drawOffsetY: -70, scale: 0.72, showLabel: false, forceExpression: "neutral",
        });
        this.drawCaption(ctx, player.x, 242, `平 · ${characterIds[index] ? "还活着" : ""}`, "#d8d0c3");
      }
      return;
    }

    const loserIndex = winnerIndex === 0 ? 1 : 0;
    const winner = this.makePlayer(players[winnerIndex], 188, 222, 1, "attacker");
    const loser = this.makePlayer(players[loserIndex], 455, 174, -1, "defender");
    const outcomePoses = customPoses.map((pose) => pose ? { ...pose } : null);
    outcomePoses[loserIndex] = FALLEN_DOLL_POSE;
    const scene = this.makeScene(players, characterIds, outcomePoses, poseIndexes, winnerIndex);

    this.dollRenderer.draw(ctx, winner, scene, {
      drawOffsetY: -70,
      scale: 0.76,
      showLabel: false,
      forceExpression: "triumph",
    });
    this.dollRenderer.draw(ctx, loser, scene, {
      drawOffsetY: -55,
      rotation: -Math.PI / 2,
      scale: 0.64,
      showAura: false,
      showLabel: false,
      showShadow: false,
      forceExpression: "hurt",
    });

    this.drawCaption(ctx, winner.x, 246, "胜者 · 保留自定义 Pose", "#ffe277");
    this.drawCaption(ctx, loser.x, 246, "败者 · 铁丝僵直倒地", "#a7a19a");
  }

  makePlayer(source, x, y, facingX, role) {
    return {
      ...source,
      x, y, role, facingX, facingY: 0,
      velocityX: 0, velocityY: 0,
      isDashing: false, isLockImmune: false,
    };
  }

  makeScene(players, characterIds, customPoses, poseIndexes, winnerIndex) {
    return {
      players,
      characterIds,
      customPoses,
      poseIndexes,
      grandpaPoseIndex: poseIndexes[0] ?? 0,
      time: 0,
      lowEffects: true,
      debugVisible: false,
      lock: { isFocusing: false, progress: 0 },
      combat: {
        state: "ROUND_OVER",
        outcome: winnerIndex === null ? null : {
          sourceIndex: winnerIndex,
          targetIndex: winnerIndex === 0 ? 1 : 0,
          type: "roundOver",
        },
        outcomeDisplayRemaining: 0,
      },
      roleSwapPulse: 0,
      roleSwapIndex: null,
    };
  }

  drawBackdrop(ctx, width, height, winnerIndex) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "rgba(255,112,72,.08)");
    gradient.addColorStop(0.5, "rgba(255,255,255,.025)");
    gradient.addColorStop(1, "rgba(64,217,232,.07)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,.055)";
    ctx.lineWidth = 1;
    for (let x = 20; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    ctx.fillStyle = winnerIndex === 1 ? "rgba(64,217,232,.08)" : "rgba(255,178,77,.09)";
    ctx.beginPath();
    ctx.ellipse(188, 125, 120, 115, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCaption(ctx, x, y, text, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = "800 13px 'Microsoft YaHei UI', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
