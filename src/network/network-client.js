import {
  NETWORK_CORRECTION_SMOOTH_MS,
  NETWORK_INTERPOLATION_DELAY,
  applyNetworkInput,
} from "../../shared/NetworkMovement.js";
import { NetworkEventDeduplicator } from "../../shared/NetworkEventDeduplicator.js";

const canvas = document.querySelector("#arena");
const context = canvas.getContext("2d");
const serverUrl = document.querySelector("#server-url");
const connectButton = document.querySelector("#connect");
const leaveButton = document.querySelector("#leave");
const status = document.querySelector("#status");
const roomId = document.querySelector("#room-id");
const playerNumber = document.querySelector("#player-number");
const playerCount = document.querySelector("#player-count");
const inputStats = document.querySelector("#input-stats");
const rtt = document.querySelector("#rtt");
const correction = document.querySelector("#correction");
const latencyMs = document.querySelector("#latency-ms");
const jitterMs = document.querySelector("#jitter-ms");
const lossPercent = document.querySelector("#loss-percent");
const applyNetworkButton = document.querySelector("#apply-network");
const combatState = document.querySelector("#combat-state");
const roles = document.querySelector("#roles");
const life = document.querySelector("#life");
const lockProgress = document.querySelector("#lock-progress");
const lastEvent = document.querySelector("#last-event");
const calloutOverlay = document.querySelector("#callout-overlay");

const heldKeys = new Set();
const pressedEdges = new Set();
const colors = { 1: "#e65d45", 2: "#5ad1dd" };
const eventDeduplicator = new NetworkEventDeduplicator();
const eventCounts = new Map();
let room = null;
let ownPlayer = null;
let input = null;
let predict = null;
let ownController = null;
let detachRemoteSmoothing = null;
let animationFrameId = 0;
let packetLossPercent = 0;
let droppedPackets = 0;
let processedEventCount = 0;
let processedRoleSwapCount = 0;

connectButton.addEventListener("click", connect);
leaveButton.addEventListener("click", () => room?.leave(true));
applyNetworkButton.addEventListener("click", applyNetworkConditions);
window.addEventListener("keydown", updateHeldKey);
window.addEventListener("keyup", updateHeldKey);
window.addEventListener("blur", () => {
  heldKeys.clear();
  pressedEdges.clear();
});
window.addEventListener("beforeunload", () => room?.leave(true));

window.__networkTest = {
  connect,
  leave: () => room?.leave(true),
  setNetworkConditions({ latency = 0, jitter = 0, loss = 0 } = {}) {
    latencyMs.value = String(latency);
    jitterMs.value = String(jitter);
    lossPercent.value = String(loss);
    applyNetworkConditions();
  },
  get room() { return room; },
  get input() { return input; },
  getPlayerSnapshot: snapshotPlayers,
  getCombatSnapshot: snapshotCombat,
  getEventStats: () => ({
    processed: processedEventCount,
    roleSwaps: processedRoleSwapCount,
    counts: Object.fromEntries(eventCounts),
  }),
};

async function connect() {
  if (room) return room;
  setConnection("connecting", "正在连接……");
  connectButton.disabled = true;
  try {
    const client = new Colyseus.Client(serverUrl.value.trim());
    room = await client.joinOrCreate("battle");
    roomId.textContent = room.roomId;
    document.body.dataset.roomId = room.roomId;

    room.onMessage("gameEvent", handleGameEvent);
    room.onLeave(() => resetConnection("已离开房间"));
    room.onError((code, message) => setConnection("error", "错误 " + code + "：" + message));

    ownPlayer = await waitForOwnPlayer(room);
    predict = Colyseus.Predict.get(room, {
      mode: "lerp",
      delay: NETWORK_INTERPOLATION_DELAY,
      name: "寿数回战 N3",
    });
    detachRemoteSmoothing = predict.attachAll("players", {
      mode: "lerp",
      fields: ["x", "y"],
      delay: NETWORK_INTERPOLATION_DELAY,
      smoothMs: 25,
    });

    input = room.input({ mode: "unreliable", historySize: 4 });
    if (!input.tickRate || !input.stepSeconds) {
      throw new Error("服务器未公布固定 tickRate，无法启用预测");
    }

    ownController = predict.reconciler(ownPlayer, {
      input,
      fields: ["x", "y", "velocityX", "velocityY"],
      step: (stepContext, state, command) => {
        applyNetworkInput(state, command, stepContext.dt);
      },
      smoothMs: NETWORK_CORRECTION_SMOOTH_MS,
    });

    leaveButton.disabled = false;
    setConnection("connected", "已连接；服务器权威战斗与本地移动预测已启用");
    animationFrameId = requestAnimationFrame(frame);
    return room;
  } catch (error) {
    teardownPrediction();
    room = null;
    connectButton.disabled = false;
    setConnection("error", "连接失败：" + (error.message ?? error));
    throw error;
  }
}

