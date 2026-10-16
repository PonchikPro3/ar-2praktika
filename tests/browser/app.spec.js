import { test, expect } from '@playwright/test';

test('minimal start screen fits a phone and explains missing WebXR support', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#start-ar')).toHaveText('AR недоступен');
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(page.locator('#support')).toContainText('Chrome на Android');
  expect(errors).toEqual([]);
});

test('permission denial leaves the start button available for retry', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', {
    configurable: true,
    value: { isSessionSupported: async () => true, requestSession: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
  }));
  await page.goto('/');
  await expect(page.locator('#start-ar')).toBeEnabled();
  await page.locator('#start-ar').click();
  await expect(page.locator('#support')).toContainText('Доступ к AR отклонён');
  await expect(page.locator('#start-ar')).toBeEnabled();
});

// A deterministic XR API mock exercises the real Three.js WebXRManager.
// It verifies API wiring and UI behavior, not real-device tracking accuracy.
test('AR session uses local-floor, places only on a valid hit, resets and cleans up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    window.xrTest = { hit: false, normal: 1, tracked: true, spaces: [], cancelled: 0, sessions: 0 };
    WebGL2RenderingContext.prototype.makeXRCompatible = async () => {};
    window.XRWebGLBinding = undefined;
    window.XRWebGLLayer = class {
      constructor(session, gl) {
        this.framebuffer = null;
        this.framebufferWidth = gl.drawingBufferWidth;
        this.framebufferHeight = gl.drawingBufferHeight;
      }
      getViewport() { return { x: 0, y: 0, width: this.framebufferWidth, height: this.framebufferHeight }; }
    };
    class Session extends EventTarget {
      inputSources = [];
      visibilityState = 'visible';
      environmentBlendMode = 'alpha-blend';
      enabledFeatures = ['hit-test', 'local-floor', 'dom-overlay'];
      renderState = {};
      ended = false;
      updateRenderState(state) { Object.assign(this.renderState, state); }
      async requestReferenceSpace(type) { window.xrTest.spaces.push(type); return { type }; }
      async requestHitTestSource({ space }) {
        window.xrTest.sourceSpace = space.type;
        return { cancel: () => window.xrTest.cancelled++ };
      }
      frame() {
        const frame = {
          active: false,
          getViewerPose: (space) => {
            if (!frame.active) throw new DOMException('Inactive XRFrame', 'InvalidStateError');
            window.xrTest.renderSpace = space.type;
            return window.xrTest.tracked ? { views: [{ transform: { matrix: identity }, projectionMatrix: identity }] } : null;
          },
          getHitTestResults: () => window.xrTest.hit ? [{ getPose: (space) => {
            window.xrTest.poseSpace = space.type;
            const matrix = [...identity]; matrix[5] = window.xrTest.normal; matrix[14] = -1;
            return { transform: { matrix } };
          } }] : [],
        };
        return frame;
      }
      requestAnimationFrame(callback) { return window.requestAnimationFrame((time) => { if (!this.ended) { const frame = this.frame(); frame.active = true; callback(time, frame); frame.active = false; } }); }
      cancelAnimationFrame(id) { window.cancelAnimationFrame(id); }
      async end() { this.ended = true; this.dispatchEvent(new Event('end')); }
      select() { const event = new Event('select'); event.frame = this.frame(); event.frame.active = true; this.dispatchEvent(event); event.frame.active = false; }
    }
    Object.defineProperty(navigator, 'xr', { configurable: true, value: {
      isSessionSupported: async () => true,
      requestSession: async (mode, options) => {
        window.xrTest.mode = mode;
        window.xrTest.options = { requiredFeatures: options.requiredFeatures, optionalFeatures: options.optionalFeatures };
        window.xrTest.sessions++;
        return window.xrTest.session = new Session();
      },
    } });
  });
  await page.goto('/');
  await page.locator('#start-ar').click();
  await expect(page.locator('#ar-hud')).toBeVisible();
  await expect(page.locator('#place')).toBeDisabled();
  await page.evaluate(() => window.xrTest.session.select());
  await expect(page.locator('#reset')).toBeHidden();
  await page.evaluate(() => { window.xrTest.hit = true; window.xrTest.normal = 0; });
  await expect(page.locator('#place')).toBeDisabled();
  await page.evaluate(() => { window.xrTest.normal = 1; });
  await expect(page.locator('#place')).toBeEnabled();
  const xrState = await page.evaluate(() => ({ mode: window.xrTest.mode, options: window.xrTest.options, spaces: window.xrTest.spaces, sourceSpace: window.xrTest.sourceSpace, poseSpace: window.xrTest.poseSpace, renderSpace: window.xrTest.renderSpace }));
  expect(xrState.mode).toBe('immersive-ar');
  expect(xrState.options.requiredFeatures).toEqual(['hit-test', 'local-floor', 'dom-overlay']);
  expect(xrState.spaces).toContain('local-floor');
  expect(xrState.sourceSpace).toBe('viewer');
  expect(xrState.poseSpace).toBe(xrState.renderSpace);
  await page.evaluate(() => window.xrTest.session.select());
  await expect(page.locator('#reset')).toBeVisible();
  await expect(page.locator('#ar-status')).toContainText('Модель размещена');
  await page.screenshot({ path: 'test-results/ar-model.png' });
  await page.locator('#reset').click();
  await expect(page.locator('#place')).toBeVisible();
  await page.evaluate(() => { window.xrTest.tracked = false; });
  await expect(page.locator('#place')).toBeDisabled();
  await page.evaluate(() => { window.xrTest.tracked = true; });
  await expect(page.locator('#place')).toBeEnabled();
  await page.locator('#place').click();
  await expect(page.locator('#reset')).toBeVisible();
  // Observe the real manager through its prototype; no production debug API.
  await page.evaluate(async () => {
    const { ModelManager } = await import('/src/models.js');
    const rotate = ModelManager.prototype.rotate;
    const select = ModelManager.prototype.select;
    window.modelManager = null;
    ModelManager.prototype.rotate = function (delta) { window.modelManager = this; return rotate.call(this, delta); };
    ModelManager.prototype.select = function (id) { window.modelManager = this; return select.call(this, id); };
  });
  await page.locator('#rotate-right').click();
  const initial = await page.evaluate(() => {
    const root = window.modelManager.root;
    const scene = root.parent.parent;
    return { yaw: root.rotation.y, pose: root.parent.matrix.toArray(), environment: !!scene.environment?.isTexture, background: scene.background };
  });
  expect(initial.yaw).toBeCloseTo(Math.PI / 12);
  expect(initial.environment).toBe(true);
  expect(initial.background).toBeNull();
  for (const id of ['sunny_kitty', 'macdonald', 'babuleh_cat']) {
    await page.locator('#model-select').selectOption(id);
    await expect(page.locator('#model-status')).toContainText('готова');
    const current = await page.evaluate(async () => {
      const { Box3, Vector3 } = await import('three');
      const manager = window.modelManager;
      const materials = [];
      manager.root.traverse((node) => { if (node.isMesh) materials.push({ pbr: node.material.isMeshStandardMaterial, textured: !!node.material.map }); });
      const bounds = new Box3().setFromObject(manager.root.children[0]);
      return { id: manager.currentId, yaw: manager.root.rotation.y, pose: manager.root.parent.matrix.toArray(), materials, size: bounds.getSize(new Vector3()).toArray() };
    });
    expect(current.id).toBe(id);
    expect(current.pose).toEqual(initial.pose);
    expect(current.yaw).toBeCloseTo(initial.yaw);
    expect(current.materials.length).toBeGreaterThan(0);
    expect(current.materials.every((m) => m.pbr && m.textured)).toBe(true);
    // Bounding box above includes user yaw, so permit a rotated 30 cm model.
    expect(Math.max(...current.size)).toBeLessThan(0.43);
  }
  await page.locator('#rotate-left').click();
  expect(await page.evaluate(() => window.modelManager.root.rotation.y)).toBeCloseTo(0);
  const overlayEvents = await page.evaluate(() => {
    const send = (selector) => document.querySelector(selector).dispatchEvent(new Event('beforexrselect', { bubbles: true, cancelable: true }));
    return { select: send('#model-select'), rotate: send('#rotate-left'), panel: send('.bottom-panel'), emptyScreen: send('#overlay') };
  });
  expect(overlayEvents).toEqual({ select: false, rotate: false, panel: false, emptyScreen: true });
  // A slow previous selection must not replace the user's latest choice.
  let releaseSunny;
  const heldSunny = new Promise((resolve) => { releaseSunny = resolve; });
  await page.route('**/assets/sunny_kitty.glb', async (route) => { await heldSunny; await route.continue(); });
  await page.evaluate(() => window.modelManager.cache.delete('sunny_kitty'));
  await page.locator('#model-select').selectOption('sunny_kitty');
  await page.locator('#model-select').selectOption('macdonald');
  await expect(page.locator('#model-status')).toContainText('Macdonald готова');
  releaseSunny();
  await page.evaluate(() => window.modelManager.cache.get('sunny_kitty').then(() => null));
  expect(await page.evaluate(() => window.modelManager.currentId)).toBe('macdonald');
  await page.unroute('**/assets/sunny_kitty.glb');
  await page.locator('#model-select').selectOption('babuleh_cat');
  await expect(page.locator('#model-status')).toContainText('Babuleh Cat готова');
  // Failed GLB selection preserves the old model, position and active session.
  await page.route('**/assets/macdonald.glb', (route) => route.abort());
  await page.evaluate(() => window.modelManager.cache.delete('macdonald'));
  await page.locator('#model-select').selectOption('macdonald');
  await expect(page.locator('#model-status')).toContainText('Не удалось загрузить');
  await expect(page.locator('#model-select')).toHaveValue('babuleh_cat');
  await expect(page.locator('#ar-hud')).toBeVisible();
  await page.unroute('**/assets/macdonald.glb');
  await page.locator('#model-select').selectOption('macdonald');
  await expect(page.locator('#model-status')).toContainText('готова');
  await page.screenshot({ path: 'test-results/ar-controls.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#rotate-right').scrollIntoViewIfNeeded();
  await expect(page.locator('#rotate-right')).toBeInViewport();
  await page.locator('#rotate-right').click();
  expect(await page.evaluate(() => window.modelManager.root.rotation.y)).toBeCloseTo(Math.PI / 12);
  await page.locator('#end-ar').click();
  await expect(page.locator('#ar-hud')).toBeHidden();
  expect(await page.evaluate(() => window.xrTest.cancelled)).toBe(1);
  await page.locator('#start-ar').click();
  await expect(page.locator('#ar-hud')).toBeVisible();
  expect(await page.evaluate(() => window.xrTest.sessions)).toBe(2);
  await page.locator('#end-ar').click();
  expect(errors).toEqual([]);
});
