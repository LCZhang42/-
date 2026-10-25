import assert from "node:assert/strict";
import test from "node:test";

import { STANDARD_POSES } from "../src/characters/CharacterCatalog.js";
import {
  EDITABLE_JOINTS,
  adjustPoseJoint,
  deletePoseSlot,
  getCharacterPoseRecord,
  mirrorPose,
  randomizePose,
  readPoseLibrary,
  savePoseSlot,
  setLastUsedPose,
  writePoseLibrary,
} from "../src/characters/PoseEditorModel.js";

test("pose joint edits stay inside safe visual ranges", () => {
  let pose = STANDARD_POSES[0];
  pose = adjustPoseJoint(pose, "leftKnee", 99);
  const definition = EDITABLE_JOINTS.find((joint) => joint.id === "leftKnee");
  assert.equal(pose.leftThigh, definition.max);
  pose = adjustPoseJoint(pose, "lean", -99);
  assert.equal(pose.lean, -0.35);
});

test("mirroring twice returns the original safe pose", () => {
  const mirroredTwice = mirrorPose(mirrorPose(STANDARD_POSES[1]));
  for (const joint of EDITABLE_JOINTS) {
    assert.ok(Math.abs(mirroredTwice[joint.key] - STANDARD_POSES[1][joint.key]) < 1e-9);
  }
});

test("random poses always satisfy every joint range", () => {
  const pose = randomizePose(() => 0.999);
  for (const joint of EDITABLE_JOINTS) {
    assert.ok(pose[joint.key] >= joint.min);
    assert.ok(pose[joint.key] <= joint.max);
  }
});

test("pose library stores three slots, last-used pose, and deletion", () => {
  const library = {};
  assert.equal(savePoseSlot(library, "grandpa", 0, STANDARD_POSES[0], 123), true);
  assert.equal(savePoseSlot(library, "grandpa", 3, STANDARD_POSES[0]), false);
  setLastUsedPose(library, "grandpa", STANDARD_POSES[2]);
  let record = getCharacterPoseRecord(library, "grandpa");
  assert.equal(record.slots.length, 3);
  assert.equal(record.slots[0].updatedAt, 123);
  assert.equal(record.lastPose.id, STANDARD_POSES[2].id);
  assert.equal(deletePoseSlot(library, "grandpa", 0), true);
  record = getCharacterPoseRecord(library, "grandpa");
  assert.equal(record.slots[0], null);
});

test("pose library persistence degrades safely when storage is unavailable", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const library = { grandpa: { slots: [], lastPose: STANDARD_POSES[0] } };
  assert.equal(writePoseLibrary(storage, library), true);
  assert.equal(readPoseLibrary(storage).grandpa.lastPose.id, "deadpan");
  assert.deepEqual(readPoseLibrary({ getItem: () => "not json" }), {});
});
