import {
  NETWORK_CORRECTION_SMOOTH_MS,
  NETWORK_INTERPOLATION_DELAY,
  applyNetworkInput,
} from "../../shared/NetworkMovement.js";
import { NetworkEventDeduplicator } from "../../shared/NetworkEventDeduplicator.js";
import {
  classifyNetworkQuality,
  scheduledServerDelay,
} from "../../shared/NetworkTiming.js";
import {
  NETWORK_PROTOCOL_VERSION,
  RECONNECTION_GRACE_MS,
  ROOM_PHASES,
  isValidRoomCode,
  normalizeRoomCode,
  roomJoinErrorKey,
} from "../../shared/PrivateRoom.js";

const canvas = document.querySelector("#arena");
const context = canvas.getContext("2d");
const serverUrl = document.querySelector("#server-url");
const connectButton = document.querySelector("#connect");
const joinButton = document.querySelector("#join-room");
const leaveButton = document.querySelector("#leave");
const readyButton = document.querySelector("#ready");
const rematchButton = document.querySelector("#rematch");
const copyRoomCodeButton = document.querySelector("#copy-room-code");
const roomCodeInput = document.querySelector("#room-code-input");
const roomCodeDisplay = document.querySelector("#room-code-display");
const lobbyPanel = document.querySelector("#lobby-panel");
const roomPanel = document.querySelector("#room-panel");
const lobbyError = document.querySelector("#lobby-error");
const roomSummary = document.querySelector("#room-summary");
const reconnectNotice = document.querySelector("#reconnect-notice");
const countdown = document.querySelector("#countdown");
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
let calloutTimer = 0;
const calloutPlaybackLog = [];
const RECONNECT_STORAGE_KEY = "shoushu-kaisen:n6:reconnect";
let intentionalLeave = false;
let localReconnectDeadline = 0;

connectButton.addEventListener("click", () => connect().catch(() => {}));
joinButton.addEventListener("click", () => joinPrivateRoom().catch(() => {}));
leaveButton.addEventListener("click", leaveRoom);
readyButton.addEventListener("click", () => room?.send("ready", true));
rematchButton.addEventListener("click", () => room?.send("rematch", true));
copyRoomCodeButton.addEventListener("click", copyRoomCode);
roomCodeInput.addEventListener("input", () => {
  roomCodeInput.value = normalizeRoomCode(roomCodeInput.value).slice(0, 4);
});
applyNetworkButton.addEventListener("click", applyNetworkConditions);
window.addEventListener("keydown", updateHeldKey);
window.addEventListener("keyup", updateHeldKey);
window.addEventListener("blur", () => {
  heldKeys.clear();
  pressedEdges.clear();
});
window.addEventListener("pagehide", persistPageDrop);

window.__networkTest = {
  connect,
  createPrivateRoom: connect,
  joinPrivateRoom,
  leave: leaveRoom,
  ready: () => room?.send("ready", true),
  rematch: () => room?.send("rematch", true),
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
  getClockSnapshot: snapshotClock,
  getCalloutPlayback: () => calloutPlaybackLog.map((entry) => ({ ...entry })),
  forceDrop: () => { room?.leave(false); },
  getReconnectRecord: loadReconnectRecord,
};

async function connect() {
  return connectToRoom((client) => client.create("battle", {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
  }), "正在创建私人房间……");
}

async function joinPrivateRoom(code = roomCodeInput.value) {
  const normalized = normalizeRoomCode(code);
  roomCodeInput.value = normalized;
  if (!isValidRoomCode(normalized)) {
    showLobbyError("invalidCode");
    throw new Error("INVALID_ROOM_CODE");
  }
  try {
    await inspectPrivateRoom(normalized);
  } catch (error) {
    showLobbyError(roomJoinErrorKey(error));
    setConnection("error", "无法进入房间");
    throw error;
  }
  return connectToRoom((client) => client.joinById(normalized, {
    protocolVersion: NETWORK_PROTOCOL_VERSION,
  }), "正在加入房间 " + normalized + "……");
}

