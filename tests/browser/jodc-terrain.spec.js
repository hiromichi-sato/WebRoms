import {test,expect,loadSettings,readSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';
test('JDOSS J-EGG500 text imports with automatic land classification',async({page})=>{
  await page.goto('/');const config=fixture();Object.assign(config.grid,{nx:16,ny:16});await loadSettings(page,config);
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  const record=(flag,lat,lon,depth)=>`${flag}${lat.toFixed(5).padStart(10)}${lon.toFixed(5).padStart(10)}${String(depth).padStart(6)}`;
  const text=[record(0,40.825,140.72,50),record(1,40.825,140.76,60),record(0,40.85,140.72,70),record(1,40.85,140.76,80)].join('\n');
  await page.locator('#terrainImport').setInputFiles({name:'jdoss-jegg.dat',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(page.locator('.terrain-import-selection')).toContainText('jdoss-jegg.dat');
  await page.locator('#terrainImport').setInputFiles({name:'jdoss-extra.dat',mimeType:'text/plain',buffer:Buffer.from(text)});
  await expect(page.locator('.terrain-import-selection')).toContainText('jdoss-extra.dat');
  await page.locator('#readJodcTerrain').click();
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:60000});
  const saved=await readSettings(page);
  expect(saved.grid.geoSource).toContain('JODC');expect(saved.grid.jodcSource.product).toBe('J-EGG500');
  expect(saved.grid.jodcSource.sourceInterpolatedPoints).toBe(4);
  expect(saved.grid.jodcSource.selectedFiles).toEqual(['jdoss-jegg.dat','jdoss-extra.dat']);
  await expect(page.locator('#terrainImportedFiles')).toContainText('jdoss-jegg.dat');
  await expect(page.locator('#terrainImportedFiles')).toContainText('jdoss-extra.dat');
  expect(saved.grid.coastline.landPolygons.appliedCells).toBeGreaterThan(0);
  expect(Object.values(saved.grid.edits).every(Number.isFinite)).toBe(true);
});

test('JDOSS import controls stay in place as the filename list grows',async({page})=>{
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});
    await page.goto('/');await loadSettings(page,fixture());
    await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
    const input=page.locator('#terrainImport'),button=page.locator('#readJodcTerrain'),status=page.locator('#terrainFileStatus');
    await input.setInputFiles({name:'depth-01.dat',mimeType:'text/plain',buffer:Buffer.from('0 40.8 140.7 50')});
    const beforeButton=await button.boundingBox(),beforeStatus=await status.boundingBox();
    await input.setInputFiles(Array.from({length:19},(_,i)=>({name:`depth-${i+2}.dat`,mimeType:'text/plain',buffer:Buffer.from('0 40.8 140.7 50')})));
    await expect(page.locator('.terrain-import-selection>div')).toHaveCount(20);
    const afterButton=await button.boundingBox(),afterStatus=await status.boundingBox();
    expect(Math.abs(afterButton.y-beforeButton.y)).toBeLessThan(1);
    expect(Math.abs(afterStatus.y-beforeStatus.y)).toBeLessThan(1);
    expect(afterButton.y+afterButton.height).toBeLessThan(900);
    expect(await page.locator('.terrain-import-selection').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  }
});
