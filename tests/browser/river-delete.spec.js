import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

async function cell(page, p) {
  const rect = await page.locator('#mapCanvas').boundingBox();
  const size = Math.min(rect.width - 104, rect.height - 104);
  await page.mouse.click(rect.x + rect.width / 2 + ((p % 8 + .5) / 8 - .5) * size,
    rect.y + rect.height / 2 - ((Math.floor(p / 8) + .5) / 8 - .5) * size);
}

for (const method of ['map', 'terrain-list', 'river-settings']) {
  test(`delete river after filling its receiving sea cell: ${method}`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const config = defaults();
    Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 100, edits: { 27: 0, 45: 0 } });
    await page.goto('/'); await loadSettings(page, config);
    await page.locator('[data-view="map"]').click();
    await page.locator('#riverBrush').selectOption('river-add');
    await cell(page, 27); await cell(page, 45);
    expect((await readSettings(page)).rivers).toHaveLength(2);
    await page.locator('#brushSize').selectOption('1');
    await page.locator('#brush').selectOption('land');
    await cell(page, 26);
    await expect(page.locator('#validation')).toContainText('河川の沿岸地形');
    await expect(page.locator('#hoverValue')).toContainText('陸域');
    await page.locator('#riverBrush').selectOption('river-delete');
    if (method === 'map') await cell(page, 27);
    else {
      if (method === 'river-settings') await page.locator('[data-step="4"]').click();
      await page.locator('[data-remove-river="0"]').click();
    }
    await expect(page.locator('#validation .error')).toHaveCount(0);
    const saved = await readSettings(page);
    expect(saved.rivers).toHaveLength(1); expect(saved.rivers[0].landCell).toBe(45);
    expect(saved.grid.edits[26]).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('removing river land can be undone or the invalid river deleted', async ({ page }) => {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', edits: { 27: 0 } });
  await page.goto('/'); await loadSettings(page, config);
  await page.locator('[data-view="map"]').click();
  await page.locator('#riverBrush').selectOption('river-add'); await cell(page, 27);
  const original = (await readSettings(page)).rivers;
  await page.locator('#brushSize').selectOption('1');
  await page.locator('#brush').selectOption('water'); await cell(page, 27);
  await expect(page.locator('#validation')).toContainText('河川 1');
  await expect(page.locator('#hoverValue')).toContainText('水深');
  await page.locator('#undoTerrain').click();
  await expect(page.locator('#validation .error')).toHaveCount(0);
  expect((await readSettings(page)).rivers).toEqual(original);
  await page.locator('#redoTerrain').click();
  await expect(page.locator('#validation')).toContainText('河川 1');
  await page.locator('#riverBrush').selectOption('river-delete'); await cell(page, 27);
  await expect(page.locator('#validation .error')).toHaveCount(0);
  expect((await readSettings(page)).rivers).toEqual([]);
});

test('3D river marker picks its own land cell at an oblique angle', async ({ page }) => {
  await page.goto('/');
  const picked = await page.evaluate(async () => {
    const { OceanView } = await import('/src/view.js');
    const { defaults, buildFields } = await import('/src/model.js');
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:800px;height:600px';
    const container = document.createElement('div'), canvas = document.createElement('canvas');
    host.append(container, canvas); document.body.append(host);
    const view = new OceanView(container, canvas, () => {});
    const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', edits: { 27: 0 } });
    view.set(buildFields(config), 'h', 0, '3d', 0, false);
    view.setRivers([{ landCell: 27, cell: 26 }]); view.resize();
    view.camera.position.set(12, 1, 15); view.controls.target.set(0, 0, 0); view.controls.update(); view.render3d();
    const marker = view.group.children.find(child => child.userData.riverCell === 27);
    const position = marker.position.clone().project(view.camera), rect = view.renderer.domElement.getBoundingClientRect();
    const hit = view.hitAt3d({ clientX: rect.left + (position.x + 1) * rect.width / 2, clientY: rect.top + (1 - position.y) * rect.height / 2 });
    view.observer.disconnect(); view.controls.dispose(); view.renderer.dispose(); host.remove();
    return hit?.p;
  });
  expect(picked).toBe(27);
});
