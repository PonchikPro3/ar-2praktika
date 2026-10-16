import * as THREE from 'three';
import { ModelManager } from './models.js';
import { setupEnvironment } from './lighting.js';
import { ARPlacement } from './ar.js';
import { UI } from './ui.js';
import { bindEvents } from './events.js';

const ui = new UI();
try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  ui.elements.viewport.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 20);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888899, 0.5));
  const anchor = new THREE.Group();
  anchor.visible = false;
  scene.add(anchor);
  const models = new ModelManager(anchor);
  const ar = new ARPlacement(renderer, scene, anchor, (state) => ui.render(state), (error) => ui.error(error));
  bindEvents(ui, ar, models);
  renderer.setAnimationLoop((time, frame) => { ar.update(frame); renderer.render(scene, camera); });
  window.addEventListener('resize', () => {
    if (renderer.xr.isPresenting) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
  const [, , supported] = await Promise.all([
    models.select('babuleh_cat'), setupEnvironment(scene, renderer),
    isSecureContext && navigator.xr ? navigator.xr.isSessionSupported('immersive-ar') : false,
  ]);
  ui.ready = true;
  ui.supported = supported;
  ui.text('start-ar', supported ? 'Запустить AR' : 'AR недоступен');
  ui.text('support', supported ? 'Модель и освещение готовы. Разрешите камеру.' : 'Откройте в Chrome на Android с поддержкой ARCore через HTTPS.');
  ui.render();
} catch (error) {
  ui.text('start-ar', 'Ошибка загрузки');
  ui.text('support', 'Не удалось загрузить модель, HDRI или WebGL. Обновите страницу.');
  console.error(error);
}
