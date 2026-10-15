import { test,expect,loadSettings,readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { mkdir } from 'node:fs/promises';

test('local spatial NOAA climate has a simple menu, offline gradients, and source info',async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');const config=fixture();Object.assign(config.grid,{preset:'uniform',geoBounds:{west:140,east:142,south:40,north:42},minDepth:100,maxDepth:100});
  await loadSettings(page,config);await page.locator('[data-step="2"]').click();
  await expect(page.locator('#initialDistribution option[value="climatology"]')).toHaveCount(0);
  await page.locator('#initialDistribution').selectOption('regional-summer');
  await expect(page.locator('#interpolationStatus')).toBeHidden({timeout:60000});
  await expect(page.locator('#climatePreset')).toHaveCount(0);await expect(page.locator('#applyClimate')).toHaveCount(0);
  const saved=await readSettings(page);expect(saved.climatology.globalProfile.physicalPeriod).toBe('2015-2022');
  const layer=saved.initial.painted.temp.at(-1);expect(layer[0]).not.toBe(layer[config.grid.nx-1]);
  await page.locator('#initialClimateInfo').click();await expect(page.locator('#climateInfoDialog')).toContainText('0.25°');
  await expect(page.locator('#climateInfoDialog')).toContainText('1965-2022');
  await page.getByRole('button',{name:'閉じる',exact:true}).click();
  await page.locator('#fieldSelect').selectOption('temp');
  await mkdir('tmp',{recursive:true});await page.locator('#scenePair').screenshot({path:'tmp/noaa-spatial-initial.png'});
});

for(const width of [1280,390])test('N03 coastline overlays terrain only at '+width,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/');const config=fixture();
  Object.assign(config.grid,{preset:'uniform',geoBounds:{west:139.5,east:142,south:40.5,north:42},minDepth:100,maxDepth:100});
  await loadSettings(page,config);
  await expect.poll(async()=>Number(await page.locator('#threeView').getAttribute('data-coastline-segments')),{timeout:30000}).toBeGreaterThan(10);
  await page.locator('[data-view="map"]').click();await expect.poll(async()=>Number(await page.locator('#mapCanvas').getAttribute('data-coastline-segments'))).toBeGreaterThan(10);
  const pixels=await page.locator('#mapCanvas').evaluate(canvas=>{
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;
    for(let i=0;i<data.length;i+=4)if(data[i]===27&&data[i+1]===41&&data[i+2]===54)count++;
    return count;
  });expect(pixels).toBeGreaterThan(10);
  await mkdir('tmp',{recursive:true});await page.locator('#scenePair').screenshot({path:`tmp/n03-coast-${width}.png`});
  await page.locator('[data-step="2"]').click();await expect(page.locator('#mapCanvas')).toHaveAttribute('data-coastline-segments','0');
});
