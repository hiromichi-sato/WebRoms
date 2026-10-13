import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('automatic color range uses only the selected layer and is unchanged by zoom or section position', async ({ page }) => {
  await page.goto('/');
  const output = await page.evaluate(async () => {
    const { OceanView } = await import('/src/view.js');
    const host = document.createElement('div'); host.style.cssText = 'width:600px;height:400px';
    const container = document.createElement('div'), canvas = document.createElement('canvas'); host.append(container, canvas); document.body.append(host);
    const view = new OceanView(container, canvas, () => {});
    const size = 8 * 8, fields = { nx: 8, ny: 8, nz: 2, dx: 100, dy: 100, mask: new Uint8Array(size).fill(1), h: new Float64Array(size).fill(100), zeta: new Float64Array(size), u: new Float64Array(size * 2), v: new Float64Array(size * 2), temp: Float64Array.from({ length: size * 2 }, (_, i) => i < size ? 1000 : i - size) };
    fields.mask[0] = 0; fields.temp[size] = -99999;
    view.setCompanion('section'); view.set(fields, 'temp', 1, 'map', 0);
    const first = [view.min, view.max]; view.zoom(1); view.set(fields, 'temp', 1, 'map', 5);
    const second = [view.min, view.max];
    view.colorSettings = { auto: false, min: 10, max: 20 }; view.set(fields, 'temp', 1, 'map', 5);
    return { first, second, manual: [view.min, view.max], missing: view.missingCount };
  });
  expect(output.first).toEqual([16.5, 47.5]); expect(output.second).toEqual(output.first);
  expect(output.manual).toEqual([10, 20]); expect(output.missing).toBe(0);
});

test('tool cursors change with editing mode and navigation preserves grab cursor', async ({ page }) => {
  await page.goto('/');
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8 }); await loadSettings(page, c);
  const canvas = page.locator('#threeView canvas');
  const cursors = [];
  for (const tool of ['dig', 'fill', 'land', 'water']) {
    await page.locator('#brush').selectOption(tool);
    const cursor = await canvas.evaluate(el => el.style.cursor); expect(cursor).toContain('data:image/svg+xml'); cursors.push(cursor);
  }
  expect(new Set(cursors).size).toBe(4);
  await page.locator('#panView').click(); await expect(canvas).toHaveCSS('cursor', 'grab');
  await page.locator('#panView').click();
  await page.locator('.steps button[data-step="2"]').click();
  await page.locator('#initialBrush').selectOption('paint'); expect(await canvas.evaluate(el => el.style.cursor)).toContain('data:image/svg+xml');
  await page.locator('#initialBrush').selectOption('inspect'); await expect(canvas).toHaveCSS('cursor', 'grab');
});

test('initial interpolation displays status, completes and cleans up after errors', async ({ page }) => {
  await page.goto('/'); await page.locator('.steps button[data-step="2"]').click();
  await page.evaluate(() => {
    window.interpolationSeen = false;
    new MutationObserver(() => { if (document.querySelector('#interpolationStatus[open]')) window.interpolationSeen = true; }).observe(document.body, { childList: true });
  });
  await page.locator('#initialDistribution').selectOption('regional-annual');
  await expect(page.locator('#interpolationStatus')).toHaveCount(0);
  expect(await page.evaluate(() => window.interpolationSeen)).toBe(true);
  await page.evaluate(async () => {
    const { withInterpolation } = await import('/src/interpolation-status.js');
    window.pendingInterpolation = withInterpolation(() => new Promise((resolve, reject) => { window.rejectInterpolation = reject; })).catch(e => e.message);
  });
  await expect(page.locator('#interpolationStatus')).toBeVisible();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
  await page.screenshot({ path: 'test-results/interpolation-status.png' });
  await page.evaluate(() => window.rejectInterpolation(new Error('invalid data')));
  await expect(page.locator('#interpolationStatus')).toHaveCount(0);
  expect(await page.evaluate(() => window.pendingInterpolation)).toBe('invalid data');
  await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
});
