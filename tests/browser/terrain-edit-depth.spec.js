import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

test('terrain metre brush preserves the minimum, fills shallower cells to land, and supports history', async ({ page }) => {
  await page.goto('/'); const c = fixture();
  Object.assign(c.grid, { preset: 'uniform', minDepth: 20, maxDepth: 100, edits: { 27: 25 } });
  await loadSettings(page, c);
  const amount = page.getByLabel('地形の編集量'); await expect(amount).toHaveValue('20');
  await expect(page.getByRole('button', { name: '陸にする', exact: true })).toHaveCount(0);
  await amount.fill('5'); await amount.dispatchEvent('change');
  await page.locator('[data-view="map"]').click();
  await page.locator('[data-edit-tool="fill"]').click();
  const canvas = page.locator('#mapCanvas');
  const point = await canvas.evaluate(el => {
    const r = el.getBoundingClientRect(), side = Math.min(r.width - 104, r.height - 104);
    return { x: (r.width - side) / 2 + 3.5 / 8 * side, y: (r.height - side) / 2 + 4.5 / 8 * side };
  });
  await canvas.click({ position: point }); expect((await readSettings(page)).grid.edits[27]).toBe(20);
  await canvas.click({ position: point }); expect((await readSettings(page)).grid.edits[27]).toBe(0);
  await page.locator('#undoTerrain').click(); expect((await readSettings(page)).grid.edits[27]).toBe(20);
  await page.locator('#redoTerrain').click(); expect((await readSettings(page)).grid.edits[27]).toBe(0);
  await page.locator('[data-edit-tool="dig"]').click();
  await canvas.click({ position: point }); expect((await readSettings(page)).grid.edits[27]).toBe(0);
  await amount.fill('20'); await amount.dispatchEvent('change');
  await canvas.click({ position: point }); expect((await readSettings(page)).grid.edits[27]).toBe(20);
  expect((await readSettings(page)).grid.editDepth).toBe(20);
});
