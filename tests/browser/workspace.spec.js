import { test, expect } from '@playwright/test';

test('desktop and mobile scenes render and settings persist', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/'); await expect(page.locator('#wetCount')).not.toHaveText('—');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  const before = await page.locator('#threeView canvas').evaluate(canvas => canvas.toDataURL());
  const bounds = await page.locator('#threeView canvas').boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2 + 50, { steps: 10 }); await page.mouse.up();
  expect(await page.locator('#threeView canvas').evaluate(canvas => canvas.toDataURL())).not.toEqual(before);
  await page.locator('[data-step="2"]').click(); await page.getByLabel('境界形式').selectOption('specified');
  const temperature = page.getByLabel('西 / 左 第1層 temp', { exact: true }); await temperature.fill('24'); await temperature.blur();
  await page.locator('[data-step="0"]').click(); await page.getByLabel('鉛直層数').fill('4'); await page.getByLabel('鉛直層数').blur();
  await page.locator('[data-step="2"]').click(); await expect(temperature).toHaveValue('24');
  await page.reload(); await page.locator('[data-step="2"]').click(); await expect(temperature).toHaveValue('24');
  await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-step="0"]').click();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