function frame(now) {
  if (!room || !predict || !input) return;
  const steps = predict.tick(now);
  for (let index = 0; index < steps; index += 1) sendInputFrame();
  render();
  animationFrameId = requestAnimationFrame(frame);
}

function sendInputFrame() {
  const axis = readMovementAxis();
  input.data.clientSeq = input.sentCount + 1;
  input.data.moveX = axis.x;
  input.data.moveY = axis.y;
  input.data.dashPressed = pressedEdges.has("dash");
  input.data.shouDown = heldKeys.has("KeyF") || heldKeys.has("KeyK");
  input.data.shouPressed = pressedEdges.has("shou");
  input.data.niuPressed = pressedEdges.has("niu");
  if (Math.random() * 100 < packetLossPercent) {
    droppedPackets += 1;
    return;
  }
  input.send();
  pressedEdges.clear();
}

function updateHeldKey(event) {
  const action = actionForCode(event.code);
  if (!movementCode(event.code) && !action) return;
  event.preventDefault();
  if (event.type === "keydown") {
    if (!heldKeys.has(event.code) && action) pressedEdges.add(action);
    heldKeys.add(event.code);
  } else {
    heldKeys.delete(event.code);
  }
}

function readMovementAxis() {
  return {
    x: Number(heldKeys.has("KeyD") || heldKeys.has("ArrowRight"))
      - Number(heldKeys.has("KeyA") || heldKeys.has("ArrowLeft")),
    y: Number(heldKeys.has("KeyS") || heldKeys.has("ArrowDown"))
      - Number(heldKeys.has("KeyW") || heldKeys.has("ArrowUp")),
  };
}

function movementCode(code) {
  return [
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight",
  ].includes(code);
}

function actionForCode(code) {
  if (["KeyF", "KeyK"].includes(code)) return "shou";
  if (["KeyG", "KeyL"].includes(code)) return "niu";
  if (["ShiftLeft", "ShiftRight"].includes(code)) return "dash";
  return null;
}

function snapshotPlayers() {
  const players = [];
  room?.state?.players?.forEach((player, sessionId) => {
    players.push({
      sessionId,
      playerNumber: player.playerNumber,
      rawX: player.x,
      rawY: player.y,
      x: predict ? predict.value(player, "x") : player.x,
      y: predict ? predict.value(player, "y") : player.y,
      lastInputSeq: player.lastInputSeq,
    });
  });
  return players;
}

function snapshotCombat() {
  if (!room?.state) return null;
  const players = [...(room.state.players?.values?.() ?? [])]
    .sort((first, second) => first.playerNumber - second.playerNumber);
  return {
    matchStarted: room.state.matchStarted,
    matchEpoch: room.state.matchEpoch,
    combatState: room.state.combatState,
    attackerNumber: room.state.attackerNumber,
    defenderNumber: room.state.defenderNumber,
    attackKind: room.state.attackKind,
    roundRemaining: room.state.roundRemaining,
    lockProgress: room.state.lockProgress,
    roleRevision: room.state.roleRevision,
    lastEventId: room.state.lastEventId,
    life: players.map((player) => player.life),
  };
}

