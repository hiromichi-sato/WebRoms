import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { gzipSync } from 'node:zlib';
import { CLIMATOLOGY_DATA } from '../../src/data/climatology-woa23.js';

test('imported terrain outside packaged regions receives NOAA initial conditions',async({page})=>{
  await page.route('https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DATA/**',async route=>{
    const salt=route.request().url().includes('/salinity/');
    const csv=`#WOA23 synthetic browser fixture\n# DEPTHS (M):${CLIMATOLOGY_DATA.depthsM.join(',')}\n-32.5,22.5,${CLIMATOLOGY_DATA.depthsM.map(d=>salt?35:20-Math.min(d,500)/50).join(',')}\n`;
    await route.fulfill({status:200,contentType:'application/gzip',headers:{'Access-Control-Allow-Origin':'*'},body:gzipSync(csv)});
  });
  await page.goto('/'); const config=fixture();
  Object.assign(config.grid,{preset:'open',geoBounds:{west:20,east:25,south:-35,north:-30},geoSource:'South Africa test'});
  await loadSettings(page,config); await page.locator('[data-step="2"]').click();
  await page.locator('#initialDistribution').selectOption('regional-summer');
  await expect(page.locator('#interpolationStatus')).toBeHidden({timeout:30000});
  const saved=await readSettings(page);
  expect(saved.climatology.globalProfile.bounds.west).toBe(20);
  expect(saved.climatology.globalProfile.sources).toHaveLength(20);
  expect(saved.climatology.globalProfile.sources.some(s=>s.url.includes('t12an01'))).toBe(true);
  expect(saved.initial.painted.temp).toHaveLength(config.grid.nz);
  await loadSettings(page,saved); await page.locator('[data-step="2"]').click();
  await expect(page.locator('#initialDistribution')).toHaveValue('regional-summer');
});
