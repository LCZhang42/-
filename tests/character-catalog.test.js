import assert from "node:assert/strict";
import test from "node:test";

import { CharacterAssetLoader } from "../src/characters/CharacterAssetLoader.js";
import { CHARACTER_CATALOG, getCharacter, getCharacterPose } from "../src/characters/CharacterCatalog.js";
import { REQUIRED_EXPRESSION_IDS, validateCharacterCatalog, validateCharacterDefinition } from "../src/characters/CharacterDefinition.js";

test("A1 catalog contains five valid original characters", () => {
  assert.equal(CHARACTER_CATALOG.length, 5);
  assert.deepEqual(validateCharacterCatalog(CHARACTER_CATALOG), []);
  assert.equal(new Set(CHARACTER_CATALOG.map((character) => character.id)).size, 5);
  for (const character of CHARACTER_CATALOG) {
    assert.deepEqual(validateCharacterDefinition(character), []);
    assert.deepEqual(character.expressions, REQUIRED_EXPRESSION_IDS);
  }
});

test("all five characters reuse the same three-pose skeleton contract", () => {
  for (const character of CHARACTER_CATALOG) {
    assert.equal(getCharacterPose(character, 0).id, "deadpan");
    assert.equal(getCharacterPose(character, 4).id, "hands-on-hips");
  }
  assert.equal(getCharacter("missing-character").id, "strolling-grandpa");
});

test("character asset loader caches portraits and loads only requested ids", async () => {
  const created = [];
  const loader = new CharacterAssetLoader({
    imageFactory: () => {
      const image = {};
      Object.defineProperty(image, "src", {
        set(value) {
          image.path = value;
          created.push(image);
          queueMicrotask(() => image.onload());
        },
      });
      return image;
    },
  });
  const first = loader.load("strolling-grandpa");
  const duplicate = loader.load("strolling-grandpa");
  assert.equal(first, duplicate);
  const entry = await first;
  assert.equal(entry.loaded, true);
  assert.equal(created.length, 1);
  assert.match(entry.image.path, /grandpa\/portrait\.png$/);
  assert.equal(loader.get("dance-auntie"), null);
});
