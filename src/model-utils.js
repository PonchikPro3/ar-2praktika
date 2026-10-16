import * as THREE from '../vendor/three.module.js';

// These GLBs use KHR_materials_unlit. Keep textures, but enable PBR lighting.
export function prepareModel(model) {
  const converted = new Map();
  model.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const convert = (material) => {
      if (material.isMeshStandardMaterial) return material;
      if (!converted.has(material)) {
        converted.set(material, new THREE.MeshStandardMaterial({
          name: material.name, color: material.color, map: material.map,
          alphaMap: material.alphaMap, opacity: material.opacity,
          transparent: material.transparent, alphaTest: material.alphaTest,
          side: material.side, vertexColors: material.vertexColors,
          depthWrite: material.depthWrite, roughness: 0.8, metalness: 0,
        }));
      }
      return converted.get(material);
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
  });
  for (const original of converted.keys()) original.dispose(); // Textures are reused.
  const normalized = new THREE.Group();
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest <= 0) throw new Error('Empty model');
  const scale = 0.3 / longest;
  const center = box.getCenter(new THREE.Vector3());
  normalized.scale.setScalar(scale);
  normalized.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  normalized.add(model);
  return normalized;
}
