import { Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepareModel } from './model-utils.js';

export const MODELS = { babuleh_cat: 'Babuleh Cat', sunny_kitty: 'Sunny Kitty', macdonald: 'Macdonald' };

export class ModelManager {
  constructor(anchor) {
    this.root = new Group(); // Local yaw: never change the placement anchor.
    anchor.add(this.root);
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.request = 0;
    this.currentId = null;
  }

  async select(id) {
    if (!Object.hasOwn(MODELS, id)) throw new Error('Unknown model');
    const request = ++this.request;
    if (!this.cache.has(id)) {
      const url = new URL(`../assets/${id}.glb`, import.meta.url).href;
      const pending = this.loader.loadAsync(url).then(({ scene }) => prepareModel(scene));
      this.cache.set(id, pending);
      pending.catch(() => { if (this.cache.get(id) === pending) this.cache.delete(id); });
    }
    const model = await this.cache.get(id);
    if (request !== this.request) return false; // Ignore older, slower selections.
    this.root.clear();
    this.root.add(model);
    this.currentId = id;
    return true;
  }

  rotate(delta) { this.root.rotation.y += delta; }
}
