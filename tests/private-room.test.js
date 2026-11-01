import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_PROTOCOL_VERSION,
  RECONNECTION_GRACE_MS,
  RECONNECTION_GRACE_SECONDS,
  ROOM_CODE_ALPHABET,
  ROOM_PHASES,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  roomJoinErrorKey,
} from "../shared/PrivateRoom.js";

test("N5 room codes avoid ambiguous characters and remain easy to type", () => {
  const samples = [0, 0.2, 0.5, 0.999];
  let index = 0;
  const code = generateRoomCode(() => samples[index++]);
  assert.equal(code.length, 4);
  assert.ok([...code].every((character) => ROOM_CODE_ALPHABET.includes(character)));
  assert.doesNotMatch(code, /[01ILO]/);
});

test("N5 normalizes pasted room codes without accepting ambiguous input", () => {
  assert.equal(normalizeRoomCode(" 2a-bc "), "2ABC");
  assert.equal(isValidRoomCode("2ABC"), true);
  assert.equal(isValidRoomCode("O1IL"), false);
  assert.equal(isValidRoomCode("ABC"), false);
});

test("N5 maps matchmaking failures to dedicated lobby error states", () => {
  assert.equal(roomJoinErrorKey(new Error("VERSION_MISMATCH")), "versionMismatch");
  assert.equal(roomJoinErrorKey(new Error('room "ABCD" is locked')), "roomFull");
  assert.equal(roomJoinErrorKey(new Error("room not found")), "roomNotFound");
  assert.equal(roomJoinErrorKey(new Error("MATCH_STARTED")), "matchStarted");
  assert.equal(roomJoinErrorKey(new Error("reconnection token invalid or expired")), "reconnectExpired");
});

test("N6 publishes one bounded reconnection window and a paused room phase", () => {
  assert.equal(NETWORK_PROTOCOL_VERSION, "N6.1");
  assert.equal(RECONNECTION_GRACE_SECONDS, 12);
  assert.equal(RECONNECTION_GRACE_MS, 12000);
  assert.equal(ROOM_PHASES.paused, "PAUSED");
});
