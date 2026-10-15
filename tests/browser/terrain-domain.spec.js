import { test,expect,loadSettings,readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

async function selectCells(page,grid,{i0,i1,j0,j1}) {
  await page.locator('#cropTerrain').click();
  const overlay=page.locator('#terrainCropOverlay');await expect(overlay).toBeVisible();
  const r=await overlay.boundingBox(), aspect=grid.nx*grid.dx/(grid.ny*grid.dy),width=Math.min(r.width-104,(r.height-104)*aspect),height=width/aspect;
  const x=(i)=>(r.width-width)/2+(i+.5)/grid.nx*width+r.x;
  const y=(j)=>(r.height-height)/2+(grid.ny-j-.5)/grid.ny*height+r.y;
  await page.mouse.move(x(i0),y(j1));await page.mouse.down();await page.mouse.move(x(i1),y(j0),{steps:12});await page.mouse.up();
  return overlay;
}

for(const geographic of [true,false]) test('rectangle crop preserves exact cells and undo: '+(geographic?'geographic':'idealized'),async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/');const config=fixture();
  Object.assign(config.grid,{nx:32,ny:24,preset:'open',minDepth:100,maxDepth:1000,edits:Object.fromEntries(Array.from({length:768},(_,p)=>[p,p+100]))});
  if(geographic)Object.assign(config.grid,{geoBounds:{west:139,east:142,south:40,north:42},geoSource:'test'});
  await loadSettings(page,config);const before=await readSettings(page);
  await expect(page.locator('#terrainDomain')).toHaveCount(0);
  const overlay=await selectCells(page,config.grid,{i0:8,i1:23,j0:6,j1:17});
  await expect(overlay).toHaveAttribute('data-selection',JSON.stringify({i0:8,i1:23,j0:6,j1:17}));
  expect((await readSettings(page)).grid).toEqual(before.grid);
  await page.screenshot({path:'tmp/terrain-crop-selection-'+geographic+'.png'});
  await page.locator('#applyTerrainCrop').click();
  await page.locator('#runConfirmDialog').getByRole('button',{name:'計算範囲を適用',exact:true}).click();
  await expect(page.locator('#terrainCropOverlay')).toBeHidden();
  const after=await readSettings(page);expect(after.grid.nx).toBe(16);expect(after.grid.ny).toBe(12);expect(after.grid.dx).toBe(before.grid.dx);expect(after.grid.dy).toBe(before.grid.dy);
  expect(after.grid.terrainResampling.reference.nx).toBe(32);expect(Object.keys(after.grid.terrainResampling.reference.edits)).toHaveLength(32*24);
  if(!geographic){expect(after.grid.edits[0]).toBe(before.grid.edits[6*32+8]);expect(after.grid.edits[191]).toBe(before.grid.edits[17*32+23]);}
  else {expect(after.grid.coastline.rebuiltAfterGridChange).toBe(true);expect(after.grid.coastline.landPolygons.appliedCells).toBeGreaterThan(0);}
  if(geographic)expect(after.grid.geoBounds.west).toBeCloseTo(139+8/31*3,8);else expect(after.grid.geoBounds).toBeNull();
  await page.locator('#undoTerrain').click();expect((await readSettings(page)).grid).toEqual(before.grid);
  await page.locator('#redoTerrain').click();expect((await readSettings(page)).grid).toEqual(after.grid);
  for(const [axis,value]of [['nx',24],['ny',20],['nx',8],['ny',8],['nx',16],['ny',12]]){
    await page.locator('[data-path="grid.'+axis+'"]').fill(String(value));await page.locator('[data-path="grid.'+axis+'"]').press('Tab');
    await expect(page.locator('#interpolationStatus')).toBeHidden({timeout:60000});
  }
  const resized=await readSettings(page);expect(resized.grid.edits).toEqual(after.grid.edits);expect(resized.grid.geoBounds).toEqual(after.grid.geoBounds);
});

