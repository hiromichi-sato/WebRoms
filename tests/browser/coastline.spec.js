import { test,expect,loadSettings,readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { terrainGridFixture } from './terrain-grid-fixture.js';

for(const width of [1280,390]) test('automatic coastline progress and JSON roundtrip at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/');await loadSettings(page,fixture());
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  await page.route('**/src/terrain-build-worker.js',async route=>{await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});
  await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:await terrainGridFixture({west:139,east:142,south:40,north:42},8)});
  await expect(page.locator('#terrainImportProgress')).toBeVisible();await expect(page.locator('#terrainImportProgress .terrain-build-spinner')).toBeVisible();
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:30000});const saved=await readSettings(page);
  expect(saved.grid.coastline.landCells).toBeGreaterThan(0);
  expect(saved.grid.coastline.landPolygons.license).toBe('CC-BY-4.0');
  expect(Object.values(saved.grid.edits).every(depth=>depth===0||depth===100)).toBe(true);
  await page.locator('#undoTerrain').click();expect((await readSettings(page)).grid.coastline).toBeUndefined();
  await page.locator('#redoTerrain').click();expect((await readSettings(page)).grid.edits).toEqual(saved.grid.edits);
  await loadSettings(page,saved);expect((await readSettings(page)).grid.coastline).toEqual(saved.grid.coastline);
});

test('invalid complete terrain shows an error without changing the current grid',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());await page.locator('#terrainSourceMode').selectOption('external');const before=await readSettings(page);
  await page.locator('#openTerrainImport').click();await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});
  await expect(page.locator('#terrainImportError')).toBeVisible();await expect(page.locator('#terrainImportProgress')).toBeHidden();
  await page.locator('#closeTerrainImport').click();expect((await readSettings(page)).grid).toEqual(before.grid);
});

test('N03 plus complete depths builds without ETOPO acquisition or sampling',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  let etopoRequests=0;
  await page.route('**/__webroms_etopo**',route=>{etopoRequests++;return route.abort();});
  await page.locator('#terrainImport').setInputFiles({name:'grid.nc',mimeType:'application/octet-stream',buffer:await terrainGridFixture({west:140.72,east:140.76,south:40.825,north:40.85},8)});
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:30000});
  const grid=(await readSettings(page)).grid;
  expect(grid.coastline.landPolygons.appliedCells).toBe(grid.nx*grid.ny);
  expect(grid.coastline.etopoUsed).toBe(false);
  expect(grid.coastline.etopoCells).toBe(0);
  expect(grid.coastline.maskTiles).toEqual([]);
  expect(etopoRequests).toBe(0);
});
