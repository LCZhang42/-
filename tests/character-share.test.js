import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterShareClient,
  normalizeShareApiBase,
  normalizeShareCode,
} from "../src/sharing/CharacterShareClient.js";
import {
  normalizeReportReason,
  normalizeShareId,
  validateSharePayload,
} from "../server/share-worker.js";

function validPayload(mode = "paper") {
  const joints = Object.fromEntries([
    "head", "leftShoulder", "leftElbow", "leftWrist", "rightShoulder", "rightElbow", "rightWrist",
    "leftHip", "leftKnee", "leftAnkle", "rightHip", "rightKnee", "rightAnkle",
  ].map((id, index) => [id, { x: 0.2 + (index % 3) * 0.2, y: 0.05 + index * 0.06 }]));
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");
  return {
    declarations: { rights: true, privacy: true, minorSafety: true },
    package: {
      format: "shoushu-custom-character",
      version: 1,
      character: {
        id: "custom-test-123456",
        name: "跨设备表哥",
        mode,
        joints,
        imageData: `data:image/png;base64,${pngMagic}`,
      },
    },
  };
}

test("A6 accepts HTTPS endpoints, localhost development and bounded share codes", () => {
  assert.equal(normalizeShareApiBase("https://share.example.com/"), "https://share.example.com");
  assert.equal(normalizeShareApiBase("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.throws(() => normalizeShareApiBase("http://share.example.com"), /HTTPS/);
  assert.equal(normalizeShareCode(" AbC_123456 "), "abc_123456");
  assert.equal(normalizeShareId("ABCD1234"), "abcd1234");
  assert.throws(() => normalizeShareCode("bad code"), /格式/);
});

test("share service validates declarations, magic bytes and all joint markers", () => {
  const paper = validateSharePayload(validPayload("paper"));
  assert.equal(paper.package.character.name, "跨设备表哥");
  assert.equal(paper.imageMime, "image/png");
  assert.equal(paper.imageBytes.byteLength, 8);
  assert.equal(Object.keys(validateSharePayload(validPayload("jointed")).package.character.joints).length, 13);
  const missingRights = validPayload();
  missingRights.declarations.rights = false;
  assert.throws(() => validateSharePayload(missingRights), /确认/);
  const missingJoint = validPayload("jointed");
  delete missingJoint.package.character.joints.head;
  assert.throws(() => validateSharePayload(missingJoint), /head/);
});

test("share client keeps local play independent when service is unconfigured", async () => {
  const client = new CharacterShareClient({ baseUrl: "", storage: null, fetch: null });
  assert.equal(client.configured, false);
  await assert.rejects(() => client.fetchShare("abcd1234"), /尚未配置/);
  assert.equal(normalizeReportReason("copyright"), "copyright");
  assert.throws(() => normalizeReportReason("revenge"), /原因/);
});

test("share client binds receiver-sensitive browser fetch before requesting", async () => {
  let receiver = null;
  const receiverSensitiveFetch = function () {
    receiver = this;
    return Promise.resolve({
      ok: true,
      json: async () => ({ ok: true }),
    });
  };
  const client = new CharacterShareClient({
    baseUrl: "http://127.0.0.1:8787",
    storage: null,
    fetch: receiverSensitiveFetch,
  });
  assert.deepEqual(await client.health(), { ok: true });
  assert.equal(receiver, globalThis);
});
