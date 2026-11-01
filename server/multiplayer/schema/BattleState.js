import { schema, t } from "@colyseus/schema";

export const PlayerState = schema(
  {
    playerNumber: t.uint8(),
    x: t.number(),
    y: t.number(),
    velocityX: t.number(),
    velocityY: t.number(),
    lastInputSeq: t.uint32(),
    dashTimeRemaining: t.number(),
    dashCooldownRemaining: t.number(),
    lockImmunityRemaining: t.number(),
    life: t.number(),
    bullCharge: t.number(),
    bullToken: t.boolean(),
    bullCooldownRemaining: t.number(),
  },
  "PlayerState",
);

export const MoveInput = schema(
  {
    clientSeq: t.uint32(),
    moveX: t.int8(),
    moveY: t.int8(),
    dashPressed: t.boolean(),
    shouDown: t.boolean(),
    shouPressed: t.boolean(),
    niuPressed: t.boolean(),
  },
  "MoveInput",
);

export const BattleState = schema(
  {
    players: t.map(PlayerState),
    serverTick: t.uint32(),
    matchStarted: t.boolean(),
    matchEpoch: t.uint32(),
    combatState: t.string(),
    stateTimeRemaining: t.number(),
    roundRemaining: t.number(),
    attackerNumber: t.uint8(),
    defenderNumber: t.uint8(),
    attackKind: t.string(),
    safeTimeRemaining: t.number(),
    hitStopRemaining: t.number(),
    lockProgress: t.number(),
    lockRecoveryRemaining: t.number(),
    lockIsValid: t.boolean(),
    lockIsReady: t.boolean(),
    lineOfSightClear: t.boolean(),
    roleRevision: t.uint32(),
    lastEventId: t.uint32(),
    winnerNumber: t.uint8(),
    forceBullTokens: t.boolean(),
  },
  "BattleState",
);
