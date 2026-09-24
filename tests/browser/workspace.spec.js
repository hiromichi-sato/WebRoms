import { test, expect } from '@playwright/test';
import { defaults } from '../../src/model.js';

test('direct file opening explains the HTTP requirement', async ({ page }) => {
  await page.goto(new URL('../../dist/index.html', import.meta.url).href);
  await expect(page.locator('#startupError')).toBeVisible();
  await expect(page.locator('#startupError')).toContainText('node server.js');
  expect(await page.locator('script[src]').count()).toBe(0);
});

async function expectVisibleScene(page) {
  const colors = await page.locator('#threeView canvas').evaluate(source => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 100;
    const context = canvas.getContext('2d'); context.drawImage(source, 0, 0, 120, 100);
    const pixels = context.getImageData(0, 0, 120, 100).data, unique = new Set();
    for (let p = 0; p < pixels.length; p += 4) unique.add(`${pixels[p]},${pixels[p + 1]},${pixels[p + 2]}`);
    return unique.size;
  });
  expect(colors).toBeGreaterThan(30);
}

test('boundary face painting, gradients and view switching work without page errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open' });
  await page.goto('/');
  await page.evaluate(config => localStorage.setItem('webroms.project.v1', JSON.stringify(config)), config);
  await page.reload(); await page.locator('[data-step="2"]').click();
  await expect(page.locator('#mapCanvas')).toBeVisible();
  await page.getByLabel('境界形式').selectOption('specified');
  await page.locator('#editValue').fill('23');
  const box = await page.locator('#mapCanvas').boundingBox();
  await page.mouse.click(box.x + 54 + (box.width - 108) * 3.5 / 8, box.y + 125);
  await expect(page.locator('#hoverValue')).toContainText('23 °C');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('webroms.project.v1')).boundary.west.painted.temp[2][3])).toBe(23);
  await page.locator('#boundaryGradient').click();
  await page.screenshot({ path: 'test-results/boundary-face.png', fullPage: true });
  await page.locator('[data-step="0"]').click();
  await expect(page.locator('#legendTitle')).toHaveText('水深 / m');
  await page.locator('[data-step="1"]').click();
  await page.screenshot({ path: 'test-results/initial-editor.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-step="2"]').click();
  await page.screenshot({ path: 'test-results/boundary-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('land boundary explains why painting is unavailable and does not save hidden values', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-step="2"]').click();
  await page.getByLabel('境界形式').selectOption('specified');
  await expect(page.locator('#boundaryNotice')).toContainText('すべて陸域');
  const before = await page.evaluate(() => localStorage.getItem('webroms.project.v1'));
  const box = await page.locator('#mapCanvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 130);
  await expect(page.locator('#toast')).toContainText('このセルは陸域');
  expect(await page.evaluate(() => localStorage.getItem('webroms.project.v1'))).toBe(before);
});

test('desktop and mobile scenes render and settings persist', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/'); await expect(page.locator('#wetCount')).not.toHaveText('—');
  await expectVisibleScene(page);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  const before = await page.locator('#threeView canvas').evaluate(canvas => canvas.toDataURL());
  const bounds = await page.locator('#threeView canvas').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2 + 50, { steps: 10 }); await page.mouse.up();
  expect(await page.locator('#threeView canvas').evaluate(canvas => canvas.toDataURL())).not.toEqual(before);
  await page.locator('[data-step="2"]').click(); await page.getByLabel('境界形式').selectOption('specified');
  await expect(page.locator('#mapCanvas')).toBeVisible();
  await page.locator('.boundary-baseline summary').click();
  const temperature = page.getByLabel('西 / 左 第1層 temp', { exact: true }); await temperature.fill('24'); await temperature.blur();
  await page.locator('[data-step="0"]').click(); await page.getByLabel('鉛直層数').fill('4'); await page.getByLabel('鉛直層数').blur();
  await page.locator('[data-step="2"]').click(); await expect(temperature).toHaveValue('24');
  await page.reload(); await page.locator('[data-step="2"]').click(); await expect(temperature).toHaveValue('24');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-step="0"]').click();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await expectVisibleScene(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('browser runs the bundled ROMS worker to steady state and exports results', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
  config.initial.distribution = 'uniform';
  Object.assign(config.numerics, { maxSteps: 30, steadyWindow: 5, tolerance: 1e-10 });
  await page.goto('/');
  await page.evaluate(config => localStorage.setItem('webroms.project.v1', JSON.stringify(config)), config);
  await page.reload(); await page.locator('[data-step="3"]').click();
  await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('定常判定達成', { timeout: 60000 });
  await expect(page.locator('#runLog')).toContainText('ROMS: DONE');
  const downloading = page.waitForEvent('download');
  await page.locator('#resultButton').click();
  const download = await downloading;
  await download.saveAs('test-results/browser-results.json');
  await page.screenshot({ path: 'test-results/computed.png', fullPage: true });
  await page.locator('[data-step="0"]').click();
  await page.getByLabel('X格子数').fill('10'); await page.getByLabel('X格子数').blur();
  await expect(page.locator('#convergence')).toHaveText('未計算');
  await expect(page.locator('#resultButton')).toBeDisabled();
  expect(errors).toEqual([]);
});
