import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

test('ecosystem uses the calculation selector without a skip button', async ({ page }) => {
  await page.goto('/'); await loadSettings(page, fixture());
  await page.locator('[data-step="1"]').click();
  await expect(page.locator('#skipEcosystem')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '計算をスキップ' })).toHaveCount(0);
  await page.getByLabel('生態系の計算').selectOption('false');
  await expect(page.locator('#stepTitle')).toHaveText('生態系モデル');
  expect((await readSettings(page)).ecosystem.enabled).toBe(false);
  await page.getByLabel('生態系の計算').selectOption('true');
  expect((await readSettings(page)).ecosystem.enabled).toBe(true);
});
