import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { terrainGridFixture } from './terrain-grid-fixture.js';

for (const [name,bounds] of [
  ['western hemisphere',{west:-123,east:-122,south:37,north:38}],
  ['southern hemisphere',{west:151,east:152,south:-34,north:-33}],
  ['Greenwich',{west:-.2,east:.2,south:50.8,north:51.2}]
]) test(`regional ETOPO automatically supports ${name}`, async ({ page }) => {
  test.setTimeout(60000); await page.goto('/');
  const config=fixture(); Object.assign(config.grid,{nx:16,ny:16,preset:'uniform',geoBounds:bounds,minDepth:100,maxDepth:100});
  await loadSettings(page,config);
  const live=process.env.LIVE_ETOPO==='1';
  if (!live) await page.route('**/__webroms_etopo?*',async route=>{
    const q=new URL(route.request().url()).searchParams, [y0,y1,x0,x1,s]=['y0','y1','x0','x1','stride'].map(k=>Number(q.get(k))), rows=[];
    for(let y=y0;y<=y1;y+=s) for(let x=x0;x<=x1;x+=s) {
      const lon=(x+.5)/240, canonical=lon>180?lon-360:lon;
      rows.push([-90+(y+.5)/240,lon,canonical>(bounds.west+bounds.east)/2?30:-100]);
    }
    await new Promise(resolve=>setTimeout(resolve,200));
    await route.fulfill({contentType:'application/json',body:JSON.stringify({table:{columnNames:['latitude','longitude','z'],rows}})});
  });
  await page.locator('#terrainSourceMode').selectOption('external'); await page.locator('#openTerrainImport').click();
  await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:await terrainGridFixture(bounds)});
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:60000});
  const result=await readSettings(page), coast=result.grid.coastline;
  expect(coast.maskTiles.some(id=>id.startsWith('downloaded-'))).toBe(true);
  expect(coast.acquisitionWarning).toBeNull();
  expect(coast.landCells).toBeGreaterThan(0); expect(coast.landCells).toBeLessThan(256);
  expect(coast.maskResolution.every(r=>r.sourceUrl.startsWith('https://oceanwatch.pifsc.noaa.gov/'))).toBe(true);
  await loadSettings(page,result); expect((await readSettings(page)).grid.edits).toEqual(result.grid.edits);
});

test('uncovered region fails visibly without inventing land or replacing the terrain',async({page})=>{
  await page.goto('/'); const config=fixture(); config.grid.geoBounds={west:10,east:10.1,south:80,north:80.1};
  await loadSettings(page,config); const before=await readSettings(page);
  await page.route('**/__webroms_etopo?*',route=>route.fulfill({status:502,body:'offline'}));
  await page.locator('#terrainSourceMode').selectOption('external'); await page.locator('#openTerrainImport').click();
  await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:await terrainGridFixture(config.grid.geoBounds,8)});
  await expect(page.locator('#terrainImportError')).toContainText('ETOPOを取得できず');await page.locator('#closeTerrainImport').click();
  expect((await readSettings(page)).grid.edits).toEqual(before.grid.edits);
});
