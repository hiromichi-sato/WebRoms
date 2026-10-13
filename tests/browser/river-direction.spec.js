import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { NetCDFReader } from 'netcdfjs';

test('05 has no section and river arrows follow selected receivers, history and native inputs', async ({ page }) => {
  await page.goto('/'); const c = fixture(); c.grid.edits[27] = 0;
  c.rivers = [{ id: 'river-a', landCell: 27, cell: 26, flow: 10, temp: 18, salt: 0 }]; c.numerics.maxSteps = 10;
  await loadSettings(page, c); await page.locator('.steps [data-step="4"]').click();
  await expect(page.locator('[data-view="section"]')).toBeHidden();
  await expect(page.locator('#sectionCanvas')).toBeHidden();
  await expect(page.locator('#threeView')).toHaveAttribute('data-river-arrow-count', '1');
  const selector = page.getByLabel('河川 1 の流入方向'); await expect(selector.locator('option')).toHaveCount(4);
  await selector.selectOption('35'); expect((await readSettings(page)).rivers[0].cell).toBe(35);
  await page.locator('#undoRiver').click(); expect((await readSettings(page)).rivers[0].cell).toBe(26);
  await page.locator('#redoRiver').click(); expect((await readSettings(page)).rivers[0].cell).toBe(35);
  await page.locator('[data-view="map"]').click(); await page.screenshot({ path: 'test-results/river-direction-map.png' });
  await page.locator('[data-view="3d"]').click(); await page.screenshot({ path: 'test-results/river-direction-3d.png' });
  await page.locator('.steps [data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了');
  await page.locator('#resultButton').click(); await page.locator('#exportFormat').selectOption('netcdf'); await page.locator('#downloadResults').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.some(f => f.name.endsWith('.nc')))).toBe(true);
  const bytes = await page.evaluate(async () => [...new Uint8Array(await window.__fileWrites.find(f => f.name.endsWith('.nc')).blob.arrayBuffer())]);
  const nc = new NetCDFReader(Uint8Array.from(bytes)); expect(nc.getDataVariable('zeta').some(z => z > 0)).toBe(true);
});
