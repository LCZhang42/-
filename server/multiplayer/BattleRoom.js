import { Room, ServerError } from "@colyseus/core";
import { ARENA_CONFIG, COMBAT_CONFIG, LOCK_CONFIG, MOVEMENT_CONFIG, PLAYER_CONFIGS } from "../../shared/BalanceConfig.js";
import { NETWORK_TICK_RATE } from "../../shared/NetworkMovement.js";
import {
  NETWORK_TIMING_CONFIG,
  evaluateReactionTimestamp,
} from "../../shared/NetworkTiming.js";
import { SimulationCore, emptySimulationCommand } from "../../shared/SimulationCore.js";
import {
  NETWORK_PROTOCOL_VERSION,
  RECONNECTION_GRACE_SECONDS,
  ROOM_PHASES,
  generateRoomCode,
  normalizeRoomCode,
} from "../../shared/PrivateRoom.js";
import { BattleState, MoveInput, PlayerState } from "./schema/BattleState.js";

const SPAWNS = Object.freeze({
  1: Object.freeze({ x: 350, y: 438 }),
  2: Object.freeze({ x: 930, y: 438 }),
});

const diagnostics = {
  created: 0,
  disposed: 0,
  joins: 0,
  leaves: 0,
  activeRoomIds: new Set(),
  activeRooms: new Map(),
};

const COUNTDOWN_DURATION_MS = 3000;

export function getBattleRoomDiagnostics() {
  return {
    created: diagnostics.created,
    disposed: diagnostics.disposed,
    joins: diagnostics.joins,
    leaves: diagnostics.leaves,
    activeRoomIds: [...diagnostics.activeRoomIds],
  };
}

export function resetBattleRoomDiagnostics() {
  diagnostics.created = 0;
  diagnostics.disposed = 0;
  diagnostics.joins = 0;
  diagnostics.leaves = 0;
  diagnostics.activeRoomIds.clear();
  diagnostics.activeRooms.clear();
}

export function getPrivateRoomStatus(roomCode) {
  const room = diagnostics.activeRooms.get(normalizeRoomCode(roomCode));
  if (!room) return null;
  return {
    roomCode: room.roomId,
    protocolVersion: room.state.protocolVersion,
    roomPhase: room.state.roomPhase,
    playerCount: room.state.players.size,
    maxClients: room.maxClients,
    disconnectedPlayerNumber: room.state.disconnectedPlayerNumber,
    reconnectDeadlineAtMs: room.state.reconnectDeadlineAtMs,
  };
}

export class BattleRoom extends Room {
  maxClients = 2;
  autoDispose = true;
  patchRate = 50;
  state = new BattleState({
    matchStarted: false,
    matchEpoch: 0,
    combatState: "WAITING",
    stateTimeRemaining: 0,
    roundRemaining: COMBAT_CONFIG.roundDuration,
    attackerNumber: 0,
    defenderNumber: 0,
    attackKind: "shou",
    safeTimeRemaining: 0,
    hitStopRemaining: 0,
    lockProgress: 0,
    lockRecoveryRemaining: 0,
    lockIsValid: false,
    lockIsReady: false,
    lineOfSightClear: false,
    roleRevision: 0,
    lastEventId: 0,
    winnerNumber: 0,
    forceBullTokens: false,
    calloutPlayAtMs: 0,
    reactionOpenedAtMs: 0,
    reactionDeadlineAtMs: 0,
    reactionGraceDeadlineAtMs: 0,
    maxReactionCompensationMs: NETWORK_TIMING_CONFIG.maxReactionCompensationMs,
    protocolVersion: NETWORK_PROTOCOL_VERSION,
    roomCode: "",
    roomPhase: ROOM_PHASES.waiting,
    matchStartAtMs: 0,
    countdownDurationMs: COUNTDOWN_DURATION_MS,
    pausedFromPhase: "",
    disconnectedPlayerNumber: 0,
    reconnectDeadlineAtMs: 0,
  });
  simulation = null;
  rewind = null;
  forceBullTokens = false;
  allowTestControls = false;
  nextEventId = 1;
  reactionOpenedAtMs = 0;
  reconnectionGraceSeconds = RECONNECTION_GRACE_SECONDS;
  pauseStartedAtMs = 0;
  disconnectedSessions = new Map();
  inputs = this.defineInput(MoveInput, {
    seqField: "clientSeq",
    bufferMaxSize: 128,
    sanitize: {
      moveX: [-1, 1],
      moveY: [-1, 1],
    },
    idle: {
      moveX: 0,
      moveY: 0,
      dashPressed: false,
      shouDown: false,
      shouPressed: false,
      niuPressed: false,
    },
  });

