export const NETWORK_TIMING_CONFIG = Object.freeze({
  calloutScheduleLeadMs: 140,
  maxReactionCompensationMs: 180,
  maxPerfectCompensationMs: 110,
  futureStampToleranceMs: 34,
  goodRttMs: 100,
  fairRttMs: 220,
  goodJitterMs: 25,
  fairJitterMs: 60,
});

export function classifyNetworkQuality(rttMs, jitterMs = 0) {
  const rtt = finiteNonNegative(rttMs);
  const jitter = finiteNonNegative(jitterMs);
  if (rtt <= 0) return Object.freeze({ key: "syncing", label: "同步中" });
  if (
    rtt <= NETWORK_TIMING_CONFIG.goodRttMs
    && jitter <= NETWORK_TIMING_CONFIG.goodJitterMs
  ) {
    return Object.freeze({ key: "good", label: "良好" });
  }
  if (
    rtt <= NETWORK_TIMING_CONFIG.fairRttMs
    && jitter <= NETWORK_TIMING_CONFIG.fairJitterMs
  ) {
    return Object.freeze({ key: "fair", label: "一般" });
  }
  return Object.freeze({ key: "poor", label: "较差" });
}

export function scheduledServerDelay(playAtServerMs, serverNowMs) {
  const playAt = Number(playAtServerMs);
  const now = Number(serverNowMs);
  if (!Number.isFinite(playAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, playAt - now);
}

export function evaluateReactionTimestamp({
  inputServerTimeMs,
  serverNowMs,
  reactionOpenedAtMs,
  reactionWindowMs,
  maxCompensationMs = NETWORK_TIMING_CONFIG.maxReactionCompensationMs,
  maxPerfectCompensationMs = NETWORK_TIMING_CONFIG.maxPerfectCompensationMs,
  futureToleranceMs = NETWORK_TIMING_CONFIG.futureStampToleranceMs,
}) {
  const now = finiteNonNegative(serverNowMs);
  const openedAt = finiteNonNegative(reactionOpenedAtMs);
  const windowMs = finiteNonNegative(reactionWindowMs);
  const compensationLimit = finiteNonNegative(maxCompensationMs);
  const perfectLimit = finiteNonNegative(maxPerfectCompensationMs);
  const futureLimit = finiteNonNegative(futureToleranceMs);
  const rawStamp = Number.isFinite(Number(inputServerTimeMs))
    ? Number(inputServerTimeMs)
    : now;
  const earliest = now - compensationLimit;
  const latest = now + futureLimit;
  const effectiveInputTimeMs = clamp(rawStamp, earliest, latest);
  const compensationMs = clamp(now - effectiveInputTimeMs, 0, compensationLimit);
  const elapsedMs = effectiveInputTimeMs - openedAt;
  const phase = elapsedMs < 0
    ? "early"
    : elapsedMs <= windowMs
      ? "valid"
      : "late";

  return Object.freeze({
    phase,
    accepted: phase === "valid",
    elapsedSeconds: elapsedMs / 1000,
    compensationMs,
    perfectAllowed: phase === "valid" && compensationMs <= perfectLimit,
    stampWasClamped: effectiveInputTimeMs !== rawStamp,
    effectiveInputTimeMs,
  });
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
