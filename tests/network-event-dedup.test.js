import test from "node:test";
import assert from "node:assert/strict";
import { NetworkEventDeduplicator } from "../shared/NetworkEventDeduplicator.js";

test("N3 event deduplicator accepts each authoritative event id once", () => {
  const deduplicator = new NetworkEventDeduplicator();
  assert.equal(deduplicator.accept({ id: 7, type: "roleSwap" }), true);
  assert.equal(deduplicator.accept({ id: 7, type: "roleSwap" }), false);
  assert.equal(deduplicator.accept({ id: 8, type: "outcome" }), true);
});

test("N3 event deduplicator tolerates out-of-order unique events", () => {
  const deduplicator = new NetworkEventDeduplicator(16);
  assert.equal(deduplicator.accept({ id: 12 }), true);
  assert.equal(deduplicator.accept({ id: 10 }), true);
  assert.equal(deduplicator.accept({ id: 12 }), false);
  deduplicator.reset();
  assert.equal(deduplicator.accept({ id: 12 }), true);
});