async function connectToRoom(join, message) {
  if (room) return room;
  clearLobbyError();
  setConnection("connecting", message);
  connectButton.disabled = true;
  joinButton.disabled = true;
  try {
    const client = new Colyseus.Client(serverUrl.value.trim());
    const joinedRoom = await join(client);
    return await activateRoom(joinedRoom, "已进入私人房间；等待双方准备");
  } catch (error) {
    teardownPrediction();
    room = null;
    connectButton.disabled = false;
    joinButton.disabled = false;
    showLobbyError(roomJoinErrorKey(error));
    setConnection("error", "无法进入房间");
    throw error;
  }
}

async function activateRoom(joinedRoom, connectedMessage) {
  room = joinedRoom;
  intentionalLeave = false;
  localReconnectDeadline = 0;
  room.reconnection.minUptime = 0;
  room.reconnection.maxRetries = 20;
  room.reconnection.maxDelay = 1000;
  roomId.textContent = room.roomId;
  roomCodeDisplay.textContent = room.roomId;
  document.body.dataset.roomId = room.roomId;

  room.onMessage("gameEvent", handleGameEvent);
  room.onMessage("roomStatus", () => {});
  room.onDrop(() => handleRoomDrop(joinedRoom));
  room.onReconnect(() => handleRoomReconnect(joinedRoom));
  room.onLeave((code, reason) => handleRoomLeave(joinedRoom, code, reason));
  room.onError((code, message) => handleRoomError(joinedRoom, code, message));

  try {
    ownPlayer = await waitForOwnPlayer(room);
    predict = Colyseus.Predict.get(room, {
      mode: "lerp",
      delay: NETWORK_INTERPOLATION_DELAY,
      name: "寿数回战 N6",
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

    lobbyPanel.hidden = true;
    roomPanel.hidden = false;
    reconnectNotice.hidden = true;
    saveReconnectRecord(room);
    restoreCalloutFromState();
    setConnection("connected", connectedMessage);
    animationFrameId = requestAnimationFrame(frame);
    return room;
  } catch (error) {
    clearReconnectRecord();
    intentionalLeave = true;
    joinedRoom.leave(true).catch(() => {});
    teardownPrediction();
    room = null;
    connectButton.disabled = false;
    joinButton.disabled = false;
    showLobbyError(roomJoinErrorKey(error));
    setConnection("error", "无法进入房间");
    throw error;
  }
}

function handleRoomDrop(activeRoom) {
  if (activeRoom !== room || intentionalLeave) return;
  heldKeys.clear();
  pressedEdges.clear();
  clearScheduledCallout();
  localReconnectDeadline = Date.now() + RECONNECTION_GRACE_MS;
  reconnectNotice.hidden = false;
  reconnectNotice.textContent = "网络连接中断，正在自动重连……";
  setConnection("reconnecting", "连接中断；正在保留原座位并自动重连");
}

function handleRoomReconnect(activeRoom) {
  if (activeRoom !== room) return;
  localReconnectDeadline = 0;
  reconnectNotice.hidden = true;
  saveReconnectRecord(activeRoom);
  setConnection("connected", "重连成功；权威状态已恢复");
  window.setTimeout(restoreCalloutFromState, 0);
}

function handleRoomLeave(activeRoom, code, reason) {
  if (activeRoom !== room) return;
  const consented = intentionalLeave || code === 4000;
  clearReconnectRecord();
  resetConnection(consented ? "已返回大厅" : "连接已结束");
  intentionalLeave = false;
  if (!consented) {
    const errorKey = code === 4003 ? "reconnectExpired" : "serverRejected";
    showLobbyError(errorKey);
    setConnection("error", code === 4003
      ? "重连时限已结束，座位已释放"
      : "连接被服务器终止" + (reason ? "：" + reason : ""));
  }
}

function handleRoomError(activeRoom, code, message) {
  if (activeRoom !== room) return;
  setConnection("error", "错误 " + code + "：" + message);
}

function frame(now) {
  if (!room || !predict || !input) return;
  const steps = predict.tick(now);
  for (let index = 0; index < steps; index += 1) sendInputFrame();
  render();
  animationFrameId = requestAnimationFrame(frame);
}

function sendInputFrame() {
  const playing = room?.state?.roomPhase === ROOM_PHASES.playing;
  const axis = playing ? readMovementAxis() : { x: 0, y: 0 };
  input.data.clientSeq = input.sentCount + 1;
  input.data.moveX = axis.x;
  input.data.moveY = axis.y;
  input.data.dashPressed = playing && pressedEdges.has("dash");
  input.data.shouDown = playing && (heldKeys.has("KeyF") || heldKeys.has("KeyK"));
  input.data.shouPressed = playing && pressedEdges.has("shou");
  input.data.niuPressed = playing && pressedEdges.has("niu");
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
      connected: player.connected,
      ready: player.ready,
      rematch: player.rematch,
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
    protocolVersion: room.state.protocolVersion,
    roomCode: room.state.roomCode,
    roomPhase: room.state.roomPhase,
    matchStartAtMs: room.state.matchStartAtMs,
    countdownDurationMs: room.state.countdownDurationMs,
    pausedFromPhase: room.state.pausedFromPhase,
    disconnectedPlayerNumber: room.state.disconnectedPlayerNumber,
    reconnectDeadlineAtMs: room.state.reconnectDeadlineAtMs,
    matchEpoch: room.state.matchEpoch,
    combatState: room.state.combatState,
    attackerNumber: room.state.attackerNumber,
    defenderNumber: room.state.defenderNumber,
    attackKind: room.state.attackKind,
    roundRemaining: room.state.roundRemaining,
    lockProgress: room.state.lockProgress,
    lineOfSightClear: room.state.lineOfSightClear,
    roleRevision: room.state.roleRevision,
    lastEventId: room.state.lastEventId,
    calloutPlayAtMs: room.state.calloutPlayAtMs,
    reactionOpenedAtMs: room.state.reactionOpenedAtMs,
    reactionDeadlineAtMs: room.state.reactionDeadlineAtMs,
    reactionGraceDeadlineAtMs: room.state.reactionGraceDeadlineAtMs,
    life: players.map((player) => player.life),
  };
}

function snapshotClock() {
  if (!room?.clock) return null;
  const rttValue = room.clock.smoothedRtt();
  const jitterValue = room.clock.jitter();
  const serverNow = room.clock.serverNow();
  const localNow = room.clock.now();
  const quality = classifyNetworkQuality(rttValue, jitterValue);
  return {
    serverNow,
    localNow,
    offsetMs: serverNow - localNow,
    rttMs: rttValue,
    jitterMs: jitterValue,
    quality: quality.key,
    qualityLabel: quality.label,
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
    scheduleCallout(event);
  } else if (event.type === "outcome") {
    clearScheduledCallout();
    calloutOverlay.hidden = false;
    calloutOverlay.textContent = describeOutcome(event.outcome);
  } else if (event.type === "roleSwap" || event.type === "cancelLock") {
    clearScheduledCallout();
    calloutOverlay.hidden = true;
  }
}

function scheduleCallout(event) {
  clearScheduledCallout();
  const delay = scheduledServerDelay(event.playAtServerMs, room.clock.serverNow());
  calloutTimer = window.setTimeout(() => {
    calloutTimer = 0;
    const displayedAtServerMs = room.clock.serverNow();
    calloutOverlay.hidden = false;
    calloutOverlay.textContent = event.kind === "bull" ? "牛来！" : "寿来！";
    const playback = {
      eventId: event.id,
      kind: event.kind,
      targetServerMs: event.playAtServerMs,
      displayedAtServerMs,
      errorMs: displayedAtServerMs - event.playAtServerMs,
    };
    calloutPlaybackLog.push(playback);
    if (calloutPlaybackLog.length > 16) calloutPlaybackLog.shift();
    document.body.dataset.lastCalloutEventId = String(event.id);
    document.body.dataset.calloutPlaybackError = String(playback.errorMs);
  }, delay);
}

function clearScheduledCallout() {
  if (calloutTimer) window.clearTimeout(calloutTimer);
  calloutTimer = 0;
}

function restoreCalloutFromState() {
  if (!room?.state || !["CALLOUT", "REACTION_WINDOW"].includes(room.state.combatState)) return;
  clearScheduledCallout();
  const show = () => {
    calloutTimer = 0;
    calloutOverlay.hidden = false;
    calloutOverlay.textContent = room.state.attackKind === "bull" ? "牛来！" : "寿来！";
  };
  const delay = scheduledServerDelay(room.state.calloutPlayAtMs, room.clock.serverNow());
  if (delay <= 0) show();
  else calloutTimer = window.setTimeout(show, delay);
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
  const clock = snapshotClock();

  playerCount.textContent = players.length + " / 2";
  playerNumber.textContent = ownPlayer ? "P" + ownPlayer.playerNumber : "同步中";
  inputStats.textContent = input
    ? input.sentCount + " / " + input.lastProcessed + "（待 " + input.pendingCount + "，丢 " + droppedPackets + "）"
    : "0 / 0";
  rtt.textContent = clock?.qualityLabel ?? "同步中";
  correction.textContent = correctionDistance.toFixed(1) + " px";
  const combat = snapshotCombat();
  renderRoomState(players, combat);
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
  document.body.dataset.roomPhase = combat?.roomPhase ?? ROOM_PHASES.waiting;
  document.body.dataset.ownReady = String(Boolean(ownSnapshot?.ready));
  document.body.dataset.opponentReady = String(Boolean(
    players.find((player) => player.sessionId !== room.sessionId)?.ready,
  ));
  document.body.dataset.disconnectedPlayerNumber = String(
    combat?.disconnectedPlayerNumber ?? 0,
  );
  document.body.dataset.reconnectRemainingMs = String(reconnectRemainingMs(combat));
  document.body.dataset.networkQuality = clock?.quality ?? "syncing";
  document.body.dataset.rttMs = String(clock?.rttMs ?? 0);
  document.body.dataset.jitterMs = String(clock?.jitterMs ?? 0);
  document.body.dataset.clockOffsetMs = String(clock?.offsetMs ?? 0);
}

function renderRoomState(players, combat) {
  const phase = combat?.roomPhase ?? ROOM_PHASES.waiting;
  const own = players.find((player) => player.sessionId === room.sessionId);
  const opponent = players.find((player) => player.sessionId !== room.sessionId);
  readyButton.hidden = phase !== ROOM_PHASES.waiting;
  rematchButton.hidden = phase !== ROOM_PHASES.results;
  countdown.hidden = phase !== ROOM_PHASES.countdown;
  updateReconnectNotice(combat);

  if (phase === ROOM_PHASES.waiting) {
    readyButton.disabled = Boolean(own?.ready);
    readyButton.textContent = own?.ready ? "已准备，等待对方" : "我准备好了";
    roomSummary.textContent = !opponent
      ? "等待朋友输入房间码加入"
      : "你" + (own?.ready ? "已准备" : "未准备")
        + " · 对方" + (opponent.ready ? "已准备" : "未准备");
  } else if (phase === ROOM_PHASES.countdown) {
    const remaining = Math.max(0, (combat.matchStartAtMs ?? 0) - room.clock.serverNow());
    countdown.textContent = remaining > 0 ? String(Math.max(1, Math.ceil(remaining / 1000))) : "开战！";
    roomSummary.textContent = "双方已准备，正在同步开局时间";
  } else if (phase === ROOM_PHASES.playing) {
    roomSummary.textContent = "对局进行中";
  } else if (phase === ROOM_PHASES.paused) {
    const disconnected = combat?.disconnectedPlayerNumber ?? 0;
    const ownDisconnected = disconnected === own?.playerNumber;
    roomSummary.textContent = ownDisconnected
      ? "连接中断，服务器正在保留你的原座位"
      : "P" + disconnected + " 连接中断，对局已暂停";
  } else if (phase === ROOM_PHASES.results) {
    rematchButton.disabled = Boolean(own?.rematch);
    rematchButton.textContent = own?.rematch ? "已同意，等待对方" : "再来一局";
    roomSummary.textContent = "本局结束 · 你" + (own?.rematch ? "已同意重赛" : "尚未选择")
      + " · 对方" + (opponent?.rematch ? "已同意重赛" : "尚未选择");
  }
}

function updateReconnectNotice(combat) {
  const reconnectingLocally = document.body.dataset.connection === "reconnecting";
  const paused = combat?.roomPhase === ROOM_PHASES.paused;
  if (!reconnectingLocally && !paused) {
    reconnectNotice.hidden = true;
    return;
  }
  const remaining = reconnectRemainingMs(combat);
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  reconnectNotice.hidden = false;
  reconnectNotice.textContent = reconnectingLocally
    ? "正在自动重连，原座位最多保留 " + seconds + " 秒"
    : "P" + (combat?.disconnectedPlayerNumber ?? "?")
      + " 掉线，对局暂停；等待重连 " + seconds + " 秒";
}

function reconnectRemainingMs(combat) {
  if (combat?.reconnectDeadlineAtMs > 0 && room?.clock) {
    return Math.max(0, combat.reconnectDeadlineAtMs - room.clock.serverNow());
  }
  return Math.max(0, localReconnectDeadline - Date.now());
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

async function inspectPrivateRoom(code) {
  const base = serverUrl.value.trim()
    .replace(/^ws:/i, "http:")
    .replace(/^wss:/i, "https:")
    .replace(/\/$/, "");
  const response = await fetch(base + "/rooms/" + encodeURIComponent(code), {
    cache: "no-store",
  });
  if (response.status === 404) throw new Error("ROOM_NOT_FOUND");
  if (!response.ok) throw new Error("ROOM_LOOKUP_FAILED");
  const result = await response.json();
  if (result.protocolVersion !== NETWORK_PROTOCOL_VERSION) throw new Error("VERSION_MISMATCH");
  if (result.roomPhase !== ROOM_PHASES.waiting) throw new Error("MATCH_STARTED");
  if (result.playerCount >= result.maxClients) throw new Error("ROOM_FULL");
  return result;
}

async function copyRoomCode() {
  const code = room?.roomId;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const inputElement = document.createElement("input");
    inputElement.value = code;
    inputElement.setAttribute("readonly", "");
    document.body.append(inputElement);
    inputElement.select();
    document.execCommand("copy");
    inputElement.remove();
  }
  copyRoomCodeButton.textContent = "已复制 " + code;
  window.setTimeout(() => { copyRoomCodeButton.textContent = "复制邀请"; }, 1400);
}

function leaveRoom() {
  if (!room) return;
  intentionalLeave = true;
  clearReconnectRecord();
  room.leave(true).catch(() => {
    intentionalLeave = false;
  });
}

function showLobbyError(key) {
  const messages = {
    invalidCode: "房间码应为四位字母或数字，不使用 0/O、1/I/L。",
    roomNotFound: "没有找到这个房间。请检查房间码，或请创建者重新复制。",
    roomFull: "这个房间已经坐满两人。",
    matchStarted: "这个房间的比赛已经开始，暂时不能加入。",
    versionMismatch: "双方游戏版本不一致，请刷新页面后再试。",
    reconnectExpired: "重连时限已结束，原座位已经释放。请重新创建或加入房间。",
    serverRejected: "服务器终止了本次连接，请返回大厅后重试。",
    unknown: "无法加入房间，请检查服务器地址和网络后重试。",
  };
  lobbyError.hidden = false;
  lobbyError.dataset.error = key;
  lobbyError.textContent = messages[key] ?? messages.unknown;
}

function clearLobbyError() {
  lobbyError.hidden = true;
  lobbyError.dataset.error = "";
  lobbyError.textContent = "";
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
  clearScheduledCallout();
  calloutPlaybackLog.length = 0;
}

function setConnection(value, message) {
  document.body.dataset.connection = value;
  status.textContent = message;
}

function resetConnection(message) {
  teardownPrediction();
  room = null;
  connectButton.disabled = false;
  joinButton.disabled = false;
  lobbyPanel.hidden = false;
  roomPanel.hidden = true;
  roomCodeDisplay.textContent = "—";
  readyButton.disabled = false;
  readyButton.textContent = "我准备好了";
  rematchButton.hidden = true;
  countdown.hidden = true;
  reconnectNotice.hidden = true;
  roomId.textContent = "—";
  playerNumber.textContent = "—";
  playerCount.textContent = "0 / 2";
  inputStats.textContent = "0 / 0";
  rtt.textContent = "同步中";
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
  document.body.dataset.roomPhase = ROOM_PHASES.waiting;
  document.body.dataset.disconnectedPlayerNumber = "0";
  document.body.dataset.reconnectRemainingMs = "0";
  setConnection("left", message);
  drawArena();
}

function saveReconnectRecord(activeRoom, droppedAt = 0) {
  if (!activeRoom?.reconnectionToken) return;
  try {
    sessionStorage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify({
      token: activeRoom.reconnectionToken,
      serverUrl: serverUrl.value.trim(),
      roomId: activeRoom.roomId,
      droppedAt,
    }));
  } catch {
    // sessionStorage may be unavailable; the in-memory automatic path still works.
  }
}

