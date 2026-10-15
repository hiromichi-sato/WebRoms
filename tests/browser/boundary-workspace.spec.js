import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

for (const width of [1280, 390]) test(`boundary forcing order, themed tools and terrain-aware section at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 }); await page.goto('/');
  const config = fixture(); config.grid.geoBounds = { west: 135.1, east: 135.4, south: 34.3, north: 34.6 };
  config.grid.edits = { 8: 10, 16: 20 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'auto', seaLevelEnabled: true, predictionDays: 45, startUtc: '2026-01-01T00:00:00Z' };
  await loadSettings(page, config); await page.locator('[data-step="3"]').click();
  await page.locator('#applyJapanTides').click();
  await expect(page.locator('#boundaryForcingTools #tideScaleNumber')).toBeVisible();
  await expect(page.locator('#boundaryForcingTools #seaLevelValue')).toBeVisible();
  const tide = await page.locator('#boundaryTidePanel').boundingBox(), sea = await page.locator('#seaLevelEditor').boundingBox(), section = await page.locator('.secondary-scene').boundingBox();
  expect(sea.y).toBeGreaterThanOrEqual(tide.y + tide.height - 1); expect(section.y).toBeGreaterThanOrEqual(sea.y + sea.height - 1);
  await expect(page.locator('#sectionCanvas')).toHaveAttribute('data-terrain-aware', 'true');
  const before = await readSettings(page);
  const heights = await page.evaluate(() => { const canvas = document.querySelector('#sectionCanvas'); return canvas.height; });
  expect(heights).toBeGreaterThan(100);
  await page.locator('#boundaryTerrainToggle').uncheck();
  await expect(page.locator('#sectionCanvas')).toHaveAttribute('data-terrain-aware', 'false');
  expect((await readSettings(page)).boundary).toEqual(before.boundary);
  await page.locator('#boundaryTerrainToggle').check();
  const first = Number(await page.locator('#boundaryTidePlot svg').getAttribute('data-amplitude-max'));
  await page.locator('#tideScaleNumber').fill('2'); await page.locator('#tideScaleNumber').press('Tab');
  expect(Number(await page.locator('#boundaryTidePlot svg').getAttribute('data-amplitude-max'))).toBeGreaterThan(first * 1.9);
  await page.locator('#boundaryForcingTools').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/boundary-workspace-${width}.png`, fullPage: true });
});

test('climate disclosures are only visible through the initial-condition info button', async ({ page }) => {
  await page.goto('/'); const config = fixture(); config.initial.distribution = 'climatology';
  config.climatology = { regionLabel: '日本太平洋側（南部・湾の周辺海域）' };
  await loadSettings(page, config); await page.locator('[data-step="2"]').click();
  await expect(page.locator('#climateSource')).toBeHidden();
  await expect(page.locator('#regionalClimateSource')).toBeHidden();
  await page.locator('#initialClimateInfo').click();
  await expect(page.locator('#climateInfoDialog')).toContainText('1500 m以深');
  await expect(page.locator('#climateInfoDialog')).toContainText('湾内の観測値ではありません');
  await expect(page.locator('#climateInfoDialog a')).toHaveAttribute('href', 'https://www.ncei.noaa.gov/access/world-ocean-atlas-2023/');
});
