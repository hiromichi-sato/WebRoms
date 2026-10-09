import { test, expect } from '@playwright/test';
import { defaults } from '../../src/model.js';

async function nonblank(canvas) {
  const colors = await canvas.evaluate(source => {
    const copy = document.createElement('canvas'); copy.width = 120; copy.height = 100;
    const ctx = copy.getContext('2d'); ctx.drawImage(source, 0, 0, 120, 100);
    const pixels = ctx.getImageData(0, 0, 120, 100).data, values = new Set();
    for (let p = 0; p < pixels.length; p += 4) values.add(`${pixels[p]},${pixels[p + 1]},${pixels[p + 2]}`);
    return values.size;
  });
  expect(colors).toBeGreaterThan(10);
}

test('results support depth interpolation, 3D vectors, scale legends and mobile navigation', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 20, maxDepth: 100 });
  Object.assign(c.initial, { u: .1, v: .05 }); Object.assign(c.numerics, { dt: 1, maxSteps: 2 });
  await page.goto('/'); await page.evaluate(c => localStorage.setItem('webroms.project.v1', JSON.stringify(c)), c); await page.reload();
  await page.locator('.steps [data-step="6"]').click();
  await page.locator('#calculateButton').click(); await expect(page.locator('#convergence')).toHaveText('完了');
  await expect(page.locator('[data-view="section"]')).toBeHidden();
  const primary = page.locator('#threeView canvas'), section = page.locator('#sectionCanvas');
  await expect(section).toBeVisible();
  const before = await primary.evaluate(c => c.toDataURL());
  await page.locator('#vectorToggle').check();
  await expect(primary).toBeVisible(); await expect(page.locator('#vectorLegend')).toBeVisible();
  expect(Number(await page.locator('#threeView').getAttribute('data-vector-count'))).toBeGreaterThan(0);
  expect(await primary.evaluate(c => c.toDataURL())).not.toBe(before);
  await page.locator('#resultLevelMode').selectOption('depth');
  await expect(page.locator('#layerSelect')).toBeHidden();
  await page.locator('#resultDepth').evaluate(e => { e.value = 50; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect(page.locator('#resultDepthValue')).toHaveText('50 m');
  await expect(section).toHaveAttribute('data-depth', '50');
  expect(Number(await page.locator('#threeView').getAttribute('data-vector-count'))).toBeGreaterThan(0);
  const atDepth = await primary.evaluate(c => c.toDataURL());
  await page.locator('#vectorScale').selectOption('linear');
  expect(await primary.evaluate(c => c.toDataURL())).not.toBe(atDepth);
  await page.locator('#vectorScale').selectOption('log');
  await page.locator('#panView').click(); await page.locator('#zoomIn').click();
  const rect = await primary.boundingBox(), zoomed = await primary.evaluate(c => c.toDataURL());
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 50, rect.y + rect.height / 2 + 35, { steps: 8 }); await page.mouse.up();
  expect(await primary.evaluate(c => c.toDataURL())).not.toBe(zoomed);
  await page.locator('#homeView').click();
  await nonblank(primary); await nonblank(section);
  await page.locator('#viewport').screenshot({ path: 'test-results/depth-3d-desktop.png' });
  await page.screenshot({ path: 'test-results/depth-desktop.png', fullPage: true });
  await page.locator('[data-view="map"]').click(); await expect(page.locator('#mapCanvas')).toBeVisible();
  await page.locator('#resultLevelMode').selectOption('layer'); await expect(page.locator('#layerSelect')).toBeVisible();
  await page.locator('#fieldSelect').selectOption('u'); await expect(page.locator('#layerSelect')).toBeEnabled();
  await page.locator('#layerSelect').selectOption('0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-view="3d"]').click();
  await page.locator('#resultLevelMode').selectOption('depth');
  await page.locator('#resultDepth').press('Home');
  await expect(section).toHaveAttribute('data-depth', '0');
  await nonblank(primary); await nonblank(section);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#viewport').screenshot({ path: 'test-results/depth-3d-mobile.png' });
  await page.screenshot({ path: 'test-results/depth-mobile.png', fullPage: true });
  await page.locator('.steps [data-step="2"]').click();
  await expect(page.locator('[data-view="section"]')).toBeVisible();
  await expect(page.locator('.result-controls')).toBeHidden();
  expect(errors).toEqual([]);
});
