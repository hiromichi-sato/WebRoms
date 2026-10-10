import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('returning to boundary uses new layers, SSH keeps vectors and download is above results', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 100 });
  c.initial.anchors.temp = { 2: 22 }; c.initial.u = .2; c.initial.v = .1;
  Object.assign(c.numerics, { dt: 1, maxSteps: 2 });
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="3"]').click();
  for (const nz of [8, 15, 2, 5]) {
    await page.locator('[data-step="0"]').click();
    await page.locator('[data-path="grid.nz"]').fill(String(nz)); await page.locator('[data-path="grid.nz"]').blur();
    await expect(page.locator('#validation .error')).toHaveCount(0);
    await page.locator('[data-step="3"]').click();
    await expect(page.locator('#boundaryLayer option')).toHaveCount(nz);
    await expect(page.locator('.boundary-baseline table').first().locator('tbody tr')).toHaveCount(nz);
    await expect(page.locator('#sectionCanvas')).toHaveAttribute('data-layers', String(nz));
    await expect(page.locator('#layerMetric')).toHaveText(`${nz} 層`);
    await expect(page.locator('#boundaryBrush')).toHaveValue('inspect');
  }
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('完了');
  await expect(page.locator('#resultActions #resultButton')).toBeEnabled();
  await page.locator('#fieldSelect').selectOption('zeta');
  await page.locator('#vectorToggle').check();
  await page.locator('#layerSelect').selectOption('0');
  const canvas = page.locator('#threeView canvas');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const button = await page.locator('#resultButton').boundingBox(), toolbar = await page.locator('.view-toolbar').boundingBox();
    expect(button.y + button.height).toBeLessThan(toolbar.y);
    const withVectors = await canvas.evaluate(c => c.toDataURL());
    await page.locator('#vectorToggle').uncheck();
    const withoutVectors = await canvas.evaluate(c => c.toDataURL()); expect(withVectors).not.toBe(withoutVectors);
    await page.locator('#vectorToggle').check();
    await page.locator('#resultLevelMode').selectOption('depth');
    await page.locator('#resultDepth').evaluate(e => { e.value = 20; e.dispatchEvent(new Event('input')); });
    expect(Number(await page.locator('#threeView').getAttribute('data-vector-count'))).toBeGreaterThan(0);
    await page.locator('.workspace').screenshot({ path: `test-results/ssh-results-${width}.png` });
    await page.locator('#resultButton').click(); await expect(page.locator('#resultsDialog')).toBeVisible(); await page.locator('#closeResults').click();
  }
  expect(errors).toEqual([]);
});
