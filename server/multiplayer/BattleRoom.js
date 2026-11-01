import { Room } from "@colyseus/core";
import { ARENA_CONFIG, COMBAT_CONFIG, LOCK_CONFIG, MOVEMENT_CONFIG, PLAYER_CONFIGS } from "../../shared/BalanceConfig.js";
import { NETWORK_TICK_RATE } from "../../shared/NetworkMovement.js";
import { SimulationCore, emptySimulationCommand } from "../../shared/SimulationCore.js";
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
};

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
  });
  simulation = null;
  forceBullTokens = false;
  nextEventId = 1;
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

  onCreate(options = {}) {
    diagnostics.created += 1;
    diagnostics.activeRoomIds.add(this.roomId);
    this.forceBullTokens = options.forceBullTokens === true;
    this.setFixedTimestep((context) => this.#step(context), NETWORK_TICK_RATE);
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
      }),
    );
    diagnostics.joins += 1;
    if (this.state.players.size === 2) this.#startMatch();
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this.state.matchStarted = false;
    this.state.combatState = "WAITING";
    this.state.attackerNumber = 0;
    this.state.defenderNumber = 0;
    this.simulation = null;
    diagnostics.leaves += 1;
  }

  onDispose() {
    diagnostics.disposed += 1;
    diagnostics.activeRoomIds.delete(this.roomId);
  }

  #firstAvailablePlayerNumber() {
    const occupied = new Set();
    this.state.players.forEach((player) => occupied.add(player.playerNumber));
    return occupied.has(1) ? 2 : 1;
  }

  #step(context) {
    this.state.serverTick = context.tick;
    if (!this.state.matchStarted || !this.simulation || this.state.players.size !== 2) return;

    const commands = [emptySimulationCommand(), emptySimulationCommand()];
    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId).next();
      if (input.clientSeq > player.lastInputSeq) player.lastInputSeq = input.clientSeq;
      commands[player.playerNumber - 1] = {
        x: input.moveX,
        y: input.moveY,
        dashPressed: input.dashPressed,
        shouDown: input.shouDown,
        shouPressed: input.shouPressed,
        niuPressed: input.niuPressed,
      };
    });

    const result = this.simulation.step(context.dt, commands);
    this.#syncSimulationState(result.state);
    for (const event of result.events) this.#publishEvent(event);
  }

  #startMatch() {
    this.state.matchEpoch += 1;
    this.state.roleRevision = 0;
    this.simulation = new SimulationCore({
      arenaConfig: ARENA_CONFIG,
      combatConfig: COMBAT_CONFIG,
      lockConfig: LOCK_CONFIG,
      movementConfig: MOVEMENT_CONFIG,
      playerConfigs: PLAYER_CONFIGS,
      seed: 0x6d2b79f5 ^ this.state.matchEpoch,
    });
    if (this.forceBullTokens) this.simulation.setForceBullTokens(true);
    this.state.matchStarted = true;
    this.state.players.forEach((_player, sessionId) => this.inputs.get(sessionId).clear());
    this.#syncSimulationState(this.simulation.getState());
    this.#publishEvent({ type: "matchStarted" });
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
  }

  #publishEvent(event) {
    const payload = {
      ...event,
      id: this.nextEventId,
      tick: this.simulation?.tick ?? 0,
      matchEpoch: this.state.matchEpoch,
    };
    this.nextEventId += 1;
    this.state.lastEventId = payload.id;
    if (event.type === "roleSwap") this.state.roleRevision += 1;
    this.broadcast("gameEvent", payload);
  }
}
