import { getCharacter } from "./CharacterCatalog.js";

export class CharacterAssetLoader {
  constructor({ imageFactory } = {}) {
    this.imageFactory = imageFactory ?? (() => new Image());
    this.entries = new Map();
  }

  load(characterId) {
    if (this.entries.has(characterId)) return this.entries.get(characterId).promise;
    const character = getCharacter(characterId);
    const image = this.imageFactory();
    const entry = { image, loaded: false, error: null, promise: null };
    entry.promise = new Promise((resolve) => {
      image.onload = () => { entry.loaded = true; resolve(entry); };
      image.onerror = () => { entry.error = new Error(`无法加载角色预览：${character.name}`); resolve(entry); };
      image.src = character.conceptPath;
    });
    this.entries.set(characterId, entry);
    return entry.promise;
  }

  preload(characterIds) {
    return Promise.all([...new Set(characterIds)].map((id) => this.load(id)));
  }

  get(characterId) {
    return this.entries.get(characterId) ?? null;
  }
}
