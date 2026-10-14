import { test, expect, loadSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

test('bundled Japanese tides apply and list adopted station harmonics', async ({ page }) => {
  await page.goto('/');
  const config = fixture();
  config.grid.geoBounds = { west: 135.1, east: 135.4, south: 34.3, north: 34.6 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  await loadSettings(page, config);
  await page.locator('.steps [data-step="3"]').click();
  await page.locator('#applyJapanTides').click();
  await expect(page.locator('#oceanStatus')).toContainText('主要4分潮');
  await expect(page.locator('#boundaryTidePlot svg')).toBeVisible();
  await expect(page.locator('#boundaryTidePlot polyline')).toHaveCount(1);
  await page.locator('#tideScaleNumber').fill('1.5');
  await page.locator('#tideScaleNumber').press('Tab');
  await expect(page.locator('#tideScaleNumber')).toHaveValue('1.5');
  await page.screenshot({ path: 'test-results/tide-field-preview.png' });
  await page.locator('.steps [data-step="6"]').click();
  await page.locator('#tideInfo').click();
  await page.getByText('使用した潮汐データの一覧', { exact: true }).click();
  const table = page.getByRole('table', { name: '使用した潮汐データ' });
  await expect(table).toContainText('採用地点');
  await expect(table).toContainText('遅角');
  await expect(table).toContainText('節点補正なし');
});

test('remote extrapolation warns, manual amplitude correction clears warning and adds N2', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const config = fixture(); config.grid.geoBounds = { west: -125, east: -124, south: 35, north: 36 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  await loadSettings(page, config); await page.locator('.steps [data-step="3"]').click();
  await page.locator('#applyJapanTides').click();
  await expect(page.locator('#boundaryTidePlot svg')).toBeVisible();
  const check = page.locator('.input-check-toolbar button').nth(3);
  await expect(check).toHaveAttribute('title', /注意・警告/);
  await page.getByText('高度な設定：平均振幅・遅角・セル別・追加分潮', { exact: true }).click();
  await page.locator('#harmonicCell').selectOption('all');
  await page.locator('#harmonicAmpM2').fill('30');
  await page.locator('#extraHarmonics').fill('N2,28.4397295,10,12');
  await page.locator('#applyHarmonics').click();
  await expect(check).toHaveAttribute('title', /注意・警告なし/);
  await page.getByText('使用した潮汐データの一覧', { exact: true }).click();
  await expect(page.getByRole('table', { name: '使用した潮汐データ' })).toContainText('N2：10.000 cm');
  await page.screenshot({ path: 'test-results/tide-editor-mobile.png' });
});