function handleGameEvent(event) {
  if (!eventDeduplicator.accept(event)) return;
  processedEventCount += 1;
  eventCounts.set(event.type, (eventCounts.get(event.type) ?? 0) + 1);
  if (event.type === "roleSwap") processedRoleSwapCount += 1;
  lastEvent.textContent = "#" + event.id + " " + describeEvent(event);
  document.body.dataset.lastEventId = String(event.id);
  document.body.dataset.processedEvents = String(processedEventCount);
  document.body.dataset.processedRoleSwaps = String(processedRoleSwapCount);

  if (event.type === "callout") {
    calloutOverlay.hidden = false;
    calloutOverlay.textContent = event.kind === "bull" ? "牛来！" : "寿来！";
  } else if (event.type === "outcome") {
    calloutOverlay.hidden = false;
    calloutOverlay.textContent = describeOutcome(event.outcome);
  } else if (event.type === "roleSwap" || event.type === "cancelLock") {
    calloutOverlay.hidden = true;
  }
}

function describeEvent(event) {
  if (event.type === "callout") return event.kind === "bull" ? "牛来" : "寿来";
  if (event.type === "outcome") return describeOutcome(event.outcome);
  if (event.type === "roleSwap") return "攻守交换 → P" + (event.attackerIndex + 1);
  if (event.type === "reactionOpened") return "回应窗口";
  if (event.type === "roundOver") return event.winnerIndex == null ? "平局" : "P" + (event.winnerIndex + 1) + " 获胜";
  return event.type;
}

function describeOutcome(outcome) {
  const labels = {
    perfect: "完美寿回",
    reflect: "寿回",
    bullReflect: "妈妈！神牛反撞",
    early: "抢答失败",
    timeout: "回应超时",
    bullTimeout: "没喊妈妈",
    bullStun: "牛头眩晕",
    family: "认亲硬直",
  };
  return labels[outcome?.type] ?? outcome?.type ?? "结算";
}

function render() {
  if (!room?.state?.players) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawArena();

  ownPlayer = room.state.players.get(room.sessionId) ?? ownPlayer;
  const players = snapshotPlayers();
  for (const player of players) {
    context.beginPath();
    context.arc(player.x, player.y, 34, 0, Math.PI * 2);
    context.fillStyle = colors[player.playerNumber] ?? "#fff";
    context.fill();
    context.lineWidth = player.sessionId === room.sessionId ? 6 : 2;
    context.strokeStyle = player.sessionId === room.sessionId ? "#fff4c4" : "#101318";
    context.stroke();
    context.fillStyle = "#101318";
    context.font = "700 24px system-ui";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("P" + player.playerNumber, player.x, player.y);
  }

  const ownSnapshot = players.find((player) => player.sessionId === room.sessionId);
  const correctionDistance = ownSnapshot
    ? Math.hypot(ownSnapshot.x - ownSnapshot.rawX, ownSnapshot.y - ownSnapshot.rawY)
    : 0;
  const rttValue = typeof room.clock?.smoothedRtt === "function"
    ? room.clock.smoothedRtt()
    : (room.clock?.rtt?.() ?? 0);

  playerCount.textContent = players.length + " / 2";
  playerNumber.textContent = ownPlayer ? "P" + ownPlayer.playerNumber : "同步中";
  inputStats.textContent = input
    ? input.sentCount + " / " + input.lastProcessed + "（待 " + input.pendingCount + "，丢 " + droppedPackets + "）"
    : "0 / 0";
  rtt.textContent = Math.round(rttValue) + " ms";
  correction.textContent = correctionDistance.toFixed(1) + " px";
  const combat = snapshotCombat();
  combatState.textContent = combat?.combatState ?? "WAITING";
  roles.textContent = combat?.matchStarted
    ? "P" + combat.attackerNumber + " 攻 / P" + combat.defenderNumber + " 守"
    : "等待第二名玩家";
  life.textContent = combat?.life?.length === 2
    ? combat.life[0].toFixed(0) + " / " + combat.life[1].toFixed(0)
    : "60 / 60";
  lockProgress.textContent = Math.round((combat?.lockProgress ?? 0) * 100) + "%";

  document.body.dataset.playerNumber = ownPlayer ? String(ownPlayer.playerNumber) : "";
  document.body.dataset.playerCount = String(players.length);
  document.body.dataset.rawX = ownSnapshot ? String(ownSnapshot.rawX) : "";
  document.body.dataset.renderX = ownSnapshot ? String(ownSnapshot.x) : "";
  document.body.dataset.sentInput = input ? String(input.sentCount) : "0";
  document.body.dataset.ackedInput = input ? String(input.lastProcessed) : "0";
  document.body.dataset.pendingInput = input ? String(input.pendingCount) : "0";
  document.body.dataset.serverTick = String(room.state.serverTick ?? 0);
  document.body.dataset.correction = String(correctionDistance);
  document.body.dataset.droppedPackets = String(droppedPackets);
  document.body.dataset.combatState = combat?.combatState ?? "WAITING";
  document.body.dataset.attackerNumber = String(combat?.attackerNumber ?? 0);
  document.body.dataset.lifeP1 = String(combat?.life?.[0] ?? 60);
  document.body.dataset.lifeP2 = String(combat?.life?.[1] ?? 60);
  document.body.dataset.lockProgress = String(combat?.lockProgress ?? 0);
  document.body.dataset.roleRevision = String(combat?.roleRevision ?? 0);
}

