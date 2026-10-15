import { test, expect, loadSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { readFile } from 'node:fs/promises';
import { unzipSync } from '../../vendor/fflate.js';
import { NetCDFReader } from '../../vendor/netcdf-reader.js';

test('terrain and 2D download labels describe data, and the 2D ZIP contains NetCDF', async ({ page }) => {
  const config = fixture(); Object.assign(config.numerics, { dt: 1, maxSteps: 10 });
  await page.goto('/'); await loadSettings(page, config);
  await expect(page.locator('#terrainDownload')).toHaveText('地形データZIPを保存');
  await page.locator('[data-step="6"]').click();
  await page.locator('#calculateButton').click();
  await expect(page.locator('#runLog')).toContainText('ROMS: DONE');
  await page.locator('#resultButton').click();
  await page.locator('#exportFormat').selectOption('shape');
  await expect(page.locator('#exportFormat option:checked')).toContainText('2次元データZIP');
  await page.locator('#exportDurationPreset').selectOption('0');
  await page.locator('#exportLayer').selectOption('0');
  const download = page.waitForEvent('download'); await page.locator('#downloadResults').click();
  const files = unzipSync(await readFile(await (await download).path()));
  const name = Object.keys(files).find(name => name.endsWith('/horizontal.nc'));
  expect(name).toBeTruthy();
  const nc = new NetCDFReader(files[name]);
  expect(nc.getDataVariable('selected_layer')[0]).toBe(0);
  expect(nc.dimensions.some(d => d.name === 's_rho')).toBe(false);
  expect(Object.keys(files).some(name => name.endsWith('.shp'))).toBe(true);
});
