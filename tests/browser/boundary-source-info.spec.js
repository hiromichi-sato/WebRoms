import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { mdtSignature } from '../../src/bundled-mdt.js';

for (const width of [1280, 390]) test(`source details are behind info buttons and Japanese tides apply automatically at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  const config = fixture(); config.grid.geoBounds = { west: 135.1, east: 135.4, south: 34.3, north: 34.6 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'off', seaLevelEnabled: false, seaLevel: { bundled: true, datum: 'geoid', source: 'HYBRID_MDT_CNES_CLS22_CMEMS2020', interpolatedCells: 24, nearbyIndices: [], zeroIndices: [], gridSignature: mdtSignature(config) } };
  await loadSettings(page, config); await page.locator('[data-step="3"]').click();
  await expect(page.locator('#noSeaLevelForcingNote')).toBeVisible();
  await expect(page.locator('#settingsForm')).not.toContainText('CNES-CLS22 / CMEMS2020');
  await expect(page.locator('#settingsForm')).not.toContainText('近傍3地点');
  await page.locator('#tideDataInfo').click();
  await expect(page.locator('#boundarySourceDialog')).toContainText('気象庁が公開');
  await expect(page.locator('#boundarySourceDialog')).toContainText('近傍3地点');
  await page.locator('#boundarySourceDialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await page.locator('#mdtDataInfo').click();
  await expect(page.locator('#boundarySourceDialog')).toContainText('基準面：geoid');
  await expect(page.locator('#boundarySourceDialog')).toContainText('欠測補間 24 セル');
  await expect(page.locator('#boundarySourceDialog')).toContainText('周辺50 km以内の値で 0 セル');
  await page.locator('#boundarySourceDialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await page.locator('#tideEnabled').check();
  await expect(page.locator('#oceanStatus')).toContainText('主要4分潮');
  await expect(page.locator('#noSeaLevelForcingNote')).toHaveCount(0);
  const saved = await readSettings(page); expect(saved.ocean.tides.bundledJapan).toBe(true);
  expect(saved.ocean.tides.source).toContain('気象庁公開');
  await page.locator('#tideScaleNumber').fill('1.5'); await page.locator('#tideScaleNumber').press('Tab');
  await page.locator('#tideEnabled').uncheck(); await page.locator('#tideEnabled').check();
  await expect(page.locator('#tideScaleNumber')).toHaveValue('1.5');
  await page.locator('#tideEnabled').uncheck(); await expect(page.locator('#noSeaLevelForcingNote')).toBeVisible();
  await page.locator('#seaLevelEnabled').check(); await expect(page.locator('#noSeaLevelForcingNote')).toHaveCount(0);
  await page.screenshot({ path: `test-results/boundary-source-info-${width}.png`, fullPage: true });
});

test('outside Japan the ON toggle does not automatically extrapolate Japanese observations', async ({ page }) => {
  await page.goto('/'); const config = fixture();
  config.grid.geoBounds = { west: -125, east: -124, south: 35, north: 36 };
  for (const boundary of Object.values(config.boundary)) boundary.mode = 'specified';
  config.ocean = { tideMode: 'off' };
  await loadSettings(page, config); await page.locator('[data-step="3"]').click();
  await page.locator('#tideEnabled').check();
  await expect(page.locator('#oceanStatus')).toContainText('ダミー');
  await expect(page.locator('#showBoundaryTide')).toHaveCount(0);
  await expect(page.locator('#boundaryTidePlot svg')).toBeVisible();
  await expect(page.locator('#boundaryTidePlot svg')).toHaveAttribute('data-end-hours', '720');
  expect((await readSettings(page)).ocean.tides).toBeUndefined();
});
