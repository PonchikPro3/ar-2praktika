import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture, Vector3 } from '../vendor/three.module.js';
import { prepareModel } from '../src/model-utils.js';

test('unlit textures become PBR, feet meet the plane and the model is 30 cm', () => {
  const texture = new Texture();
  const unlit = new MeshBasicMaterial({ color: 0xd09040, map: texture, side: 2 });
  const model = new Group();
  const mesh = new Mesh(new BoxGeometry(2, 4, 1), unlit);
  mesh.position.set(3, 7, -2);
  model.add(mesh);
  const normalized = prepareModel(model);
  assert.ok(mesh.material.isMeshStandardMaterial);
  assert.equal(mesh.material.map, texture);
  assert.ok(mesh.material.color.equals(unlit.color));
  assert.equal(mesh.material.roughness, 0.8);
  assert.equal(mesh.material.metalness, 0);
  assert.equal(mesh.material.side, unlit.side);
  const bounds = new Box3().setFromObject(normalized);
  assert.ok(Math.abs(bounds.min.y) < 1e-8);
  assert.ok(Math.abs(bounds.getSize(new Vector3()).y - 0.3) < 1e-8);
  const center = bounds.getCenter(new Vector3());
  assert.ok(Math.abs(center.x) < 1e-8 && Math.abs(center.z) < 1e-8);
});
