import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('result pin shows historical samples, follows depth and camera, and metrics sit beside color controls', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
  Object.assign(c.numerics, { dt: 1, maxSteps: 20 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('完了');
  await page.locator('[data-view="map"]').click();
  await page.locator('#fieldSelect').selectOption('temp');
  await page.locator('#pinSeriesToggle').click();
  const bounds = await page.locator('#mapCanvas').boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator('#pinSeriesSummary')).toContainText('2点');
  await expect(page.locator('.series-pin')).toBeVisible();
  await expect(page.locator('#pinSeriesChart')).toHaveAttribute('data-points', '2');
  await page.locator('#resultLevelMode').selectOption('depth');
  await page.locator('#resultDepthNumber').fill('10'); await page.locator('#resultDepthNumber').dispatchEvent('change');
  await expect(page.locator('#pinSeriesTitle')).toContainText('10 m');
  await page.locator('[data-view="3d"]').click();
  await expect(page.locator('.series-pin')).toBeVisible();
  expect(await page.locator('#compactRunMetrics').evaluate(e => e.previousElementSibling.id)).toBe('contourControls');
  await page.screenshot({ path: 'test-results/pin-series-desktop.png', fullPage: true });
  await page.locator('#pinSeriesChart').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('#pinSeriesChart').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((v, i) => i % 4 === 3 && v > 0).length)).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/pin-series-chart.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/pin-series-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('ピンを削除').click(); await expect(page.locator('#pinSeries')).toBeHidden();
  expect(errors).toEqual([]);
});

test('worker retains only recent 48 model hours for a pin chosen after completion', async ({ page }) => {
  await page.goto('/');
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
  c.initial.distribution = 'uniform'; Object.assign(c.numerics, { dt: 60, maxSteps: 3000 });
  for (const b of Object.values(c.boundary)) { b.mode = 'closed'; b.fromInitial = false; }
  const data = await page.evaluate(c => new Promise((resolve, reject) => {
    const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
      if (data.type === 'complete') worker.postMessage({ type: 'pin-series', requestId: 1, cell: 27, field: 'temp', layer: 2, depth: null });
      if (data.type === 'pin-series') { worker.terminate(); resolve(data); }
    };
    worker.postMessage({ type: 'run', config: c });
  }), c);
  expect(data.error).toBeUndefined(); expect(data.interval).toBe(1800);
  expect(data.samples[0].time).toBe(2 * 3600); expect(data.samples.at(-1).time).toBe(50 * 3600);
  expect(data.samples.length).toBe(97);
});