  async onCreate(options = {}) {
    this.roomId = generateRoomCode();
    this.state.roomCode = this.roomId;
    diagnostics.created += 1;
    diagnostics.activeRoomIds.add(this.roomId);
    diagnostics.activeRooms.set(this.roomId, this);
    this.forceBullTokens = options.forceBullTokens === true;
    this.allowTestControls = options.allowTestControls === true;
    this.reconnectionGraceSeconds = Number.isFinite(options.reconnectionGraceSeconds)
      ? Math.max(1, Number(options.reconnectionGraceSeconds))
      : RECONNECTION_GRACE_SECONDS;
    this.onMessage("ready", (client, value) => this.#handleReady(client, value));
    this.onMessage("rematch", (client, value) => this.#handleRematch(client, value));
    if (this.allowTestControls) {
      this.onMessage("testEndMatch", () => {
        if (this.state.roomPhase === ROOM_PHASES.playing) this.simulation?.combat.finishRound();
      });
    }
    this.rewind = this.allowRewindState({
      maxRewindMs: NETWORK_TIMING_CONFIG.maxReactionCompensationMs,
    });
    this.rewind.attach(this.state, { fields: ["serverTick"], mode: "reckon" });
    this.setFixedTimestep((context) => this.#step(context), NETWORK_TICK_RATE);
    await this.setPrivate(true);
  }

  onAuth(_client, options = {}) {
    if (options.protocolVersion !== NETWORK_PROTOCOL_VERSION) {
      throw new ServerError(4400, "VERSION_MISMATCH");
    }
    if (this.state.roomPhase !== ROOM_PHASES.waiting) {
      throw new ServerError(4401, "MATCH_STARTED");
    }
    return true;
  }

  onJoin(client) {
    const playerNumber = this.#firstAvailablePlayerNumber();
    const spawn = SPAWNS[playerNumber];
    this.state.players.set(
      client.sessionId,
      new PlayerState({
        playerNumber,
        x: spawn.x,
        y: spawn.y,
        velocityX: 0,
        velocityY: 0,
        lastInputSeq: 0,
        dashTimeRemaining: 0,
        dashCooldownRemaining: 0,
        lockImmunityRemaining: 0,
        life: COMBAT_CONFIG.initialLife,
        bullCharge: 0,
        bullToken: false,
        bullCooldownRemaining: 0,
        reactionCompensationMs: 0,
        timingDegraded: false,
        connected: true,
        ready: false,
        rematch: false,
      }),
    );
    diagnostics.joins += 1;
  }

  onDrop(client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const now = this.clock.elapsedTime;
    const deadline = now + this.reconnectionGraceSeconds * 1000;
    this.allowReconnection(client, this.reconnectionGraceSeconds);
    this.disconnectedSessions.set(client.sessionId, deadline);
    player.connected = false;
    this.inputs.get(client.sessionId).clear();

    if (this.state.roomPhase !== ROOM_PHASES.paused) {
      this.state.pausedFromPhase = this.state.roomPhase;
      this.state.roomPhase = ROOM_PHASES.paused;
      this.pauseStartedAtMs = now;
    }
    this.#syncDisconnectedState();
    this.#broadcastRoomStatus();
  }

  onReconnect(client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    this.disconnectedSessions.delete(client.sessionId);
    player.connected = true;
    player.lastInputSeq = 0;
    this.inputs.get(client.sessionId).clear();
    if (this.state.roomPhase === ROOM_PHASES.paused && this.disconnectedSessions.size === 0) {
      this.#resumeFromPause();
    } else {
      this.#syncDisconnectedState();
    }
    this.#broadcastRoomStatus();
  }

  onLeave(client) {
    const pausedFromPhase = this.state.pausedFromPhase;
    const leftDuringPause = this.state.roomPhase === ROOM_PHASES.paused;
    this.disconnectedSessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    diagnostics.leaves += 1;

    const remainingPlayer = [...this.state.players.values()][0];
    if (
      leftDuringPause
      && remainingPlayer
      && [ROOM_PHASES.countdown, ROOM_PHASES.playing, ROOM_PHASES.results].includes(pausedFromPhase)
    ) {
      this.#enterDisconnectResult(remainingPlayer.playerNumber);
    } else {
      this.#enterWaiting();
    }
    this.#syncDisconnectedState();
    this.#broadcastRoomStatus();
  }

  onDispose() {
    diagnostics.disposed += 1;
    diagnostics.activeRoomIds.delete(this.roomId);
    diagnostics.activeRooms.delete(this.roomId);
  }

  #firstAvailablePlayerNumber() {
    const occupied = new Set();
    this.state.players.forEach((player) => occupied.add(player.playerNumber));
    return occupied.has(1) ? 2 : 1;
  }

  #step(context) {
    this.state.serverTick = context.tick;
    const commands = [emptySimulationCommand(), emptySimulationCommand()];
    this.state.players.forEach((player, sessionId) => {
      const channel = this.inputs.get(sessionId);
      const input = channel.next();
      if (input.clientSeq > player.lastInputSeq) player.lastInputSeq = input.clientSeq;
      const hasReactionInput = input.shouPressed || input.niuPressed;
      const timing = hasReactionInput && this.reactionOpenedAtMs > 0 && this.simulation
        ? evaluateReactionTimestamp({
            inputServerTimeMs: channel.reckonTime,
            serverNowMs: this.clock.elapsedTime,
            reactionOpenedAtMs: this.reactionOpenedAtMs,
            reactionWindowMs: (
              this.simulation.combat.reactionWindowDuration
              ?? COMBAT_CONFIG.reactionWindow
            ) * 1000,
          })
        : null;
      if (timing) {
        player.reactionCompensationMs = timing.compensationMs;
        player.timingDegraded = !timing.perfectAllowed;
      }
      commands[player.playerNumber - 1] = {
        x: input.moveX,
        y: input.moveY,
        dashPressed: input.dashPressed,
        shouDown: input.shouDown,
        shouPressed: input.shouPressed,
        niuPressed: input.niuPressed,
        responseElapsed: timing?.elapsedSeconds ?? null,
        perfectAllowed: timing?.perfectAllowed ?? true,
      };
    });

    if (this.state.roomPhase === ROOM_PHASES.countdown) {
      if (
        this.state.players.size === 2
        && this.clock.elapsedTime >= this.state.matchStartAtMs
      ) {
        this.#startMatch();
      }
      return;
    }
    if (
      this.state.roomPhase !== ROOM_PHASES.playing
      || !this.state.matchStarted
      || !this.simulation
      || this.state.players.size !== 2
    ) return;

    const result = this.simulation.step(context.dt, commands);
    this.#syncSimulationState(result.state);
    for (const event of result.events) this.#publishEvent(event);
  }

  #resumeFromPause() {
    const now = this.clock.elapsedTime;
    const pauseDuration = Math.max(0, now - this.pauseStartedAtMs);
    const resumePhase = this.state.pausedFromPhase || ROOM_PHASES.waiting;
    if (resumePhase === ROOM_PHASES.countdown && this.state.matchStartAtMs > 0) {
      this.state.matchStartAtMs += pauseDuration;
    }
    if (resumePhase === ROOM_PHASES.playing) {
      if (this.state.calloutPlayAtMs > 0) this.state.calloutPlayAtMs += pauseDuration;
      if (this.reactionOpenedAtMs > 0) this.reactionOpenedAtMs += pauseDuration;
      if (this.state.reactionOpenedAtMs > 0) this.state.reactionOpenedAtMs += pauseDuration;
      if (this.state.reactionDeadlineAtMs > 0) this.state.reactionDeadlineAtMs += pauseDuration;
      if (this.state.reactionGraceDeadlineAtMs > 0) {
        this.state.reactionGraceDeadlineAtMs += pauseDuration;
      }
    }
    this.state.roomPhase = resumePhase;
    this.state.pausedFromPhase = "";
    this.pauseStartedAtMs = 0;
    this.#syncDisconnectedState();
  }

