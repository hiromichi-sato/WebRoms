import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

for (const width of [1280, 390]) test(`land polygon builds terrain with visible progress and JSON roundtrip at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  const config = fixture(); Object.assign(config.grid, { preset: 'uniform', minDepth: 20, maxDepth: 20, geoBounds: { west: 135, east: 136, south: 34, north: 35 }, edits: {} });
  await loadSettings(page, config);
  await page.locator('#coastlineSource').selectOption('polygon');
  const bytes = await page.evaluate(async () => {
    const { shapeFiles } = await import('/src/shape-io.js'), { zipSync } = await import('/vendor/fflate.js');
    const ring = [[134,33],[135.4,33],[135.4,36],[134,36],[134,33]];
    return Array.from(zipSync(shapeFiles('land', [{ LAND: 1 }], [[ring]], true)));
  });
  await page.locator('#coastlineImport').setInputFiles({ name: 'land.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await page.route('**/src/terrain-build-worker.js', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  await page.locator('#applyCoastline').click();
  await expect(page.locator('#coastlineProgress')).toBeVisible();
  await expect(page.locator('#coastlineProgress .terrain-build-spinner')).toBeVisible();
  await expect(page.locator('#applyCoastline')).toBeDisabled();
  await expect(page.locator('#toast')).toContainText('地形を構築しました');
  await expect(page.locator('#coastlineProgress')).toBeHidden();
  const saved = await readSettings(page);
  expect(saved.grid.edits[0]).toBe(0); expect(saved.grid.edits[7]).toBe(20);
  expect(saved.grid.coastline.landCells).toBeGreaterThan(0);
  await page.locator('#undoTerrain').click();
  expect((await readSettings(page)).grid.coastline).toBeUndefined();
  await page.locator('#redoTerrain').click();
  expect((await readSettings(page)).grid.edits).toEqual(saved.grid.edits);
  await loadSettings(page, saved);
  expect((await readSettings(page)).grid.coastline).toEqual(saved.grid.coastline);
  await page.locator('#coastlineImport').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/coastline-${width}.png`, fullPage: true });
});

test('missing coast companions show an error without changing terrain', async ({ page }) => {
  await page.goto('/'); await loadSettings(page, fixture());
  await page.locator('#coastlineSource').selectOption('polygon');
  const before = await readSettings(page);
  await page.locator('#applyCoastline').click();
  await expect(page.locator('#coastlineError')).toBeVisible();
  await expect(page.locator('#coastlineProgress')).toBeHidden();
  expect((await readSettings(page)).grid).toEqual(before.grid);
});
