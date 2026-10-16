import * as THREE from 'three';
import { placeObject } from './placement.js';

export class ARPlacement {
  constructor(renderer, scene, anchor, onChange, onError) {
    Object.assign(this, { renderer, anchor, onChange, onError });
    this.session = this.source = null;
    this.placed = this.placeRequested = this.starting = false;
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xb6f1cb, side: THREE.DoubleSide }),
    );
    this.reticle.matrixAutoUpdate = false;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  notify() {
    this.onChange({ active: !!this.source, starting: this.starting,
      placed: this.placed, canPlace: this.reticle.visible });
  }

  async start(overlay) {
    if (this.session || this.starting) return;
    this.starting = true;
    this.notify();
    let current;
    try {
      current = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test', 'local-floor', 'dom-overlay'],
        domOverlay: { root: overlay },
      });
      this.session = current;
      current.addEventListener('end', () => this.cleanup(current), { once: true });
      current.addEventListener('select', (event) => this.place(event.frame));
      current.addEventListener('visibilitychange', () => { this.reticle.visible = false; this.notify(); });
      await this.renderer.xr.setSession(current);
      if (this.session !== current) return;
      const viewer = await current.requestReferenceSpace('viewer');
      const source = await current.requestHitTestSource({ space: viewer });
      if (this.session !== current) { source?.cancel(); return; }
      if (!source) throw new Error('Hit-test unavailable');
      this.source = source;
    } catch (error) {
      if (current && this.session === current) {
        try { await current.end(); } catch { this.cleanup(current); }
      }
      this.onError(error);
    } finally {
      this.starting = false;
      this.notify();
    }
  }

  cleanup(current) {
    if (this.session !== current) return;
    this.source?.cancel();
    this.source = this.session = null;
    this.reset();
  }

  updateHit(frame) {
    this.reticle.visible = false;
    const space = this.renderer.xr.getReferenceSpace();
    if (!this.source || this.placed || this.session.visibilityState !== 'visible' || !space || !frame.getViewerPose(space)) return;
    for (const hit of frame.getHitTestResults(this.source)) {
      const pose = hit.getPose(space); // Same local-floor space as rendering.
      if (!pose || pose.transform.matrix[5] < 0.85) continue;
      this.reticle.matrix.fromArray(pose.transform.matrix);
      this.reticle.visible = true;
      break;
    }
  }

  place(frame) {
    if (this.placed) return;
    this.updateHit(frame);
    if (!this.reticle.visible) return;
    placeObject(this.anchor, this.reticle.matrix);
    this.placed = true;
    this.reticle.visible = false;
    this.notify();
  }

  reset() {
    this.placed = this.placeRequested = this.anchor.visible = this.reticle.visible = false;
    this.notify();
  }

  update(frame) {
    if (!frame || !this.session) return;
    this.updateHit(frame);
    if (this.placeRequested) { this.placeRequested = false; this.place(frame); }
    this.notify();
  }

  async end() {
    try { await this.session?.end(); } catch (error) { this.onError(error); }
  }
}
