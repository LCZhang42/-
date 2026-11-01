export const NETWORK_PROTOCOL_VERSION = "N6.1";
export const RECONNECTION_GRACE_SECONDS = 12;
export const RECONNECTION_GRACE_MS = RECONNECTION_GRACE_SECONDS * 1000;
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const ROOM_PHASES = Object.freeze({
  waiting: "WAITING",
  countdown: "COUNTDOWN",
  playing: "PLAYING",
  paused: "PAUSED",
  results: "RESULTS",
});

export function generateRoomCode(random = Math.random) {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const value = Number(random());
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : 0;
    code += ROOM_CODE_ALPHABET[Math.floor(safe * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeRoomCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "");
}

export function isValidRoomCode(value) {
  const code = normalizeRoomCode(value);
  return code.length === ROOM_CODE_LENGTH
    && [...code].every((character) => ROOM_CODE_ALPHABET.includes(character));
}

export function roomJoinErrorKey(error) {
  const text = String(error?.message ?? error ?? "").toUpperCase();
  if (text.includes("VERSION_MISMATCH")) return "versionMismatch";
  if (text.includes("MATCH_STARTED")) return "matchStarted";
  if (text.includes("RECONNECT") || text.includes("EXPIRED")) return "reconnectExpired";
  if (text.includes("LOCKED") || text.includes("FULL")) return "roomFull";
  if (text.includes("NOT FOUND") || text.includes("NOT_FOUND")) return "roomNotFound";
  return "unknown";
}
