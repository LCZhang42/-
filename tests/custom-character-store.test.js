import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_CHARACTER_LIMITS,
  CUSTOM_JOINT_IDS,
  createCustomCharacterId,
  normalizeCustomRecord,
  validateImageFile,
} from "../src/characters/CustomCharacterStore.js";

test("A5 accepts bounded PNG/WebP files and rejects unsafe inputs", () => {
  assert.deepEqual(validateImageFile({ type: "image/png", size: 1024 }), []);
  assert.deepEqual(validateImageFile({ type: "image/webp", size: 2048 }), []);
  assert.match(validateImageFile({ type: "image/jpeg", size: 1024 }).join(" "), /PNG/);
  assert.match(validateImageFile({ type: "image/png", size: CUSTOM_CHARACTER_LIMITS.maxFileBytes + 1 }).join(" "), /MB/);
  assert.match(validateImageFile({ type: "image/png", size: 0 }).join(" "), /损坏/);
});

test("jointed custom characters require all thirteen normalized markers", () => {
  const joints = Object.fromEntries(CUSTOM_JOINT_IDS.map((id, index) => [id, {
    x: index % 2 ? 1.4 : -0.4,
    y: index / CUSTOM_JOINT_IDS.length,
  }]));
  const record = normalizeCustomRecord({
    id: "custom-test-123456",
    name: "测试老鼠干",
    mode: "jointed",
    joints,
    imageBlob: new Blob(["image"], { type: "image/webp" }),
  });
  assert.equal(Object.keys(record.joints).length, 13);
  assert.equal(record.joints.head.x, 0);
  assert.equal(record.joints.leftShoulder.x, 1);
  assert.equal(record.width, 768);
  assert.equal(record.height, 1024);
  assert.throws(() => normalizeCustomRecord({ ...record, joints: {} }), /13/);
});

test("paper mode needs no joints and generated ids remain local-only", () => {
  const record = normalizeCustomRecord({
    id: "custom-paper-123456",
    name: "  整片表哥  ",
    mode: "paper",
    imageBlob: new Blob(["image"], { type: "image/png" }),
  });
  assert.equal(record.name, "整片表哥");
  assert.deepEqual(record.joints, {});
  assert.match(createCustomCharacterId(() => 0.5), /^custom-[a-z0-9]+-[a-z0-9]+$/);
});
