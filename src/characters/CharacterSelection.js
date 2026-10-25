export const CHARACTER_SELECTION_STORAGE_KEY = "shoushu-character-selection-v1";

function normalizeIds(ids, catalogIds) {
  const valid = new Set(catalogIds);
  return Array.isArray(ids) ? ids.filter((id) => valid.has(id)).slice(0, 2) : [];
}

export class CharacterSelectionSession {
  constructor({ mode = "ai", catalogIds, savedIds = [], random = Math.random }) {
    if (!Array.isArray(catalogIds) || catalogIds.length < 2) {
      throw new Error("选角至少需要两名角色");
    }
    this.mode = mode === "local" ? "local" : "ai";
    this.catalogIds = [...catalogIds];
    this.random = random;
    const saved = normalizeIds(savedIds, this.catalogIds);
    this.selections = [saved[0] ?? this.catalogIds[0], saved[1] ?? this.catalogIds[1]];
    this.playerIndex = 0;
  }

  get activeId() {
    return this.selections[this.playerIndex];
  }

  select(id) {
    if (!this.catalogIds.includes(id)) return false;
    this.selections[this.playerIndex] = id;
    return true;
  }

  confirm() {
    if (this.mode === "local" && this.playerIndex === 0) {
      this.playerIndex = 1;
      return { complete: false, playerIndex: 1, selections: [...this.selections] };
    }

    if (this.mode === "ai") {
      const remaining = this.catalogIds.filter((id) => id !== this.selections[0]);
      if (!remaining.includes(this.selections[1])) {
        const index = Math.min(
          remaining.length - 1,
          Math.floor(Math.max(0, this.random()) * remaining.length),
        );
        this.selections[1] = remaining[index];
      }
    }

    return { complete: true, playerIndex: this.playerIndex, selections: [...this.selections] };
  }
}

export function readCharacterSelections(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(CHARACTER_SELECTION_STORAGE_KEY) ?? "{}");
    return {
      ai: Array.isArray(parsed.ai) ? parsed.ai : [],
      local: Array.isArray(parsed.local) ? parsed.local : [],
    };
  } catch {
    return { ai: [], local: [] };
  }
}

export function writeCharacterSelections(storage, preferences) {
  try {
    storage?.setItem(CHARACTER_SELECTION_STORAGE_KEY, JSON.stringify({
      ai: Array.isArray(preferences.ai) ? preferences.ai.slice(0, 2) : [],
      local: Array.isArray(preferences.local) ? preferences.local.slice(0, 2) : [],
    }));
    return true;
  } catch {
    return false;
  }
}
