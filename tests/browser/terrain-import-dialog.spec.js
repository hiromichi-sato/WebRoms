import { test,expect,loadSettings,readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { access } from 'node:fs/promises';
import createRoms from '../../runtime/roms.js';
import { writeNetcdf } from '../../src/netcdf.js';
import { terrainGridFixture } from './terrain-grid-fixture.js';

test('terrain explanations use info buttons; incomplete files can be closed without changes',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());
  await expect(page.getByText('学習用の理想化地形です。',{exact:false})).toHaveCount(0);
  await page.getByRole('button',{name:'地形の説明',exact:true}).click();
  await expect(page.locator('.terrain-info-dialog')).toContainText('学習用の理想化地形');
  await page.locator('.terrain-info-dialog').getByRole('button',{name:'閉じる'}).click();
  const before=await readSettings(page);
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  const box=await page.locator('#terrainDropZone').boundingBox();expect(box.width).toBeGreaterThan(500);expect(box.height).toBeGreaterThanOrEqual(240);
  await page.locator('#terrainImport').setInputFiles({name:'contours.shp',mimeType:'application/octet-stream',buffer:Buffer.alloc(100)});
  await expect(page.locator('#terrainFileStatus .missing')).toHaveCount(2);
  await expect(page.locator('#terrainImportProgress')).toBeHidden();
  await page.locator('#closeTerrainImport').click();
  const after=await readSettings(page);expect(after.grid.edits).toEqual(before.grid.edits);
  for(const id of ['coastlineSource','coastlineThreshold','applyCoastline','terrainAutoCoastline','terrainClearFiles'])await expect(page.locator('#'+id)).toHaveCount(0);
});

test('classic ROMS NetCDF imports automatically and preserves supplied mask',async({page})=>{
  const runtime=await createRoms({print(){},printErr(){}}),n=8;
  writeNetcdf(runtime,'grid.nc',{eta_rho:n,xi_rho:n},[
    {name:'lon_rho',dimensions:['eta_rho','xi_rho'],data:Float64Array.from({length:n*n},(_,p)=>139+p%n/7)},
    {name:'lat_rho',dimensions:['eta_rho','xi_rho'],data:Float64Array.from({length:n*n},(_,p)=>40+Math.floor(p/n)/7)},
    {name:'h',dimensions:['eta_rho','xi_rho'],data:new Float64Array(n*n).fill(100)},
    {name:'mask_rho',dimensions:['eta_rho','xi_rho'],data:Float64Array.from({length:n*n},(_,p)=>p===0?0:1)}
  ],{type:'ROMS GRID file'});
  await page.goto('/');await loadSettings(page,fixture());await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:Buffer.from(runtime.FS.readFile('grid.nc'))});
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:30000});
  const saved=await readSettings(page);expect(saved.grid.landMaskProvided).toBe(true);expect(saved.grid.edits[0]).toBe(0);expect(saved.grid.geoBounds.west).toBe(139);
  for(const [axis,value]of [['nx',16],['ny',12],['nx',8],['ny',8]]){
    await page.locator('[data-path="grid.'+axis+'"]').fill(String(value));await page.locator('[data-path="grid.'+axis+'"]').press('Tab');
  }
  const restored=await readSettings(page);expect(restored.grid.geoBounds).toEqual(saved.grid.geoBounds);expect(restored.grid.edits).toEqual(saved.grid.edits);expect(restored.grid.geoSource).toBe(saved.grid.geoSource);
});

test('three Shapefile companions trigger automatic ETOPO and close after success',async({page})=>{
  const directory='C:/work/sample_bath';try{await access(directory);}catch{test.skip(true,'Local sample not available');}
  await page.goto('/');const config=fixture();Object.assign(config.grid,{nx:48,ny:32});await loadSettings(page,config);
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  await page.screenshot({path:'tmp/terrain-import-dialog-desktop.png'});
  await page.locator('#terrainImport').setInputFiles(['shp','dbf','prj'].map(ext=>`${directory}/depth_contours.${ext}`));
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:60000});
  const saved=await readSettings(page);expect(saved.grid.coastline.maskSource).toBe('etopo');expect(saved.grid.coastline.landCells).toBeGreaterThan(100);
  await page.screenshot({path:'tmp/terrain-import-compact-sidebar.png'});
});

test('mobile importer fits without horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await loadSettings(page,fixture());
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  expect(await page.locator('#terrainImportDialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
  await page.screenshot({path:'tmp/terrain-import-dialog-mobile.png'});
  await page.locator('#closeTerrainImport').click();
});

test('closing during construction cancels without applying the unfinished terrain',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());await page.locator('#terrainSourceMode').selectOption('external');const before=await readSettings(page);
  await page.locator('#openTerrainImport').click();
  await page.route('**/src/terrain-build-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,1000));await route.continue().catch(()=>{});});
  await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:await terrainGridFixture({west:139,east:142,south:40,north:42},8)});
  await expect(page.locator('#terrainImportProgress')).toBeVisible();await page.locator('#closeTerrainImport').click();
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0);
  expect((await readSettings(page)).grid).toEqual(before.grid);
});