function drawArena() {
  context.fillStyle = "#202a31";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#34424c";
  context.lineWidth = 1;
  for (let x = 40; x < canvas.width; x += 80) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 40; y < canvas.height; y += 80) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }
  context.beginPath();
  context.arc(640, 422, 54, 0, Math.PI * 2);
  context.fillStyle = "#555f68";
  context.fill();
  context.strokeStyle = "#87919a";
  context.stroke();
}

function applyNetworkConditions() {
  const latency = clampNumber(latencyMs.value, 0, 500);
  const jitter = clampNumber(jitterMs.value, 0, 200);
  packetLossPercent = clampNumber(lossPercent.value, 0, 100);
  latencyMs.value = String(latency);
  jitterMs.value = String(jitter);
  lossPercent.value = String(packetLossPercent);
  globalThis.__net?.(latency, jitter);
  setConnection(
    room ? "connected" : "idle",
    "网络模拟：RTT " + latency + "±" + jitter + " ms，上行丢包 " + packetLossPercent + "%",
  );
}

async function waitForOwnPlayer(activeRoom) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const player = activeRoom.state?.players?.get(activeRoom.sessionId);
    if (player) return player;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("等待服务器玩家状态超时");
}

function teardownPrediction() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = 0;
  detachRemoteSmoothing?.();
  ownController?.dispose?.();
  predict?.dispose?.();
  detachRemoteSmoothing = null;
  ownController = null;
  predict = null;
  input = null;
  ownPlayer = null;
  heldKeys.clear();
  pressedEdges.clear();
  droppedPackets = 0;
  eventDeduplicator.reset();
  eventCounts.clear();
  processedEventCount = 0;
  processedRoleSwapCount = 0;
}

function setConnection(value, message) {
  document.body.dataset.connection = value;
  status.textContent = message;
}

function resetConnection(message) {
  teardownPrediction();
  room = null;
  connectButton.disabled = false;
  leaveButton.disabled = true;
  roomId.textContent = "—";
  playerNumber.textContent = "—";
  playerCount.textContent = "0 / 2";
  inputStats.textContent = "0 / 0";
  rtt.textContent = "0 ms";
  correction.textContent = "0 px";
  combatState.textContent = "WAITING";
  roles.textContent = "—";
  life.textContent = "60 / 60";
  lockProgress.textContent = "0%";
  lastEvent.textContent = "—";
  calloutOverlay.hidden = true;
  document.body.dataset.roomId = "";
  document.body.dataset.playerNumber = "";
  document.body.dataset.playerCount = "0";
  setConnection("left", message);
  drawArena();
}

function clampNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : minimum));
}

drawArena();
