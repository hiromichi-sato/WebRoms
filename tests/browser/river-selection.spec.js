import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

for (const width of [1280, 390]) test(`river map click opens its editor and form focus highlights the active river at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  const config = fixture(); config.grid.edits = { 27: 0, 45: 0 };
  config.rivers = [{ id: 'a', landCell: 27, cell: 26, flow: 10, temp: 18, salt: 0 }, { id: 'b', landCell: 45, cell: 44, flow: 20, temp: 19, salt: 0 }];
  await loadSettings(page, config); await page.locator('[data-step="4"]').click();
  await expect(page.locator('[data-river-editor="0"]')).toHaveClass(/river-editor-selected/);
  await page.locator('[data-river-editor="1"] [data-path="rivers.1.flow"]').focus();
  await expect(page.locator('#threeView')).toHaveAttribute('data-selected-river-cell', '45');
  await expect(page.locator('[data-river-editor="1"]')).toHaveClass(/river-editor-selected/);
  await page.locator('[data-view="map"]').click();
  await page.locator('#mapCanvas').scrollIntoViewIfNeeded();
  const rect = await page.locator('#mapCanvas').boundingBox(), size = Math.min(rect.width - 104, rect.height - 104), p = 27;
  const x = rect.x + rect.width / 2 + ((p % 8 + .5) / 8 - .5) * size;
  const y = rect.y + rect.height / 2 - ((Math.floor(p / 8) + .5) / 8 - .5) * size;
  await page.mouse.move(x, y);
  await expect(page.locator('#threeView')).toHaveAttribute('data-selected-river-cell', '45');
  await page.mouse.click(x, y);
  await expect(page.locator('#threeView')).toHaveAttribute('data-selected-river-cell', '27');
  await expect(page.locator('[data-river-editor="0"]')).toHaveClass(/river-editor-selected/);
  await expect(page.locator('[data-river-editor="1"]')).not.toHaveClass(/river-editor-selected/);
  await expect(page.locator('[data-river-editor="0"] select')).toBeFocused();
  await page.screenshot({ path: `test-results/river-selection-${width}.png` });
});

test('3D marker click selects a river but dragging does not', async ({ page }) => {
  await page.goto('/');
  const position = await page.evaluate(async () => {
    const { OceanView } = await import('/src/view.js'), { defaults, buildFields } = await import('/src/model.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:800px;height:600px;z-index:999';
    const container = document.createElement('div'), canvas = document.createElement('canvas'); host.append(container, canvas); document.body.append(host);
    const view = new OceanView(container, canvas, () => {}), config = defaults();
    Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', edits: { 27: 0 } });
    view.set(buildFields(config), 'h', 0, '3d', 0, false); view.setRivers([{ landCell: 27, cell: 26 }]); view.resize();
    view.onRiverSelect = cell => { window.__pickedRiver = cell; }; window.__riverTestView = view;
    const marker = view.group.children.find(child => child.userData.riverCell === 27), point = marker.position.clone().project(view.camera), rect = view.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
  });
  await page.mouse.click(position.x, position.y);
  expect(await page.evaluate(() => window.__pickedRiver)).toBe(27);
  await page.evaluate(() => { window.__pickedRiver = null; });
  await page.mouse.move(position.x, position.y); await page.mouse.down(); await page.mouse.move(position.x + 40, position.y + 30, { steps: 5 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__pickedRiver)).toBeNull();
  await page.evaluate(() => { const v = window.__riverTestView; v.observer.disconnect(); v.controls.dispose(); v.renderer.dispose(); v.container.parentElement.remove(); });
});

test('deleting the selected river selects the remaining editor and supports undo', async ({ page }) => {
  await page.goto('/'); const config = fixture(); config.grid.edits = { 27: 0, 45: 0 };
  config.rivers = [{ id: 'a', landCell: 27, cell: 26, flow: 10, temp: 18, salt: 0 }, { id: 'b', landCell: 45, cell: 44, flow: 20, temp: 19, salt: 0 }];
  await loadSettings(page, config); await page.locator('[data-step="4"]').click();
  await page.locator('[data-river-editor="1"] [data-path="rivers.1.flow"]').focus();
  await page.locator('[data-river-editor="1"] [data-remove-river]').click();
  await expect(page.locator('[data-river-editor]')).toHaveCount(1);
  await expect(page.locator('#threeView')).toHaveAttribute('data-selected-river-cell', '27');
  expect((await readSettings(page)).rivers).toHaveLength(1);
  await page.locator('#undoRiver').click(); await expect(page.locator('[data-river-editor]')).toHaveCount(2);
  await expect(page.locator('[data-river-editor].river-editor-selected')).toHaveCount(1);
});
