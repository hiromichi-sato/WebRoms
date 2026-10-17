import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { harmonicHeight } from '../../src/japan-tides.js';

test('calendar tide date changes update chart, forcing and saved JSON together', async ({ page }) => {
  await page.goto('/');
  const config = fixture();
  config.grid.geoBounds = { west: 135.1, east: 135.4, south: 34.3, north: 34.6 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'off', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  await loadSettings(page, config);
  await page.locator('[data-step="3"]').click();
  await page.locator('#tideEnabled').check();
  await expect(page.locator('#boundaryTidePlot svg')).toBeVisible();
  const before = await readSettings(page);
  expect(before.ocean.tides.astronomy).toBe('jma-local-pari-2007-v1');
  const chart = await page.locator('#boundaryTidePlot polyline').getAttribute('points');
  await page.locator('#oceanStart').fill('2026-01-08T00:00');
  await page.locator('#oceanStart').press('Tab');
  const after = await readSettings(page), packet = after.ocean.tides;
  expect(packet.epoch).toBe('2026-01-08T00:00:00Z');
  expect(packet.points[0].height).not.toEqual(before.ocean.tides.points[0].height);
  expect(packet.points[0].height[0]).toBeCloseTo(harmonicHeight(packet, packet.points[0], 0), 12);
  expect(await page.locator('#boundaryTidePlot polyline').getAttribute('points')).not.toBe(chart);
  await page.screenshot({ path: 'test-results/tide-astronomy.png' });
  await loadSettings(page, after);
  expect((await readSettings(page)).ocean.tides).toEqual(packet);
});
