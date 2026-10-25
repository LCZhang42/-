import { DOLL_EXPRESSIONS, GRANDPA_CHARACTER, getCharacter, getCharacterPose } from "../characters/CharacterCatalog.js";
import { resolveDollSkeleton } from "./Skeleton2D.js";

export function resolveDollExpression(player, scene, playerIndex) {
  const outcome = scene.combat.outcome;
  if (scene.combat.outcomeDisplayRemaining > 0 && outcome?.targetIndex === playerIndex) return "hurt";
  if (scene.combat.state === "REFLECT" && outcome?.sourceIndex === playerIndex) return "triumph";
  if (scene.combat.state === "CALLOUT" && player.role === "attacker") return "shout";
  if (scene.combat.state === "REACTION_WINDOW" && player.role === "defender") return "shock";
  if (player.role === "attacker" && scene.lock.isFocusing) return "focus";
  return "neutral";
}

export class DollRenderer {
  constructor(character = GRANDPA_CHARACTER) {
    this.character = character;
  }

  draw(ctx, player, scene, { drawOffsetY = -92 } = {}) {
    const playerIndex = scene.players.findIndex((candidate) => candidate.id === player.id);
    this.character = getCharacter(scene.characterIds?.[playerIndex]);
    const pose = getCharacterPose(this.character, scene.poseIndexes?.[playerIndex] ?? scene.grandpaPoseIndex);
    const speed = Math.hypot(player.velocityX, player.velocityY);
    const stride = Math.sin(scene.time * 12.5) * Math.min(1, speed / 150);
    const isCallout = scene.combat.state === "CALLOUT" && player.role === "attacker";
    const expression = resolveDollExpression(player, scene, playerIndex);
    const facing = player.facingX || (player.id === "P1" ? 1 : -1);
    const focusReach = player.role === "attacker" && scene.lock.isFocusing
      ? 9 + scene.lock.progress * 23
      : 0;
    const skeleton = resolveDollSkeleton(pose, {
      lean: scene.lock.isFocusing && player.role === "attacker" ? 0.13 * Math.sign(facing) : 0,
      headX: expression === "shock" ? -2 : Math.sin(scene.time * 2.1) * 1.5,
      headY: expression === "shock" ? -5 : 0,
      stride,
      armSwing: stride * 0.12,
      reach: focusReach + (isCallout ? 22 : 0),
    });

    ctx.save();
    ctx.translate(player.x, player.y + drawOffsetY - Math.abs(stride) * 2);
    ctx.scale(0.9, 0.9);
    this.drawAura(ctx, player, scene.time);
    this.drawDashTrail(ctx, player, skeleton, scene.lowEffects);
    this.drawShadow(ctx);
    this.drawLegs(ctx, skeleton, stride);
    this.drawArms(ctx, skeleton);
    this.drawTorso(ctx, skeleton);
    this.drawHead(ctx, skeleton.head, expression, facing);
    this.drawRoleLabel(ctx, player, pose, expression);

    if (player.isLockImmune) {
      ctx.strokeStyle = "rgba(255,255,255,.72)";
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 8]);
      ctx.beginPath();
      ctx.ellipse(0, -45, 66, 91, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (scene.debugVisible) {
      ctx.strokeStyle = "rgba(185,248,170,.48)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
      ctx.stroke();
      this.drawJoints(ctx, skeleton);
    }
    ctx.restore();
  }