  #syncDisconnectedState() {
    const next = this.disconnectedSessions.entries().next().value;
    if (!next) {
      this.state.disconnectedPlayerNumber = 0;
      this.state.reconnectDeadlineAtMs = 0;
      return;
    }
    const [sessionId, deadline] = next;
    this.state.disconnectedPlayerNumber = this.state.players.get(sessionId)?.playerNumber ?? 0;
    this.state.reconnectDeadlineAtMs = deadline;
  }

  #startMatch() {
    this.state.matchEpoch += 1;
    this.state.roleRevision = 0;
    this.reactionOpenedAtMs = 0;
    this.state.calloutPlayAtMs = 0;
    this.state.reactionOpenedAtMs = 0;
    this.state.reactionDeadlineAtMs = 0;
    this.state.reactionGraceDeadlineAtMs = 0;
    this.state.roomPhase = ROOM_PHASES.playing;
    this.state.matchStartAtMs = 0;
    this.simulation = new SimulationCore({
      arenaConfig: ARENA_CONFIG,
      combatConfig: COMBAT_CONFIG,
      lockConfig: LOCK_CONFIG,
      movementConfig: MOVEMENT_CONFIG,
      playerConfigs: PLAYER_CONFIGS,
      seed: 0x6d2b79f5 ^ this.state.matchEpoch,
      reactionGrace: NETWORK_TIMING_CONFIG.maxReactionCompensationMs / 1000,
    });
    if (this.forceBullTokens) this.simulation.setForceBullTokens(true);
    this.state.matchStarted = true;
    this.state.players.forEach((player, sessionId) => {
      player.rematch = false;
      this.inputs.get(sessionId).clear();
    });
    this.#syncSimulationState(this.simulation.getState());
    this.#publishEvent({ type: "matchStarted" });
    this.#broadcastRoomStatus();
  }

  #syncSimulationState(snapshot) {
    this.state.players.forEach((networkPlayer) => {
      const index = networkPlayer.playerNumber - 1;
      const player = snapshot.players[index];
      networkPlayer.x = player.x;
      networkPlayer.y = player.y;
      networkPlayer.velocityX = player.velocityX;
      networkPlayer.velocityY = player.velocityY;
      networkPlayer.dashTimeRemaining = player.dashTimeRemaining;
      networkPlayer.dashCooldownRemaining = player.dashCooldownRemaining;
      networkPlayer.lockImmunityRemaining = player.lockImmunityRemaining;
      networkPlayer.life = snapshot.combat.life[index];
      networkPlayer.bullCharge = snapshot.combat.bullCharge[index];
      networkPlayer.bullToken = snapshot.combat.bullTokens[index];
      networkPlayer.bullCooldownRemaining = snapshot.combat.bullCooldownRemaining[index];
    });

    this.state.combatState = snapshot.combat.state;
    this.state.stateTimeRemaining = snapshot.combat.stateTimeRemaining;
    this.state.roundRemaining = snapshot.combat.roundRemaining;
    this.state.attackerNumber = snapshot.combat.attackerIndex + 1;
    this.state.defenderNumber = snapshot.combat.defenderIndex + 1;
    this.state.attackKind = snapshot.combat.attackKind;
    this.state.safeTimeRemaining = snapshot.combat.safeTimeRemaining;
    this.state.hitStopRemaining = snapshot.combat.hitStopRemaining;
    this.state.lockProgress = snapshot.lock.progress;
    this.state.lockRecoveryRemaining = snapshot.lock.recoveryRemaining;
    this.state.lockIsValid = snapshot.lock.isValid;
    this.state.lockIsReady = snapshot.lock.isReady;
    this.state.lineOfSightClear = snapshot.lineOfSightClear;
    this.state.winnerNumber = snapshot.combat.winnerIndex == null
      ? 0
      : snapshot.combat.winnerIndex + 1;
    this.state.forceBullTokens = snapshot.combat.forceBullTokens;
    if (
      snapshot.combat.state === "ROUND_OVER"
      && this.state.roomPhase === ROOM_PHASES.playing
    ) {
      this.state.roomPhase = ROOM_PHASES.results;
      this.state.players.forEach((player) => { player.rematch = false; });
      this.#broadcastRoomStatus();
    }
  }

  #handleReady(client, value) {
    if (this.state.roomPhase !== ROOM_PHASES.waiting) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.ready = value === true;
    player.rematch = false;
    this.#broadcastRoomStatus();
    if (
      this.state.players.size === 2
      && [...this.state.players.values()].every((candidate) => candidate.ready)
    ) {
      this.#scheduleMatch();
    }
  }

  #handleRematch(client, value) {
    if (this.state.roomPhase !== ROOM_PHASES.results) return;
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.rematch = value === true;
    this.#broadcastRoomStatus();
    if (
      this.state.players.size === 2
      && [...this.state.players.values()].every((candidate) => candidate.rematch)
    ) {
      this.#scheduleMatch();
    }
  }

  #scheduleMatch() {
    this.state.roomPhase = ROOM_PHASES.countdown;
    this.state.matchStarted = false;
    this.state.matchStartAtMs = this.clock.elapsedTime + COUNTDOWN_DURATION_MS;
    this.state.combatState = "WAITING";
    this.#publishEvent({
      type: "matchScheduled",
      matchStartAtMs: this.state.matchStartAtMs,
      countdownDurationMs: COUNTDOWN_DURATION_MS,
    });
    this.#broadcastRoomStatus();
  }

  #enterWaiting() {
    this.state.roomPhase = ROOM_PHASES.waiting;
    this.state.matchStartAtMs = 0;
    this.state.matchStarted = false;
    this.state.combatState = "WAITING";
    this.state.attackerNumber = 0;
    this.state.defenderNumber = 0;
    this.state.winnerNumber = 0;
    this.reactionOpenedAtMs = 0;
    this.state.pausedFromPhase = "";
    this.pauseStartedAtMs = 0;
    this.simulation = null;
    this.state.players.forEach((player, sessionId) => {
      const spawn = SPAWNS[player.playerNumber];
      player.x = spawn.x;
      player.y = spawn.y;
      player.velocityX = 0;
      player.velocityY = 0;
      player.life = COMBAT_CONFIG.initialLife;
      player.connected = !this.disconnectedSessions.has(sessionId);
      player.ready = false;
      player.rematch = false;
    });
  }

  #enterDisconnectResult(winnerNumber) {
    this.state.roomPhase = ROOM_PHASES.results;
    this.state.pausedFromPhase = "";
    this.state.matchStartAtMs = 0;
    this.state.matchStarted = false;
    this.state.combatState = "ROUND_OVER";
    this.state.winnerNumber = winnerNumber;
    this.pauseStartedAtMs = 0;
    this.simulation = null;
    this.state.players.forEach((player) => {
      player.ready = false;
      player.rematch = false;
    });
  }

  #broadcastRoomStatus() {
    this.broadcast("roomStatus", {
      roomCode: this.roomId,
      roomPhase: this.state.roomPhase,
      playerCount: this.state.players.size,
      players: [...this.state.players.values()].map((player) => ({
        playerNumber: player.playerNumber,
        connected: player.connected,
        ready: player.ready,
        rematch: player.rematch,
      })),
      pausedFromPhase: this.state.pausedFromPhase,
      disconnectedPlayerNumber: this.state.disconnectedPlayerNumber,
      reconnectDeadlineAtMs: this.state.reconnectDeadlineAtMs,
    });
  }

  #publishEvent(event) {
    const payload = {
      ...event,
      id: this.nextEventId,
      tick: this.simulation?.tick ?? 0,
      matchEpoch: this.state.matchEpoch,
      serverTimeMs: this.clock.elapsedTime,
    };
    if (event.type === "callout") {
      const reactionLeadMs = event.kind === "bull"
        ? COMBAT_CONFIG.bullWindupDuration * 1000
        : COMBAT_CONFIG.calloutLeadDuration * 1000;
      payload.playAtServerMs = this.clock.elapsedTime + Math.min(
        NETWORK_TIMING_CONFIG.calloutScheduleLeadMs,
        Math.max(0, reactionLeadMs - (1000 / NETWORK_TICK_RATE)),
      );
      payload.reactionOpensAtServerMs = this.clock.elapsedTime + reactionLeadMs;
      this.state.calloutPlayAtMs = payload.playAtServerMs;
    } else if (event.type === "reactionOpened") {
      this.reactionOpenedAtMs = this.clock.elapsedTime;
      this.state.reactionOpenedAtMs = this.reactionOpenedAtMs;
      this.state.reactionDeadlineAtMs = this.reactionOpenedAtMs
        + (
          this.simulation.combat.reactionWindowDuration
          ?? COMBAT_CONFIG.reactionWindow
        ) * 1000;
      this.state.reactionGraceDeadlineAtMs = this.state.reactionDeadlineAtMs
        + NETWORK_TIMING_CONFIG.maxReactionCompensationMs;
      payload.reactionOpenedAtServerMs = this.state.reactionOpenedAtMs;
      payload.reactionDeadlineAtServerMs = this.state.reactionDeadlineAtMs;
      payload.reactionGraceDeadlineAtServerMs = this.state.reactionGraceDeadlineAtMs;
    }
    this.nextEventId += 1;
    this.state.lastEventId = payload.id;
    if (event.type === "roleSwap") this.state.roleRevision += 1;
    this.broadcast("gameEvent", payload);
  }
}
