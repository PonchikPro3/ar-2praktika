import * as THREE from 'three';
import { placeObject } from './placement.js';

const $ = (id) => document.getElementById(id);
const startButton = $('start-ar');
const support = $('support');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (error) {
  support.textContent = 'Не удалось запустить WebGL. Откройте страницу в браузере с аппаратным ускорением.';
  startButton.textContent = 'WebGL недоступен';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.setClearColor(0x101916, 0);
$('viewport').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 30);
scene.add(new THREE.HemisphereLight(0xe4ffed, 0x3c4c43, 2.5));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(2, 4, 3);
scene.add(light);

// The group origin is the contact point; the cube's bottom is at y = 0.
function createCube() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: 0xa9e8c0, roughness: 0.32, metalness: 0.12,
  }));
  mesh.position.y = 0.1;
  root.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: 0xd9ffe6, transparent: true, opacity: 0.6 }));
  edges.position.y = 0.1;
  root.add(edges);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.15, 48), new THREE.MeshBasicMaterial({ color: 0x14271d, transparent: true, opacity: 0.18, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  root.add(shadow);
  return root;
}
const object = createCube();
object.visible = false;
scene.add(object);

const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.075, 0.095, 64).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xb6f1cb, side: THREE.DoubleSide }),
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

let session = null;
let hitTestSource = null;
let placed = false;
let starting = false;
let placementRequested = false;

function status(message) {
  if ($('ar-status').textContent !== message) $('ar-status').textContent = message;
}

function updateHit(frame) {
  reticle.visible = false;
  if (!hitTestSource || placed || session?.visibilityState === 'hidden') return;
  // Both rendering and hit poses use Three.js's SAME local-floor space.
  const referenceSpace = renderer.xr.getReferenceSpace();
  if (!referenceSpace || !frame.getViewerPose(referenceSpace)) return;
  const results = frame.getHitTestResults(hitTestSource);
  for (const hit of results) {
    const pose = hit.getPose(referenceSpace);
    if (!pose) continue;
    // Local Y is the surface normal. Reject walls and downward-facing planes.
    if (pose.transform.matrix[5] < 0.85) continue;
    reticle.matrix.fromArray(pose.transform.matrix);
    reticle.visible = true;
    break;
  }
}

function place(frame) {
  if (!session || placed) return;
  // Refresh from the select event's XRFrame; don't place at a stale pose.
  if (frame) updateHit(frame);
  if (!reticle.visible) return;
  placeObject(object, reticle.matrix);
  placed = true;
  reticle.visible = false;
  $('place').hidden = true;
  $('reset').hidden = false;
  status('Куб размещён. Перемещайте камеру — объект остаётся на поверхности.');
}
// DOM clicks run outside an active XRFrame. Process them in the next XR RAF.
$('place').addEventListener('click', () => { placementRequested = true; });
$('reset').addEventListener('click', () => {
  placementRequested = false;
  placed = false;
  placementRequested = false;
  object.visible = false;
  reticle.visible = false;
  $('place').hidden = false;
  $('place').disabled = true;
  $('reset').hidden = true;
  status('Найдите поверхность для нового размещения');
});
// DOM overlay taps must not also generate an XR select that places the cube.
$('overlay').addEventListener('beforexrselect', (event) => {
  if (event.target.closest('button, a')) event.preventDefault();
});

function cleanSession(endedSession) {
  if (session !== endedSession) return;
  hitTestSource?.cancel();
  hitTestSource = null;
  session = null;
  placed = false;
  object.visible = false;
  reticle.visible = false;
  renderer.setClearColor(0x101916, 0);
  document.body.classList.remove('ar');
  $('ar-hud').hidden = true;
  startButton.disabled = false;
  startButton.textContent = 'Запустить AR';
}

startButton.addEventListener('click', async () => {
  if (starting || session) return;
  starting = true;
  startButton.disabled = true;
  let newSession;
  try {
    // Must run directly from the user gesture. local-floor is REQUIRED.
    newSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: $('overlay') },
    });
    session = newSession;
    newSession.addEventListener('end', () => cleanSession(newSession), { once: true });
    newSession.addEventListener('select', (event) => place(event.frame));
    newSession.addEventListener('visibilitychange', () => {
      reticle.visible = false;
      $('place').disabled = true;
    });
    document.body.classList.add('ar');
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    await renderer.xr.setSession(newSession);
    if (session !== newSession) return;
    const viewerSpace = await newSession.requestReferenceSpace('viewer');
    const source = await newSession.requestHitTestSource({ space: viewerSpace });
    if (!source) throw new Error('Hit-test source unavailable');
    if (session !== newSession) { source.cancel(); return; }
    hitTestSource = source;
    document.body.classList.add('ar');
    $('ar-hud').hidden = false;
    $('place').hidden = false;
    $('place').disabled = true;
    $('reset').hidden = true;
    status('Медленно двигайте телефон, чтобы найти пол или стол');
    support.textContent = 'AR готов. После выхода можно запустить новую сессию.';
  } catch (error) {
    console.error('AR session failed:', error);
    if (newSession && session === newSession) {
      try { await newSession.end(); } catch { cleanSession(newSession); }
    }
    startButton.disabled = false;
    startButton.textContent = 'Попробовать снова';
    support.textContent = error.name === 'NotAllowedError'
      ? 'Доступ к AR отклонён. Разрешите использование камеры и повторите запуск.'
      : error.name === 'NotSupportedError'
        ? 'Устройство не поддерживает immersive-ar с hit-test и local-floor. Используйте совместимый Chrome на Android.'
        : 'Не удалось запустить AR. Проверьте разрешения камеры и поддержку WebXR, затем повторите попытку.';
  } finally { starting = false; }
});
$('end-ar').addEventListener('click', async () => {
  try { await session?.end(); } catch { status('Не удалось выйти. Используйте кнопку выхода браузера.'); }
});

async function checkSupport() {
  if (!window.isSecureContext) {
    startButton.textContent = 'Нужен HTTPS';
    support.textContent = 'Для AR откройте HTTPS-страницу GitHub Pages.';
    return;
  }
  try {
    const supported = navigator.xr && await navigator.xr.isSessionSupported('immersive-ar');
    startButton.disabled = !supported;
    startButton.textContent = supported ? 'Запустить AR' : 'AR недоступен';
    support.textContent = supported
      ? 'Готово к запуску · разрешите доступ к камере при запросе браузера.'
      : 'Откройте страницу в Chrome на Android с поддержкой ARCore. Этот браузер не поддерживает WebXR AR.';
  } catch {
    startButton.textContent = 'WebXR недоступен';
    support.textContent = 'Не удалось проверить WebXR. Проверьте разрешения браузера.';
  }
}
checkSupport();

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
renderer.setAnimationLoop((time, frame) => {
  if (frame && session) {
    updateHit(frame);
    if (placementRequested) {
      placementRequested = false;
      place(frame);
    }
    if (!placed) {
      $('place').disabled = !reticle.visible;
      status(reticle.visible ? 'Поверхность найдена. Коснитесь экрана или нажмите «Разместить куб».' : 'Медленно двигайте телефон, чтобы найти пол или стол');
    }
  }
  renderer.render(scene, camera);
});
