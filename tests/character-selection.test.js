import assert from "node:assert/strict";
import test from "node:test";

import {
  CharacterSelectionSession,
  readCharacterSelections,
  writeCharacterSelections,
} from "../src/characters/CharacterSelection.js";

const ids = ["grandpa", "uncle", "auntie", "sister", "slacker"];

test("single-player selection keeps P1 and assigns AI from remaining characters", () => {
  const session = new CharacterSelectionSession({
    mode: "ai",
    catalogIds: ids,
    savedIds: ["auntie", "auntie"],
    random: () => 0,
  });
  assert.equal(session.select("auntie"), true);
  const result = session.confirm();
  assert.equal(result.complete, true);
  assert.equal(result.selections[0], "auntie");
  assert.notEqual(result.selections[1], "auntie");
});

test("local selection hands the menu from P1 to P2 and allows mirror matches", () => {
  const session = new CharacterSelectionSession({ mode: "local", catalogIds: ids });
  session.select("uncle");
  const handoff = session.confirm();
  assert.equal(handoff.complete, false);
  assert.equal(session.playerIndex, 1);
  session.select("uncle");
  const result = session.confirm();
  assert.equal(result.complete, true);
  assert.deepEqual(result.selections, ["uncle", "uncle"]);
});

test("selection preferences survive storage errors and preserve each mode", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(writeCharacterSelections(storage, {
    ai: ["auntie", "grandpa"],
    local: ["uncle", "slacker"],
  }), true);
  assert.deepEqual(readCharacterSelections(storage), {
    ai: ["auntie", "grandpa"],
    local: ["uncle", "slacker"],
  });
  assert.deepEqual(readCharacterSelections({ getItem: () => "broken" }), { ai: [], local: [] });
});
