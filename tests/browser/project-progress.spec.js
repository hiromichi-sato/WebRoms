import { test, expect, loadSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

for (const width of [1280, 390]) test(`project progress and prominent brush values at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  const c = fixture(); c.numerics.maxSteps = 20; await loadSettings(page, c);
  const brush = page.locator('#brushSize');
  await expect(brush).toHaveCSS('font-size', '15px');
  await expect(brush).toHaveCSS('background-color', 'rgb(237, 248, 243)');
  await page.screenshot({ path: `test-results/brush-values-${width}.png` });
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('.project-bar #runStateBadge')).toContainText('計算完了');
  await expect(page.locator('.project-bar #runProgressPercent')).toHaveText('100% 終了');
  await expect(page.locator('.project-bar #compactRunMetrics')).toBeVisible();
  await expect(page.locator('#runStateBadge svg')).toBeVisible();
  const bounds = await page.locator('#projectRunSummary').boundingBox(); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `test-results/project-progress-${width}.png` });
});
