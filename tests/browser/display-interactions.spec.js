import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('pin toggles off and retains the plotted data while a newer request is pending', async ({ page }) => {
  await page.goto('/');
  const state = await page.evaluate(async () => {
    const { PinSeriesControls } = await import('/src/pin-series-controls.js');
    const host = document.createElement('div'), toolbar = document.createElement('div'), container = document.createElement('div'), canvas = document.createElement('canvas');
    host.style.width = '600px'; host.append(toolbar, container, canvas); document.body.append(host);
    const view = { container, canvas, mode: 'map', fields: { nx: 8, nz: 3, mask: new Uint8Array(64).fill(1) }, cellAt: () => 27, pinPosition: () => ({ x: 100, y: 100 }) };
    const messages = [], worker = { postMessage: m => messages.push(m) };
    const ui = new PinSeriesControls(view, toolbar, host, { temp: '水温' });
    const click = () => { canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 })); canvas.dispatchEvent(new PointerEvent('pointerup', { button: 0, clientX: 10, clientY: 10 })); };
    ui.update(true, worker, 1, 'temp', 2, null); ui.button.click(); click();
    ui.receive({ requestId: messages.at(-1).requestId, interval: 1800, samples: [{ time: 0, value: 20 }, { time: 1, value: 21 }] });
    const data = ui.data, summary = ui.summary.textContent;
    ui.update(true, worker, 2, 'temp', 2, null);
    const retained = ui.data === data && ui.summary.textContent === summary;
    const second = messages.at(-1); ui.update(true, worker, 3, 'temp', 2, null);
    const bounded = messages.length === 2;
    ui.receive({ requestId: second.requestId, interval: 1800, samples: [{ time: 0, value: 20 }, { time: 2, value: 22 }] });
    const caughtUp = messages.length === 3 && ui.data.samples.at(-1).time === 2;
    ui.marker.click(); const markerClosed = ui.root.hidden && !ui.placing;
    ui.button.click(); click(); ui.button.click(); const offClosed = ui.root.hidden && !ui.placing;
    ui.button.click(); click(); click(); const cellClosed = ui.root.hidden;
    return { retained, bounded, caughtUp, markerClosed, offClosed, cellClosed };
  });
  expect(Object.values(state)).toEqual([true, true, true, true, true, true]);
});

test('section line drags in 3D and map without rotating or placing a pin', async ({ page }) => {
  await page.goto('/');
  const coords = await page.evaluate(async () => {
    const { OceanView } = await import('/src/view.js');
    const { defaults, buildFields } = await import('/src/model.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:800px;height:600px;z-index:100;background:white';
    const container = document.createElement('div'), canvas = document.createElement('canvas');
    host.append(container, canvas); document.body.append(host);
    const view = new OceanView(container, canvas, () => {}); window.testSectionView = view;
    const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' });
    const fields = buildFields(c); view.setCompanion('section'); view.set(fields, 'temp', 2, '3d', 3); view.resize();
    view.onSectionChange = row => view.set(fields, 'temp', 2, view.mode, row);
    const project = row => {
      const p = view.sectionTrace.position.clone(); p.z = view.vectorLayout.height / 2 - (row + .5) * view.vectorLayout.dy; p.project(view.camera);
      const b = view.renderer.domElement.getBoundingClientRect(); return { x: b.left + (p.x + 1) * b.width / 2, y: b.top + (1 - p.y) * b.height / 2 };
    };
    return { start: project(3), end: project(5), camera: view.camera.position.toArray() };
  });
  await page.mouse.move(coords.start.x, coords.start.y); await page.mouse.down();
  await page.mouse.move(coords.end.x, coords.end.y, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => window.testSectionView.slice)).toBe(5);
  expect(await page.evaluate(() => window.testSectionView.camera.position.toArray())).toEqual(coords.camera);
  const map = await page.evaluate(() => {
    const v = window.testSectionView; v.set(v.fields, 'temp', 2, 'map', 5); v.zoom(1);
    const b = v.canvas.getBoundingClientRect(), r = v.rect;
    return { x: b.left + r.x + r.width / 2, start: b.top + r.y + (8 - 5.5) * r.height / 8, end: b.top + r.y + (8 - 2.5) * r.height / 8 };
  });
  await page.mouse.move(map.x, map.start); await page.mouse.down(); await page.mouse.move(map.x, map.end, { steps: 8 }); await page.mouse.up();
  expect(await page.evaluate(() => window.testSectionView.slice)).toBe(2);
});

test('advanced diagnostics share depth, color and pin controls with the normal display', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
  Object.assign(c.numerics, { dt: 1, maxSteps: 20 }); c.ecosystem.enabled = true;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await loadSettings(page, c); await page.locator('[data-step="6"]').click();
  await page.locator('#calculateButton').click(); await expect(page.locator('#convergence')).toHaveText('完了');
  await page.locator('#diagnosticSelect').selectOption('diagVorticity');
  await expect(page.locator('#legendTitle')).toContainText('相対渦度');
  await page.locator('#diagnosticSelect').selectOption('diagProduction');
  await expect(page.locator('#legendTitle')).toContainText('光合成');
  await page.locator('#resultLevelMode').selectOption('depth'); await page.locator('#resultDepthNumber').fill('10');
  await page.locator('[data-view="map"]').click(); await page.locator('#pinSeriesToggle').click();
  const b = await page.locator('#mapCanvas').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('#pinSeriesChart')).toHaveAttribute('data-points', '2');
  await expect(page.locator('#pinSeriesYAxis')).toContainText('光合成');
  await page.locator('#diagnosticSelect').selectOption('diagKv');
  await expect(page.locator('#legendTitle')).toContainText('鉛直拡散係数');
  await expect(page.locator('#pinSeriesYAxis')).toContainText('m²/s');
  await expect(page.locator('#pinSeriesChart')).toHaveAttribute('data-points', '2');
  await page.locator('#pinSeriesToggle').click(); await expect(page.locator('#pinSeries')).toBeHidden();
  await page.locator('[data-view="3d"]').click(); await expect(page.locator('#sliceControl')).toBeHidden();
  await page.screenshot({ path: 'test-results/advanced-display-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/advanced-display-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#fieldSelect').selectOption('salt'); await expect(page.locator('#diagnosticSelect')).toHaveValue('');
  expect(errors).toEqual([]);
});
