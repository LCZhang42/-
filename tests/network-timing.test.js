import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_TIMING_CONFIG,
  classifyNetworkQuality,
  evaluateReactionTimestamp,
  scheduledServerDelay,
} from "../shared/NetworkTiming.js";

test("N4 classifies latency without exposing a continuously changing number", () => {
  assert.equal(classifyNetworkQuality(50, 5).label, "良好");
  assert.equal(classifyNetworkQuality(150, 20).label, "一般");
  assert.equal(classifyNetworkQuality(260, 15).label, "较差");
  assert.equal(classifyNetworkQuality(0, 0).label, "同步中");
});

test("N4 schedules a shared callout on the synchronized server clock", () => {
  assert.equal(scheduledServerDelay(1140, 1085), 55);
  assert.equal(scheduledServerDelay(1140, 1160), 0);
});

for (const rttMs of [50, 100, 200]) {
  test(`N4 keeps a centered response stable at ${rttMs}ms RTT`, () => {
    const oneWayMs = rttMs / 2;
    const result = evaluateReactionTimestamp({
      inputServerTimeMs: 1210,
      serverNowMs: 1210 + oneWayMs,
      reactionOpenedAtMs: 1000,
      reactionWindowMs: 420,
    });
    assert.equal(result.accepted, true);
    assert.ok(Math.abs(result.elapsedSeconds - 0.21) < 0.0001);
    assert.equal(result.perfectAllowed, true);
  });
}

test("N4 caps high-latency compensation and removes perfect grading", () => {
  const result = evaluateReactionTimestamp({
    inputServerTimeMs: 1210,
    serverNowMs: 1410,
    reactionOpenedAtMs: 1000,
    reactionWindowMs: 420,
  });
  assert.equal(result.compensationMs, NETWORK_TIMING_CONFIG.maxReactionCompensationMs);
  assert.equal(result.accepted, true);
  assert.equal(result.perfectAllowed, false);
  assert.equal(result.stampWasClamped, true);
});

test("N4 cannot turn an arbitrarily old or future timestamp into an infinite window", () => {
  const ancient = evaluateReactionTimestamp({
    inputServerTimeMs: -999999,
    serverNowMs: 2000,
    reactionOpenedAtMs: 1000,
    reactionWindowMs: 420,
  });
  assert.equal(ancient.phase, "late");
  assert.equal(ancient.accepted, false);

  const future = evaluateReactionTimestamp({
    inputServerTimeMs: 999999,
    serverNowMs: 2000,
    reactionOpenedAtMs: 1000,
    reactionWindowMs: 420,
  });
  assert.equal(future.phase, "late");
  assert.equal(future.accepted, false);
  assert.equal(future.stampWasClamped, true);
});