function loadReconnectRecord() {
  try {
    const record = JSON.parse(sessionStorage.getItem(RECONNECT_STORAGE_KEY) ?? "null");
    if (!record?.token || !record?.serverUrl) return null;
    return record;
  } catch {
    return null;
  }
}

function clearReconnectRecord() {
  try {
    sessionStorage.removeItem(RECONNECT_STORAGE_KEY);
  } catch {
    // Nothing else to clean up.
  }
}

function persistPageDrop() {
  if (!room || intentionalLeave) return;
  saveReconnectRecord(room, Date.now());
}

async function resumeSavedRoom() {
  const saved = loadReconnectRecord();
  if (!saved) return null;
  if (saved.droppedAt && Date.now() - saved.droppedAt >= RECONNECTION_GRACE_MS) {
    clearReconnectRecord();
    showLobbyError("reconnectExpired");
    return null;
  }

  serverUrl.value = saved.serverUrl;
  clearLobbyError();
  connectButton.disabled = true;
  joinButton.disabled = true;
  localReconnectDeadline = (saved.droppedAt || Date.now()) + RECONNECTION_GRACE_MS;
  setConnection("reconnecting", "检测到刷新前的对局，正在取回原座位……");
  reconnectNotice.hidden = false;
  reconnectNotice.textContent = "正在恢复房间 " + (saved.roomId ?? "") + "……";

  const deadline = localReconnectDeadline;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const client = new Colyseus.Client(saved.serverUrl);
      const reconnectedRoom = await client.reconnect(saved.token);
      return await activateRoom(reconnectedRoom, "刷新后重连成功；权威状态已恢复");
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  clearReconnectRecord();
  connectButton.disabled = false;
  joinButton.disabled = false;
  showLobbyError("reconnectExpired");
  setConnection("error", "重连时限已结束，座位已释放");
  throw lastError ?? new Error("RECONNECT_EXPIRED");
}

function clampNumber(value, minimum, maximum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : minimum));
}

const initialRoomCode = normalizeRoomCode(new URLSearchParams(location.search).get("room"));
if (isValidRoomCode(initialRoomCode)) roomCodeInput.value = initialRoomCode;
drawArena();
resumeSavedRoom().catch(() => {});