  drawAura(ctx, player, time) {
    ctx.save();
    ctx.strokeStyle = player.role === "attacker" ? "rgba(255,139,67,.66)" : "rgba(92,220,238,.55)";
    ctx.lineWidth = player.role === "attacker" ? 5 : 3;
    ctx.setLineDash(player.role === "attacker" ? [] : [7, 9]);
    ctx.beginPath();
    ctx.ellipse(0, -45, 67 + Math.sin(time * 3) * 2, 96, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawDashTrail(ctx, player, skeleton, lowEffects) {
    if (!player.isDashing) return;
    ctx.save();
    ctx.globalAlpha = lowEffects ? 0.12 : 0.2;
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.ellipse(-player.facingX * 32, -55, 40, 82, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawShadow(ctx) {
    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath();
    ctx.ellipse(0, 42, 57, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawLegs(ctx, s, stride) {
    this.drawFabricLimb(ctx, s.leftHip, s.leftKnee, 10, this.character.palette.trousers, this.character.palette.trousersLight);
    this.drawFabricLimb(ctx, s.leftKnee, s.leftAnkle, 8, this.character.palette.trousers, this.character.palette.trousersLight);
    this.drawFabricLimb(ctx, s.rightHip, s.rightKnee, 10, this.character.palette.trousers, this.character.palette.trousersLight);
    this.drawFabricLimb(ctx, s.rightKnee, s.rightAnkle, 8, this.character.palette.trousers, this.character.palette.trousersLight);
    this.drawShoe(ctx, s.leftAnkle, -1, stride);
    this.drawShoe(ctx, s.rightAnkle, 1, -stride);
  }

  drawArms(ctx, s) {
    const { skin, skinDark } = this.character.palette;
    this.drawFabricLimb(ctx, s.leftShoulder, s.leftElbow, 7, skin, skinDark);
    this.drawFabricLimb(ctx, s.leftElbow, s.leftWrist, 6, skin, skinDark);
    this.drawFabricLimb(ctx, s.rightShoulder, s.rightElbow, 7, skin, skinDark);
    this.drawFabricLimb(ctx, s.rightElbow, s.rightWrist, 6, skin, skinDark);
    this.drawHand(ctx, s.leftWrist);
    this.drawHand(ctx, s.rightWrist);
  }

  drawFabricLimb(ctx, start, end, width, color, highlight) {
    ctx.save();
    const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, highlight);
    gradient.addColorStop(0.22, color);
    gradient.addColorStop(1, highlight);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const crooked = start.x <= end.x ? 3.5 : -3.5;
    ctx.quadraticCurveTo((start.x + end.x) / 2 + crooked, (start.y + end.y) / 2 - 2, end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(48,39,29,.68)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.restore();
  }

  drawTorso(ctx, s) {
    const p = this.character.palette;
    const visual = this.character.visual;
    ctx.save();
    ctx.translate(s.chest.x, s.chest.y + 27);
    ctx.rotate(Math.atan2(s.chest.x - s.hips.x, s.hips.y - s.chest.y) * 0.32);
    ctx.scale(visual.torsoScale ?? 1, visual.outfit === "oversized" ? 1.07 : 1);
    const gradient = ctx.createLinearGradient(-28, 0, 30, 0);
    gradient.addColorStop(0, p.shirtShadow);
    gradient.addColorStop(0.28, p.shirt);
    gradient.addColorStop(0.68, "#eee7d4");
    gradient.addColorStop(1, p.shirtShadow);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(-20, -31);
    ctx.quadraticCurveTo(-23, 2, -13, 42);
    ctx.lineTo(14, 40);
    ctx.quadraticCurveTo(22, 1, 18, -30);
    ctx.quadraticCurveTo(9, -36, 0, -23);
    ctx.quadraticCurveTo(-8, -39, -20, -31);
    ctx.fill();
    ctx.strokeStyle = p.thread;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.fillStyle = p.trousers;
    ctx.fillRect(-14, 31, 29, 11);
    ctx.fillStyle = "#a89467";
    ctx.beginPath();
    ctx.arc(0, 36, 3.5, 0, Math.PI * 2);
    ctx.fill();
    this.drawOutfitDetails(ctx, visual.outfit, p);
    ctx.restore();
  }

  drawOutfitDetails(ctx, outfit, palette) {
    ctx.save();
    ctx.setLineDash([]);
    if (outfit === "polo") {
      ctx.strokeStyle = palette.thread;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -27); ctx.lineTo(0, -18); ctx.lineTo(8, -27);
      ctx.moveTo(0, -18); ctx.lineTo(0, 4);
      ctx.stroke();
      ctx.fillStyle = "#b7a989";
      for (const y of [-10, -2]) { ctx.beginPath(); ctx.arc(3, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    }
    if (outfit === "floral" || outfit === "apron") {
      const colors = outfit === "floral" ? ["#e8b342", "#e9d8c3", "#5c8d50"] : ["#d8c775", "#8a2725", "#516f3e"];
      for (let index = 0; index < 7; index += 1) {
        const x = -13 + (index % 3) * 12;
        const y = -20 + Math.floor(index / 3) * 18;
        ctx.fillStyle = colors[index % colors.length];
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (outfit === "apron") {
      ctx.fillStyle = palette.apron ?? "#31585a";
      ctx.globalAlpha = 0.94;
      ctx.beginPath();
      ctx.moveTo(-13, -13); ctx.lineTo(13, -13); ctx.lineTo(16, 36); ctx.lineTo(-15, 36); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = palette.thread;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.stroke();
      ctx.strokeRect(-8, 14, 16, 13);
    }
    if (outfit === "oversized") {
      ctx.strokeStyle = "rgba(50,46,43,.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-16, 24); ctx.quadraticCurveTo(0, 30, 15, 23);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHead(ctx, head, expression, facing) {
    const p = this.character.palette;
    ctx.save();
    ctx.translate(head.x, head.y);
    const gradient = ctx.createRadialGradient(-10, -16, 3, 0, 0, 38);
    gradient.addColorStop(0, "#d0ba91");
    gradient.addColorStop(0.66, p.skin);
    gradient.addColorStop(1, p.skinDark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(-1, 0, 25, 31, -0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.thread;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(-2, -29); ctx.lineTo(2, 29);
    ctx.stroke();
    ctx.setLineDash([]);
    this.drawHair(ctx, this.character.visual.hairStyle);
    this.drawFace(ctx, expression, facing);
    ctx.restore();
  }

  drawHair(ctx, style) {
    ctx.strokeStyle = this.character.palette.hair;
    ctx.lineWidth = style === "curly" ? 6 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (style === "curly") {
      for (let index = 0; index < 7; index += 1) {
        const x = -25 + index * 8;
        ctx.moveTo(x, -20); ctx.quadraticCurveTo(x - 7, -38 - (index % 2) * 5, x + 2, -42);
      }
    } else if (style === "ponytail") {
      ctx.moveTo(-23, -20); ctx.quadraticCurveTo(-28, -41, -8, -43);
      ctx.moveTo(12, -40); ctx.quadraticCurveTo(35, -37, 38, -17);
      ctx.moveTo(33, -22); ctx.quadraticCurveTo(48, -5, 34, 8);
    } else if (style === "messy") {
      for (let index = 0; index < 8; index += 1) {
        const x = -24 + index * 7;
        ctx.moveTo(x, -23); ctx.lineTo(x + (index % 2 ? 9 : -8), -47 + (index % 3) * 5);
      }
    } else if (style === "short") {
      ctx.moveTo(-23, -22); ctx.quadraticCurveTo(-18, -43, 0, -42);
      ctx.quadraticCurveTo(21, -43, 25, -20);
    } else {
      ctx.moveTo(-24, -22); ctx.quadraticCurveTo(-34, -34, -27, -42);
      ctx.moveTo(-17, -31); ctx.quadraticCurveTo(-21, -45, -10, -48);
      ctx.moveTo(15, -31); ctx.quadraticCurveTo(28, -39, 29, -24);
    }
    ctx.stroke();
  }

  drawFace(ctx, expression, facing) {
    const ink = "#30291f";
    const faceStyle = this.character.visual.faceStyle;
    let leftEyeY = -8;
    let rightEyeY = -8;
    let eyeRadius = 3.7;
    if (expression === "hurt") { leftEyeY = -14; rightEyeY = -2; eyeRadius = 2.8; }
    if (expression === "shock") eyeRadius = 6;
    if (expression === "focus") eyeRadius = 2.6;
    if (faceStyle === "sleepy" && expression === "neutral") { leftEyeY = -5; rightEyeY = -5; eyeRadius = 2.5; }
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(-10 + facing * 2, leftEyeY, eyeRadius, 0, Math.PI * 2);
    ctx.arc(10 + facing * 2, rightEyeY, eyeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (expression === "focus") {
      ctx.moveTo(-19, -19); ctx.lineTo(-3, -14);
      ctx.moveTo(3, -14); ctx.lineTo(19, -19);
    } else if (expression === "shock") {
      ctx.moveTo(-18, -20); ctx.quadraticCurveTo(-10, -28, -2, -20);
      ctx.moveTo(2, -20); ctx.quadraticCurveTo(10, -28, 18, -20);
    } else if (expression === "triumph") {
      ctx.moveTo(-18, -15); ctx.lineTo(-3, -17);
      ctx.moveTo(3, -17); ctx.lineTo(18, -15);
    } else if (faceStyle === "confident") {
      ctx.moveTo(-18, -16); ctx.lineTo(-3, -20);
      ctx.moveTo(3, -20); ctx.lineTo(18, -16);
    } else if (faceStyle === "skeptical") {
      ctx.moveTo(-18, -20); ctx.lineTo(-3, -17);
      ctx.moveTo(3, -14); ctx.lineTo(18, -20);
    } else {
      ctx.moveTo(-18, -18); ctx.lineTo(-3, -19);
      ctx.moveTo(3, -19); ctx.lineTo(18, -18);
    }
    ctx.stroke();
    ctx.beginPath();
    if (expression === "shout" || expression === "shock") {
      ctx.fillStyle = "#362018";
      ctx.ellipse(facing * 2, 15, expression === "shock" ? 8 : 11, expression === "shock" ? 10 : 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c58977";
      ctx.beginPath();
      ctx.ellipse(facing * 2, 20, 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (expression === "triumph") {
      ctx.moveTo(-11, 15); ctx.quadraticCurveTo(0, 23, 13, 12);
      ctx.stroke();
    } else if (expression === "hurt") {
      ctx.moveTo(-13, 19); ctx.quadraticCurveTo(1, 7, 15, 18);
      ctx.stroke();
    } else {
      ctx.moveTo(-12, 17); ctx.quadraticCurveTo(0, 10, 12, 16);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(62,47,35,.48)";
    ctx.beginPath();
    ctx.ellipse(facing * 2, 3, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHand(ctx, point) {
    ctx.fillStyle = this.character.palette.skin;
    ctx.beginPath();
    ctx.ellipse(point.x, point.y, 5, 7, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShoe(ctx, point, direction, stride) {
    ctx.save();
    ctx.translate(point.x, point.y + 4);
    ctx.rotate(stride * 0.06);
    ctx.fillStyle = this.character.palette.shoes;
    ctx.beginPath();
    ctx.ellipse(direction * 4, 0, 14, 5.5, direction * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#6f685c";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  drawRoleLabel(ctx, player, pose, expression) {
    ctx.font = "800 13px 'Microsoft YaHei UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = `${player.role === "attacker" ? "攻" : "守"} · ${this.character.name}`;
    ctx.fillStyle = player.role === "attacker" ? "#ffbc6c" : "#8ce9f2";
    roundedRect(ctx, -50, -177, 100, 24, 10);
    ctx.fill();
    ctx.fillStyle = "#111318";
    ctx.fillText(label, 0, -165);
    ctx.fillStyle = "rgba(245,235,213,.82)";
    ctx.font = "700 10px 'Microsoft YaHei UI', sans-serif";
    ctx.fillText(`${pose.name} · ${DOLL_EXPRESSIONS[expression]}`, 0, 58);
  }

  drawJoints(ctx, skeleton) {
    ctx.fillStyle = "rgba(181,255,164,.72)";
    for (const point of Object.values(skeleton)) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
