import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { placeObject } from './placement.js';

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
$('viewport').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 3));

const object = new THREE.Group(); // Contact point; independent of the camera.
object.visible = false;
scene.add(object);
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xb6f1cb, side: THREE.DoubleSide }),
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);
let session, source, placed = false, placeRequested = false;
const status = (text) => { if ($('ar-status').textContent !== text) $('ar-status').textContent = text; };

// Load before enabling AR; scale the longest side to 30 cm and put feet on y=0.
try {
  const [gltf, supported] = await Promise.all([
    new GLTFLoader().loadAsync(new URL('../assets/babuleh_cat.glb', import.meta.url).href),
    isSecureContext && navigator.xr ? navigator.xr.isSessionSupported('immersive-ar') : false,
  ]);
  const model = gltf.scene;
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  model.scale.multiplyScalar(0.3 / Math.max(size.x, size.y, size.z));
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  object.add(model);
  $('start-ar').disabled = !supported;
  $('start-ar').textContent = supported ? 'Запустить AR' : 'AR недоступен';
  $('support').textContent = supported ? 'Модель загружена. Разрешите доступ к камере.' : 'Откройте в Chrome на Android с поддержкой ARCore через HTTPS.';
} catch (error) {
  $('support').textContent = 'Ошибка загрузки модели или WebXR. Обновите страницу.';
  $('start-ar').textContent = 'Ошибка загрузки';
  console.error(error);
}

function updateHit(frame) {
  reticle.visible = false;
  const space = renderer.xr.getReferenceSpace();
  if (!source || placed || session.visibilityState === 'hidden' || !frame.getViewerPose(space)) return;
  for (const hit of frame.getHitTestResults(source)) {
    const pose = hit.getPose(space); // Same local-floor space as rendering.
    if (!pose || pose.transform.matrix[5] < 0.85) continue;
    reticle.matrix.fromArray(pose.transform.matrix);
    reticle.visible = true;
    break;
  }
}
function place(frame) {
  if (placed) return;
  updateHit(frame);
  if (!reticle.visible) return;
  placeObject(object, reticle.matrix); // Copy once; never follow the reticle.
  placed = true;
  reticle.visible = false;
  $('place').hidden = true;
  $('reset').hidden = false;
  status('Кот размещён. Можно двигать камеру.');
}
$('place').onclick = () => { placeRequested = true; }; // Handle in active XRFrame.
$('reset').onclick = () => {
  placed = placeRequested = object.visible = reticle.visible = false;
  $('place').hidden = false;
  $('place').disabled = true;
  $('reset').hidden = true;
};
$('overlay').addEventListener('beforexrselect', (event) => {
  if (event.target.closest('button')) event.preventDefault();
});
$('start-ar').onclick = async () => {
  $('start-ar').disabled = true;
  let current;
  try {
    current = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'], domOverlay: { root: $('overlay') },
    });
    session = current;
    current.addEventListener('end', () => {
      source?.cancel(); source = session = null;
      placed = placeRequested = object.visible = reticle.visible = false;
      document.body.classList.remove('ar');
      $('ar-hud').hidden = true;
      $('start-ar').disabled = false;
    }, { once: true });
    current.addEventListener('select', (event) => place(event.frame));
    await renderer.xr.setSession(current);
    if (session !== current) return;
    const viewer = await current.requestReferenceSpace('viewer');
    const hitSource = await current.requestHitTestSource({ space: viewer });
    if (session !== current) { hitSource?.cancel(); return; }
    if (!hitSource) throw new Error('Hit-test unavailable');
    source = hitSource;
    document.body.classList.add('ar');
    $('ar-hud').hidden = $('place').hidden = false;
    $('place').disabled = true;
    $('reset').hidden = true;
  } catch (error) {
    if (current && session === current) await current.end().catch(() => {});
    $('start-ar').disabled = false;
    $('support').textContent = error.name === 'NotAllowedError' ? 'Доступ к AR отклонён. Разрешите камеру и повторите.' : 'Не удалось запустить AR. Нужны hit-test и local-floor на совместимом Android.';
    console.error(error);
  }
};
$('end-ar').onclick = () => session?.end().catch(() => status('Используйте системный выход из AR.'));
window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop((time, frame) => {
  if (frame && session) {
    updateHit(frame);
    if (placeRequested) { placeRequested = false; place(frame); }
    if (!placed) {
      $('place').disabled = !reticle.visible;
      status(reticle.visible ? 'Коснитесь экрана, чтобы поставить кота.' : 'Направьте камеру на пол или стол и медленно двигайте телефон.');
    }
  }
  renderer.render(scene, camera);
});
