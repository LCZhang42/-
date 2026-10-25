import assert from "node:assert/strict";
import test from "node:test";

import { VisualEffectsPool } from "../src/rendering/VisualEffectsPool.js";

test("preallocates and reuses a fixed set of visual effect objects", () => {
  const pool = new VisualEffectsPool({ capacity: 8, random: () => 0.5 });
  const identities = [...pool.particles];

  pool.spawnImpact({ x: 20, y: 30, color: "#fff", intensity: 2 });

  assert.equal(pool.particles.length, 8);
  assert.equal(pool.activeCount, 8);
  assert.deepEqual(pool.particles, identities);
  assert.ok(pool.particles.every((particle, index) => particle === identities[index]));
});

test("particles expire and return to the shared pool", () => {
  const pool = new VisualEffectsPool({ capacity: 12, random: () => 0 });
  pool.spawnImpact({ x: 0, y: 0, color: "#fff" });

  assert.ok(pool.activeCount > 0);
  pool.update(1);
  assert.equal(pool.activeCount, 0);
});

test("low effects mode keeps gameplay feedback but skips pooled particles", () => {
  const pool = new VisualEffectsPool({ capacity: 12, random: () => 0.5 });
  pool.setLowEffects(true);
  pool.spawnImpact({ x: 0, y: 0, color: "#fff" });

  assert.equal(pool.activeCount, 0);
});
