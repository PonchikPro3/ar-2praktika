import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Matrix4, Vector3, Quaternion } from '../vendor/three.module.js';
import { placeObject } from '../src/placement.js';

test('placed cube keeps its world pose when the camera and reticle move', () => {
  const scene = new Group();
  const camera = new Group();
  const object = new Group();
  object.visible = false;
  scene.add(camera, object);
  const orientation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.6);
  const hitMatrix = new Matrix4().compose(new Vector3(1.2, 0.4, -2), orientation, new Vector3(1, 1, 1));
  placeObject(object, hitMatrix);
  const placedMatrix = object.matrixWorld.clone();
  hitMatrix.makeTranslation(9, 0, 9);
  camera.position.set(3, 1.7, -1);
  camera.rotation.y = 1.2;
  scene.updateMatrixWorld(true);
  assert.ok(object.matrixWorld.equals(placedMatrix));
  assert.equal(object.parent, scene);
  assert.equal(object.visible, true);
  assert.deepEqual(object.position.toArray(), [1.2, 0.4, -2]);
  assert.ok(object.quaternion.angleTo(orientation) < 1e-7);
});
