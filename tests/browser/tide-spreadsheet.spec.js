import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { TIDE_SPEEDS } from '../../src/japan-tides.js';
import { astronomicalBasis } from '../../src/tide-astronomy.js';
test('observations correct harmonics inside advanced tides and keep JMA manual controls', async ({ page }) => {
  await page.goto('/');
  const config = fixture(); config.grid.geoBounds = { west: 135.1, east: 135.4, south: 34.3, north: 34.6 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  await loadSettings(page, config); await page.locator('[data-step="3"]').click();
  await page.locator('#tideEnabled').uncheck(); await page.locator('#tideEnabled').check();
  await expect(page.locator('#tideObservedImport')).not.toBeVisible();
  await page.locator('#advancedTideSettings > summary').click();
  await expect(page.locator('#applyHarmonics')).toBeVisible();
  const before = await readSettings(page);
  const rows = ['time_utc,observed_cm', ...Array.from({ length: 721 }, (_, h) => {
    const utc = Date.parse(config.ocean.startUtc) + h * 3600000;
    return `${new Date(utc).toISOString()},${500 + .1 * h + Object.entries(TIDE_SPEEDS).reduce((sum, [name, speed], j) => {
      const basis = astronomicalBasis(name, utc, 0, speed);
      return sum + (j + 1) * 10 * basis.factor * Math.cos((basis.phaseDegrees - j * 30) * Math.PI / 180);
    }, 0)}`;
  })];
  await page.locator('#tideObservedImport').setInputFiles({ name: 'observed.csv', mimeType: 'text/csv', buffer: Buffer.from(rows.join('\n')) });
  await expect(page.locator('#tideFitPreview')).toContainText('残差RMSE');
  expect((await readSettings(page)).ocean.tides.points).toEqual(before.ocean.tides.points);
  await page.locator('#applyObservedHarmonics').click();
  const after = await readSettings(page);
  expect(after.ocean.tides.harmonicFits.at(-1).harmonics.M2.amplitudeCm).toBeCloseTo(10, 6);
  const west = after.ocean.tides.points.filter(p => p.cell % config.grid.nx === 0);
  for (const h of [0, 12, 120]) {
    const expected = Object.entries(TIDE_SPEEDS).reduce((sum, [name, speed], j) => {
      const basis = astronomicalBasis(name, Date.parse(config.ocean.startUtc) + h * 3600000, 0, speed);
      return sum + (j + 1) * 10 * basis.factor * Math.cos((basis.phaseDegrees - j * 30) * Math.PI / 180);
    }, 0);
    expect(west.reduce((sum, p) => sum + p.height[h * 2] * 100, 0) / west.length).toBeCloseTo(expected, 6);
  }
  expect(after.ocean.mdt).toEqual(before.ocean.mdt);
  await expect(page.locator('#advancedTideSettings')).toContainText('気象庁形式');
});