test('refined crop rebuilds N03 land and depth and rolls back a failed reconstruction',async({page})=>{
  await page.goto('/');const config=fixture();
  Object.assign(config.grid,{nx:16,ny:16,preset:'uniform',minDepth:50,maxDepth:50,geoSource:'test supplied depth',geoBounds:{west:140.72,east:140.76,south:40.825,north:40.85},
    edits:Object.fromEntries(Array.from({length:256},(_,p)=>[p,50])),domainCrop:{sourceNx:32,sourceNy:32}});
  await loadSettings(page,config);const before=await readSettings(page);
  await page.route('**/src/terrain-build-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,400));await route.continue();});
  await page.locator('[data-path="grid.nx"]').fill('32');await page.locator('[data-path="grid.nx"]').press('Tab');
  await expect(page.locator('#interpolationStatus')).toBeVisible();await expect(page.locator('#interpolationStatus')).toBeHidden({timeout:60000});
  const rebuilt=await readSettings(page);expect(rebuilt.grid.nx).toBe(32);expect(rebuilt.grid.coastline.rebuiltAfterGridChange).toBe(true);
  expect(rebuilt.grid.coastline.landCells).toBeGreaterThan(0);expect(rebuilt.grid.coastline.etopoUsed).toBe(false);
  expect(rebuilt.grid.terrainResampling.reference.nx).toBe(16);expect(Object.values(rebuilt.grid.edits).every(Number.isFinite)).toBe(true);
  await page.locator('#undoTerrain').click();expect((await readSettings(page)).grid).toEqual(before.grid);
  await page.locator('#redoTerrain').click();expect((await readSettings(page)).grid).toEqual(rebuilt.grid);
  let failures=0;
  await page.unroute('**/src/terrain-build-worker.js');
  await page.route('**/src/terrain-build-worker.js',route=>{failures++;return route.fulfill({status:200,contentType:'application/javascript',body:"self.onmessage=()=>self.postMessage({error:'再補完テストエラー'});"});});
  await page.locator('[data-path="grid.ny"]').fill('32');await page.locator('[data-path="grid.ny"]').press('Tab');
  await expect(page.locator('#interpolationStatus')).toBeHidden({timeout:60000});
  expect(failures).toBeGreaterThan(0);
  await expect(page.locator('#toast')).toContainText('再補完テストエラー');
  expect((await readSettings(page)).grid).toEqual(rebuilt.grid);
});

test('small selections and cancellation never modify the domain',async({page})=>{
  await page.goto('/');const config=fixture();Object.assign(config.grid,{nx:32,ny:24});await loadSettings(page,config);const before=await readSettings(page);
  await selectCells(page,config.grid,{i0:1,i1:3,j0:2,j1:4});await expect(page.locator('#applyTerrainCrop')).toBeDisabled();
  await page.locator('#cancelTerrainCrop').click();expect((await readSettings(page)).grid).toEqual(before.grid);
  await selectCells(page,config.grid,{i0:8,i1:23,j0:6,j1:17});await page.locator('#applyTerrainCrop').click();
  await page.locator('#runConfirmDialog').getByRole('button',{name:'キャンセル'}).click();
  expect((await readSettings(page)).grid).toEqual(before.grid);await page.locator('#cancelTerrainCrop').click();
});

test('crop entry and cancellation show busy feedback',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());
  const before=await readSettings(page);
  await page.evaluate(()=>{
    window.cropBusyMessages=[];
    new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)
        if(node.id==='interpolationStatus')window.cropBusyMessages.push(node.textContent);
    }).observe(document.body,{childList:true});
  });
  await page.locator('#cropTerrain').click();
  await expect(page.locator('#interpolationStatus')).toBeHidden();
  await expect(page.locator('#terrainCropOverlay')).toBeVisible();
  await page.locator('#cancelTerrainCrop').click();
  await expect(page.locator('#interpolationStatus')).toBeHidden();
  await expect(page.locator('#terrainCropOverlay')).toBeHidden();
  const messages=await page.evaluate(()=>window.cropBusyMessages);
  expect(messages.some(text=>text.includes('処理中です')&&text.includes('切り出し画面を準備'))).toBe(true);
  expect(messages.some(text=>text.includes('処理中です')&&text.includes('キャンセルしています'))).toBe(true);
  expect((await readSettings(page)).grid).toEqual(before.grid);
});
