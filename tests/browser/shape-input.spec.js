import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { access, readFile } from 'node:fs/promises';

test('incomplete contours show missing companions without attempting ZIP decoding',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());await page.locator('#terrainSourceMode').selectOption('external');
  const before=await readSettings(page);await page.locator('#openTerrainImport').click();
  await page.locator('#terrainImport').setInputFiles({name:'depth_contours.shp',mimeType:'application/octet-stream',buffer:Buffer.alloc(100)});
  await expect(page.locator('#terrainFileStatus .missing')).toContainText(['depth_contours.dbf','depth_contours.prj']);
  await expect(page.locator('#terrainImportError')).toBeHidden();await page.locator('#closeTerrainImport').click();
  expect((await readSettings(page)).grid).toEqual(before.grid);
});

test('companions accumulate and failed input can be discarded',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  await expect(page.locator('#terrainImport')).toHaveAttribute('multiple','');
  await page.locator('#terrainFileInfo').click();await expect(page.locator('#terrainFileHelp')).toContainText('3ファイルが必須');
  const bytes=Buffer.alloc(100);bytes.writeInt32BE(9994,0);bytes.writeInt32LE(1000,28);bytes.writeInt32LE(3,32);
  await page.locator('#terrainImport').setInputFiles({name:'contours.shp',mimeType:'application/octet-stream',buffer:bytes});
  await page.locator('#terrainImport').setInputFiles(['dbf','prj'].map(ext=>({name:'contours.'+ext,mimeType:'application/octet-stream',buffer:Buffer.from('test')})));
  await expect(page.locator('#terrainFileStatus .missing')).toHaveCount(0);await expect(page.locator('#terrainImportError')).toBeVisible();
  await page.locator('#closeTerrainImport').click();await page.locator('#openTerrainImport').click();
  await expect(page.locator('#terrainFileStatus .idle')).toHaveCount(3);await expect(page.locator('#terrainImportError')).toBeHidden();
});

for(const [kind,directory,stem,extensions] of [
  ['contours','C:/work/sample_bath','depth_contours',['shp','dbf','prj','cpg']],
  ['points','C:/work/sample_depth2','depth_points',['shp','dbf','prj','shx','cpg']]
]) test('actual '+kind+' imports with automatic ETOPO',async({page})=>{
  try{await access(directory);}catch{test.skip(true,'Local survey fixture unavailable');}
  await page.goto('/');const config=fixture();Object.assign(config.grid,{nx:48,ny:32});await loadSettings(page,config);
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  if(kind==='contours'){
    const files=await Promise.all(extensions.map(async ext=>({name:stem+'.'+ext,bytes:Array.from(await readFile(directory+'/'+stem+'.'+ext))})));
    await page.evaluate(files=>{const transfer=new DataTransfer();for(const file of files)transfer.items.add(new File([new Uint8Array(file.bytes)],file.name));document.querySelector('#terrainDropZone').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));},files);
  }else await page.locator('#terrainImport').setInputFiles(extensions.map(ext=>directory+'/'+stem+'.'+ext));
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:60000});
  const after=await readSettings(page);expect(after.grid.coastline.maskSource).toBe('etopo');expect(after.grid.coastline.landCells).toBeGreaterThan(100);
  expect(after.grid.contourInterpolation.landMaskKnown).toBe(true);expect(Object.values(after.grid.edits).every(Number.isFinite)).toBe(true);
  for(const [axis,value]of [['nx',32],['ny',24],['nx',48],['ny',32]]){
    await page.locator('[data-path="grid.'+axis+'"]').fill(String(value));await page.locator('[data-path="grid.'+axis+'"]').press('Tab');
  }
  const restored=await readSettings(page);expect(restored.grid.edits).toEqual(after.grid.edits);expect(restored.grid.geoBounds).toEqual(after.grid.geoBounds);
});
