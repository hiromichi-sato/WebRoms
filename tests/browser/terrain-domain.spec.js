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
  expect(after.grid.edits[0]).toBe(before.grid.edits[6*32+8]);expect(after.grid.edits[191]).toBe(before.grid.edits[17*32+23]);
  if(geographic)expect(after.grid.geoBounds.west).toBeCloseTo(139+8/31*3,8);else expect(after.grid.geoBounds).toBeNull();
  await page.locator('#undoTerrain').click();expect((await readSettings(page)).grid).toEqual(before.grid);
  await page.locator('#redoTerrain').click();expect((await readSettings(page)).grid).toEqual(after.grid);
  for(const [axis,value]of [['nx',24],['ny',20],['nx',8],['ny',8],['nx',16],['ny',12]]){
    await page.locator('[data-path="grid.'+axis+'"]').fill(String(value));await page.locator('[data-path="grid.'+axis+'"]').press('Tab');
  }
  const resized=await readSettings(page);expect(resized.grid.edits).toEqual(after.grid.edits);expect(resized.grid.geoBounds).toEqual(after.grid.geoBounds);
});

test('small selections and cancellation never modify the domain',async({page})=>{
  await page.goto('/');const config=fixture();Object.assign(config.grid,{nx:32,ny:24});await loadSettings(page,config);const before=await readSettings(page);
  await selectCells(page,config.grid,{i0:1,i1:3,j0:2,j1:4});await expect(page.locator('#applyTerrainCrop')).toBeDisabled();
  await page.locator('#cancelTerrainCrop').click();expect((await readSettings(page)).grid).toEqual(before.grid);
  await selectCells(page,config.grid,{i0:8,i1:23,j0:6,j1:17});await page.locator('#applyTerrainCrop').click();
  await page.locator('#runConfirmDialog').getByRole('button',{name:'キャンセル'}).click();
  expect((await readSettings(page)).grid).toEqual(before.grid);await page.locator('#cancelTerrainCrop').click();
});
