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
  await expect(page.locator('#viewport .series-pin')).toBeVisible();
  await expect(page.locator('#pinSeriesChart')).toHaveAttribute('data-points', '2');
  await expect(page.locator('#companionStack > #pinSeries')).toBeVisible();
  await expect(page.locator('#pinHeightResizer')).toBeVisible();
  await page.locator('#resultLevelMode').selectOption('depth');
  await page.locator('#resultDepthNumber').fill('10'); await page.locator('#resultDepthNumber').dispatchEvent('change');
  await expect(page.locator('#pinSeriesTitle')).toContainText('10 m');
  await page.locator('[data-view="3d"]').click();
  await expect(page.locator('#viewport .series-pin')).toBeVisible();
  expect(await page.locator('#compactRunMetrics').evaluate(e => e.previousElementSibling.id)).toBe('runStateBadge');
  await page.screenshot({ path: 'test-results/pin-series-desktop.png', fullPage: true });
  await page.locator('#pinSeriesChart').scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('#pinSeriesChart').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].filter((v, i) => i % 4 === 3 && v > 0).length)).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/pin-series-chart.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/pin-series-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('ピンを削除', { exact: true }).click(); await expect(page.locator('#pinSeries')).toBeHidden();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#resultLevelMode').selectOption('layer');
  await page.locator('#sectionPinSeriesToggle').click();
  const section = await page.locator('#sectionCanvas').boundingBox();
  await page.mouse.click(section.x + section.width * .5, section.y + section.height * .5);
  await expect(page.locator('#pinSeries')).toBeVisible();
  await expect(page.locator('.secondary-scene .series-pin')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1280, 390]) test(`pin history sits below tides and resizes vertically at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40, geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  config.initial.distribution = 'uniform'; Object.assign(config.numerics, { dt: 1, maxSteps: 20 });
  config.ocean = { tideMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  await loadSettings(page, config); await page.locator('[data-step="6"]').click();
  await page.locator('#calculateButton').click(); await expect(page.locator('#convergence')).toHaveText('完了');
  await page.locator('[data-view="map"]').click(); await page.locator('#pinSeriesToggle').click();
  const canvas = await page.locator('#mapCanvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await expect(page.locator('#pinSeriesChart')).toHaveAttribute('data-points', '2');
  const panel = page.locator('#pinSeries'), handle = page.locator('#pinHeightResizer');
  await expect(handle).toBeVisible();
  const tide = await page.locator('#runTidePanel').boundingBox(), pin = await panel.boundingBox();
  expect(pin.y).toBeGreaterThanOrEqual(tide.y + tide.height);
  await handle.scrollIntoViewIfNeeded();
  const initialHeight = (await panel.boundingBox()).height;
  const grip = await handle.boundingBox();
  await page.mouse.move(grip.x + 30, grip.y + 5); await page.mouse.down();
  await page.mouse.move(grip.x + 30, grip.y - 45, { steps: 5 }); await page.mouse.up();
  expect((await panel.boundingBox()).height).toBeGreaterThan(initialHeight + 30);
  await expect(page.locator('#pinSeriesChart')).toHaveAttribute('data-points', '2');
  await page.locator('#pinSeriesChart').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/pin-below-tides-${width}.png`, fullPage: true });
  await page.locator('#removeSeriesPin').click();
  await expect(panel).toBeHidden(); await expect(handle).toBeHidden();
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
