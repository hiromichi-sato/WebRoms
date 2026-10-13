import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('zero biomass and zero saturation show regularized grazing pressure, not NaN', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' });
  Object.assign(c.ecosystem, { enabled: true, distribution: 'manual' });
  c.ecosystem.initial.npzd_Phyt = 0; c.ecosystem.parameters.npzd.K_Phy = 0;
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="6"]').click();
  await page.locator('#diagnosticSelect').selectOption('diagGrazingPressure');
  await expect(page.locator('#legendTitle')).toContainText('捕食圧');
  await page.locator('[data-view="map"]').click();
  const rgba = await page.locator('#mapCanvas').evaluate(canvas => {
    const d = devicePixelRatio;
    return [...canvas.getContext('2d').getImageData(Math.round(canvas.width / 2 + 5 * d), Math.round(canvas.height / 2 + 5 * d), 1, 1).data];
  });
  expect(Math.max(...rgba.slice(0, 3))).toBeGreaterThan(30);
  await expect(page.locator('#contourLow')).toHaveText('0');
});

test('GLS mixing is selectable after calculation, and finite fields have no missing-data key', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', edits: { 27: 0 } });
  Object.assign(c.numerics, { dt: 1, maxSteps: 10 });
  await page.goto('/'); await loadSettings(page, c); await page.locator('[data-step="6"]').click();
  await expect(page.locator('#diagnosticSelect option[value="diagKh"]')).toHaveCount(0);
  await expect(page.locator('#diagnosticSelect option[value="diagKv"]')).toHaveCount(1);
  await expect(page.locator('#diagnosticSelect option[value="diagKv"]')).toHaveAttribute('disabled', '');
  await expect(page.locator('#contourControls .nan-key')).toBeHidden();
  await page.locator('#calculateButton').click();
  await expect(page.locator('#phaseText')).toContainText('計算完了', { timeout: 30000 });
  await expect(page.locator('#diagnosticSelect option[value="diagKv"]')).not.toHaveAttribute('disabled', '');
  await page.locator('#diagnosticSelect').selectOption('diagKv');
  await expect(page.locator('#contourControls .nan-key')).toBeHidden();
  const blackPixels = async selector => page.locator(selector).evaluate(source => {
    const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
    const ctx = c.getContext('2d'); ctx.drawImage(source, 0, 0); const a = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] < 3 && a[i + 1] < 3 && a[i + 2] < 3 && a[i + 3] === 255) n++;
    return n;
  });
  expect(await blackPixels('#threeView canvas')).toBeLessThan(1000);
  expect(await blackPixels('#sectionCanvas')).toBeLessThan(1000);
  await page.locator('[data-view="map"]').click(); expect(await blackPixels('#mapCanvas')).toBeLessThan(1000);
  const land = await page.locator('#mapCanvas').evaluate(c => {
    const d = devicePixelRatio, b = c.getBoundingClientRect(), size = Math.min(b.width - 104, b.height - 104);
    return [...c.getContext('2d').getImageData(Math.round((b.width / 2 - size / 16 + 5) * d), Math.round((b.height / 2 + size / 16 + 5) * d), 1, 1).data];
  });
  expect(Math.min(...land.slice(0, 3))).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/nan-map.png', fullPage: true });
});

test('compact graph exposes both axes, multiple time ticks, intervals and means', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { PinSeriesControls } = await import('/src/pin-series-controls.js');
    const host = document.createElement('div'); host.id = 'samplingHarness'; host.style.cssText = 'width:min(720px,100%);background:white';
    const toolbar = document.createElement('div'), container = document.createElement('div'), canvas = document.createElement('canvas'), anchor = document.createElement('div');
    host.append(toolbar, container, canvas, anchor); document.body.append(host);
    const view = { container, canvas, mode: 'map', fields: { nx: 8, nz: 3, mask: new Uint8Array(64).fill(1) }, pinPosition: () => null };
    const ui = new PinSeriesControls(view, toolbar, anchor, { temp: '水温 / °C' }); window.testSeries = ui;
    ui.update(true, { postMessage() {} }, 86400, 'temp', 2, null); ui.cell = 27; ui.request();
    const ctx = ui.canvas.getContext('2d'), fillText = ctx.fillText.bind(ctx); window.graphText = [];
    ctx.fillText = (...args) => { window.graphText.push(args[0]); return fillText(...args); };
    ui.receive({ requestId: ui.requestId, interval: 1800, samples: Array.from({ length: 49 }, (_, i) => ({ time: i * 1800, value: 20 + Math.sin(i / 3) })) });
  });
  const host = page.locator('#samplingHarness'), canvas = host.locator('#pinSeriesChart');
  await expect(host.locator('#pinSeriesInterval')).toHaveValue('3600');
  await expect(host.locator('#pinSeriesYAxis')).toHaveText('水温 / °C');
  await expect(canvas).toHaveAttribute('data-points', '25');
  const texts = await page.evaluate(() => window.graphText);
  expect(texts).toContain('計算経過時間 (h)'); expect(texts).toContain('4'); expect(texts).toContain('12'); expect(texts).toContain('24');
  await host.locator('#pinSeriesInterval').selectOption('10800');
  await expect(canvas).toHaveAttribute('data-points', '9'); await expect(canvas).toHaveAttribute('data-averaged', 'true');
  await host.locator('#pinSeriesAverage').uncheck(); await expect(canvas).toHaveAttribute('data-averaged', 'false');
  await host.locator('#pinSeriesAverage').check();
  await host.locator('#pinSeries').screenshot({ path: 'test-results/series-compact-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await host.locator('#pinSeries').screenshot({ path: 'test-results/series-compact-mobile.png' });
  expect((await canvas.boundingBox()).height).toBe(160);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
