import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('automatic vertical mixing is default; fixed coefficient is an advanced option', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-step="6"]').click();
  await expect(page.locator('#settingsForm [data-path]').first()).toHaveAttribute('data-path', 'numerics.dt');
  await expect(page.locator('#mixingAdvanced')).not.toHaveAttribute('open');
  await expect(page.locator('[data-path="numerics.verticalDiffusion"]')).toHaveCount(0);
  await page.locator('#mixingAdvanced summary').click();
  await expect(page.locator('#fixedVerticalDiffusion')).not.toBeChecked();
  await page.locator('#fixedVerticalDiffusion').check();
  await expect(page.locator('[data-path="numerics.verticalDiffusion"]')).toBeVisible();
  await page.locator('[data-path="numerics.verticalDiffusion"]').fill('0.003');
  const fixed = await readSettings(page);
  expect(fixed.numerics.calculateDiffusion).toBe(false);
  expect(fixed.numerics.verticalDiffusion).toBe(0.003);
  await page.locator('#fixedVerticalDiffusion').uncheck();
  await expect(page.locator('[data-path="numerics.verticalDiffusion"]')).toHaveCount(0);
  expect((await readSettings(page)).numerics.calculateDiffusion).toBe(true);
  const legacy = defaults(); delete legacy.numerics.calculateDiffusion;
  await loadSettings(page, legacy);
  await page.locator('[data-step="6"]').click();
  await expect(page.locator('#fixedVerticalDiffusion')).toBeChecked();
  await expect(page.locator('[data-path="numerics.verticalDiffusion"]')).toBeVisible();
});

test('default GLS worker completes a calculation', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' });
  c.numerics.maxSteps = 10;
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="6"]').click();
  await page.locator('#calculateButton').click();
  await expect(page.locator('#phaseText')).toContainText('計算完了', { timeout: 30000 });
  await expect(page.locator('#resultButton')).toBeEnabled();
});
