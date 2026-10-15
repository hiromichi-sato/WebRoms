import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

for (const width of [1280, 390]) test(`boundary sea level is visible and editable in cm at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  const config = fixture(); config.initial.zeta = .1; config.initial.painted.zeta = [{ 0: .3 }];
  for (const boundary of Object.values(config.boundary)) { boundary.mode = 'specified'; boundary.fromInitial = true; }
  config.ocean = { seaLevelEnabled: true, tideMode: 'off' };
  await loadSettings(page, config); await page.locator('[data-step="3"]').click();
  await expect(page.locator('#seaLevelEditor')).toBeHidden();
  await page.locator('#boundaryVariable').selectOption('zeta');
  const number = page.locator('#seaLevelValue');
  await expect(number).toHaveValue('12.5');
  await expect(page.locator('.sea-level-summary')).toContainText('最小 10 cm');
  await number.fill('25'); await number.press('Tab');
  await expect(number).toHaveValue('25');
  await expect(page.locator('#boundaryFromInitial')).not.toBeChecked();
  await page.locator('#seaLevelTarget').selectOption('0');
  await expect(number).toHaveValue('42.5');
  await number.fill('50'); await number.press('Tab'); await expect(number).toHaveValue('50');
  const saved = await readSettings(page);
  expect(saved.boundary.west.painted.zeta[0][0]).toBe(.5);
  expect(saved.initial.zeta).toBe(.1); expect(saved.initial.painted.zeta[0][0]).toBe(.3);
  await page.locator('#undoBoundary').click(); await expect(number).toHaveValue('42.5');
  await page.locator('#redoBoundary').click(); await expect(number).toHaveValue('50');
  await page.locator('#seaLevelOffset').evaluate(el => { el.value = '10'; el.dispatchEvent(new Event('input')); }); await page.locator('#seaLevelOffset').dispatchEvent('change');
  await expect(number).toHaveValue('60');
  await page.locator('#editToolOptions').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/sea-level-editor-${width}.png`, fullPage: true });
  await page.locator('#seaLevelEnabled').uncheck(); await expect(page.locator('#seaLevelOptions')).toBeHidden();
});
