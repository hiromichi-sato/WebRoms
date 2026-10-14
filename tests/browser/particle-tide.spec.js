import { test, expect, loadSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { NetCDFReader } from 'netcdfjs';

test('tidal experiments load the fixed ocean time directly and repeat the forcing cycle', async ({ page }) => {
  await page.goto('/'); const c = fixture('specified'); c.numerics.maxSteps = 10;
  c.grid.geoBounds = { west: 135, east: 136, south: 34, north: 35 };
  c.ocean = { tideMode: 'auto', seaLevelEnabled: false, velocityMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  c.particles = { cell: 27, count: 2, depth: 2, mode: 'depth', hours: .02, interval: 20 };
  await loadSettings(page, c); await page.locator('.steps [data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了'); await page.locator('#nextButton').click();
  const outputs = [];
  for (let i = 0; i < 2; i++) {
    await page.locator('#particleRun').click(); await expect(page.locator('#particleStatus')).toContainText('追跡が完了');
    await page.locator('#particleDownload').click();
    await expect.poll(() => page.evaluate(() => window.__fileWrites.filter(f => f.name === 'webroms-particles.nc').length)).toBe(i + 1);
    const bytes = await page.evaluate(async () => [...new Uint8Array(await window.__fileWrites.filter(f => f.name === 'webroms-particles.nc').at(-1).blob.arrayBuffer())]);
    outputs.push(new NetCDFReader(Uint8Array.from(bytes)));
  }
  expect(outputs[1].getDataVariable('ocean_time')).toEqual(outputs[0].getDataVariable('ocean_time'));
  expect(outputs[1].getDataVariable('grid_x')).toEqual(outputs[0].getDataVariable('grid_x'));
  const plan = JSON.parse(outputs[0].globalAttributes.find(a => a.name === 'experiment_config').value);
  expect(plan.tide.mode).toBe('fixed-period'); expect(plan.tide.start).toBe(100); expect(plan.tide.period).toBeGreaterThan(86400);
  await page.locator('.steps [data-step="6"]').click(); await expect(page.locator('#modelTime')).toHaveText('0.03 h');
});
