import assert from "node:assert/strict";
import test from "node:test";

import { checkCompatibility, formatCompatibility } from "../src/core/Compatibility.js";

function createEnvironment(overrides = {}) {
  return {
    document: {
      createElement: () => ({ getContext: () => ({}) }),
      fullscreenEnabled: true,
    },
    requestAnimationFrame: () => 1,
    AudioContext: class {},
    speechSynthesis: {},
    ...overrides,
  };
}

test("accepts a modern browser with all optional features", () => {
  const report = checkCompatibility(createEnvironment());
  assert.equal(report.supported, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.match(formatCompatibility(report), /检查通过/);
});

test("treats audio, speech and fullscreen as graceful fallbacks", () => {
  const environment = createEnvironment({ AudioContext: undefined, speechSynthesis: undefined });
  environment.document.fullscreenEnabled = false;
  const report = checkCompatibility(environment);
  assert.equal(report.supported, true);
  assert.equal(report.warnings.length, 3);
  assert.match(formatCompatibility(report), /不影响核心玩法/);
});

test("rejects browsers without canvas or animation frames", () => {
  const environment = createEnvironment({ requestAnimationFrame: undefined });
  environment.document.createElement = () => ({ getContext: () => null });
  const report = checkCompatibility(environment);
  assert.equal(report.supported, false);
  assert.equal(report.errors.length, 2);
  assert.match(formatCompatibility(report), /无法运行/);
});
