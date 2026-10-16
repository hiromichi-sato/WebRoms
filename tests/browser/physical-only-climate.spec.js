import {test,expect,loadSettings,readSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';
test('physical-only climate generates initial and boundary values with biology disabled',async({page})=>{
  await page.goto('/');const config=fixture();config.ecosystem.enabled=false;
  Object.assign(config.grid,{nx:8,ny:8,preset:'uniform',geoBounds:{west:140,east:142,south:40,north:42}});
  await loadSettings(page,config);await page.locator('[data-step="2"]').click();
  await expect(page.locator('[data-initial-panel="biological"]')).toBeDisabled();
  await expect(page.locator('[data-path="ecosystem.distribution"]')).toHaveCount(0);
  await page.locator('#initialDistribution').selectOption('regional-annual');
  await expect(page.locator('#interpolationStatus')).toBeHidden({timeout:60000});
  await expect(page.locator('#initialDistribution')).toHaveValue('regional-annual');
  const saved=await readSettings(page);
  expect(Object.keys(saved.climatology.globalProfile.fields).sort()).toEqual(['salinity','temperature']);
  expect(Object.values(saved.initial.painted.temp[0]).every(Number.isFinite)).toBe(true);
  await page.locator('[data-step="3"]').click();
  const boundary=await readSettings(page);
  for(const side of Object.values(boundary.boundary))expect(side.layers.every(layer=>Number.isFinite(layer.temp)&&Number.isFinite(layer.salt))).toBe(true);
});
