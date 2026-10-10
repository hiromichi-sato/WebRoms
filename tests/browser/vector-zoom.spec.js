import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

for (const width of [1280, 390]) test(`velocity arrows and calibrated legend follow zoom at ${width}px`, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 844 });
  const config = defaults(); Object.assign(config.grid, { nx: 32, ny: 32, preset: 'uniform', minDepth: 60, maxDepth: 60 });
  Object.assign(config.initial, { u: .2, v: .1 });
  await page.goto('/'); await loadSettings(page, config);
  await page.locator('[data-step="6"]').click(); await page.locator('#vectorToggle').check();
  const saved = JSON.stringify(await readSettings(page));
  const pixels = () => page.locator('#vectorLegend').evaluate(c => Number(c.dataset.referencePixels));
  for (const mode of ['3d', 'map']) {
    await page.locator(`[data-view="${mode}"]`).click(); await page.locator('#homeView').click();
    const canvas = page.locator(mode === '3d' ? '#threeView canvas' : '#mapCanvas');
    const originalPixels = await pixels(), originalLegend = await page.locator('#vectorLegend').evaluate(c => c.toDataURL());
    expect(originalPixels).toBeGreaterThan(0);
    const before = await canvas.evaluate(c => c.toDataURL());
    const counter = page.locator(mode === '3d' ? '#threeView' : '#mapCanvas');
    const count = Number(await counter.getAttribute('data-vector-count'));
    await page.locator('#zoomIn').click();
    expect((await pixels()) / originalPixels).toBeCloseTo(1 / Math.sqrt(1.25), 4);
    expect(Number(await counter.getAttribute('data-vector-count'))).toBeGreaterThan(count);
    expect(await canvas.evaluate(c => c.toDataURL())).not.toBe(before);
    expect(await page.locator('#vectorLegend').evaluate(c => c.toDataURL())).not.toBe(originalLegend);
    await page.locator('#zoomOut').click(); expect(await pixels()).toBeCloseTo(originalPixels, 4);
    await canvas.scrollIntoViewIfNeeded(); await canvas.hover(); await page.mouse.wheel(0, -250);
    await expect.poll(pixels).toBeLessThan(originalPixels);
    await page.locator('#homeView').click(); expect(await pixels()).toBeCloseTo(originalPixels, 4);
    for (let i = 0; i < 8; i++) await page.locator('#zoomIn').click();
    const metadata = await page.locator('#vectorLegend').evaluate(c => ({ pixels: +c.dataset.referencePixels, speed: +c.dataset.referenceSpeed, width: c.getBoundingClientRect().width }));
    expect(metadata.speed).toBeGreaterThan(0);
    const ratio = Math.log1p(100 * metadata.speed / Math.hypot(.2, .1)) / Math.log1p(100);
    expect(metadata.pixels * ratio * 300 / metadata.width).toBeLessThanOrEqual(64.0001);
    await page.locator('#vectorScale').selectOption('linear');
    const linear = await page.locator('#vectorLegend').evaluate(c => +c.dataset.referenceSpeed);
    expect(linear + 1e-12).toBeGreaterThanOrEqual(metadata.speed);
    await page.locator('#vectorScale').selectOption('log');
    await page.locator('#homeView').click(); await page.locator('#zoomIn').click();
    await page.locator('.workspace').screenshot({ path: `test-results/vector-zoom-${mode}-${width}.png` });
  }
  expect(JSON.stringify(await readSettings(page))).toBe(saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
