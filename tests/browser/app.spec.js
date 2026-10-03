import { test, expect } from '@playwright/test';

test('unsupported browser still renders a usable desktop and mobile preview', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true }));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('#start-ar')).toHaveText('AR недоступен');
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.locator('#preview-toggle').click();
  await expect(page.locator('#preview-note')).toBeVisible();
  await page.mouse.move(700, 400);
  await page.mouse.down();
  await page.mouse.move(820, 460, { steps: 8 });
  await page.mouse.up();
  await page.locator('#preview-toggle').click();
  await expect(page.locator('#preview-note')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
        return {
          getViewerPose: (space) => {
            window.xrTest.renderSpace = space.type;
            return window.xrTest.tracked ? { views: [{ transform: { matrix: identity }, projectionMatrix: identity }] } : null;
          },
          getHitTestResults: () => window.xrTest.hit ? [{ getPose: (space) => {
            window.xrTest.poseSpace = space.type;
            const matrix = [...identity]; matrix[5] = window.xrTest.normal; matrix[14] = -1;
            return { transform: { matrix } };
          } }] : [],
        };
      }
      requestAnimationFrame(callback) { return window.requestAnimationFrame((time) => { if (!this.ended) callback(time, this.frame()); }); }
      cancelAnimationFrame(id) { window.cancelAnimationFrame(id); }
      async end() { this.ended = true; this.dispatchEvent(new Event('end')); }
      select() { const event = new Event('select'); event.frame = this.frame(); this.dispatchEvent(event); }
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
  expect(xrState.options.requiredFeatures).toEqual(['hit-test', 'local-floor']);
  expect(xrState.spaces).toContain('local-floor');
  expect(xrState.sourceSpace).toBe('viewer');
  expect(xrState.poseSpace).toBe(xrState.renderSpace);
  await page.evaluate(() => window.xrTest.session.select());
  await expect(page.locator('#reset')).toBeVisible();
  await expect(page.locator('#ar-status')).toContainText('Куб размещён');
  await page.locator('#reset').click();
  await expect(page.locator('#place')).toBeVisible();
  await page.evaluate(() => { window.xrTest.tracked = false; });
  await expect(page.locator('#place')).toBeDisabled();
  await page.evaluate(() => { window.xrTest.tracked = true; });
  await expect(page.locator('#place')).toBeEnabled();
  await page.locator('#place').click();
  await expect(page.locator('#reset')).toBeVisible();
  await page.locator('#end-ar').click();
  await expect(page.locator('#ar-hud')).toBeHidden();
  expect(await page.evaluate(() => window.xrTest.cancelled)).toBe(1);
  await page.locator('#start-ar').click();
  await expect(page.locator('#ar-hud')).toBeVisible();
  expect(await page.evaluate(() => window.xrTest.sessions)).toBe(2);
  await page.locator('#end-ar').click();
  expect(errors).toEqual([]);
});
