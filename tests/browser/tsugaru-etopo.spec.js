import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { access, mkdir, writeFile, readFile } from 'node:fs/promises';

for (const [name, directory, stem, extensions] of [
  ['contours', 'C:/work/sample_bath', 'depth_contours', ['shp','dbf','prj','cpg']],
  ['points', 'C:/work/sample_depth2', 'depth_points', ['shp','dbf','prj','shx','cpg']]
]) test(`Tsugaru ${name}: detailed bathymetry plus ETOPO land mask`, async ({ page }) => {
  test.setTimeout(90000);
  try { await access(directory); } catch { test.skip(true, 'Local Tsugaru sample is unavailable'); }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/');
  const config = fixture(); Object.assign(config.grid, { nx: 64, ny: 48 });
  await loadSettings(page, config); await page.locator('#terrainSourceMode').selectOption('external'); await page.locator('#openTerrainImport').click();
  await page.locator('#terrainImport').setInputFiles(extensions.map(ext => `${directory}/${stem}.${ext}`));
  await expect(page.locator('#terrainImportProgress')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('#terrainImportError')).toHaveCount(0);
  const before = await readSettings(page);
  expect(before.grid.coastline.maskSource).toBe('etopo');
  await expect(page.locator('#coastlineSource')).toHaveCount(0);
  const after = await readSettings(page), g = after.grid;
  expect(g.coastline.maskSource).toBe('etopo'); expect(g.coastline.maskTiles).toEqual(['tsugaru-15s']);
  expect(g.coastline.maskResolution[0].longitudeArcSeconds).toBeCloseTo(15, 8);
  expect(g.coastline.landCells).toBeGreaterThan(100); expect(g.coastline.landCells).toBeLessThan(g.nx * g.ny - 100);
  expect(g.coastline.fallbackCells).toBe(0);
  expect(g.coastline.landPolygons.license).toBe('CC-BY-4.0');
  expect(g.coastline.landPolygons.appliedCells).toBeGreaterThan(0);
  expect(g.coastline.landPolygons.tiles.length).toBeLessThan(48);
  const pAt = (lon, lat) => Math.round((lat - g.geoBounds.south) / (g.geoBounds.north - g.geoBounds.south) * (g.ny - 1)) * g.nx + Math.round((lon - g.geoBounds.west) / (g.geoBounds.east - g.geoBounds.west) * (g.nx - 1));
  expect(g.edits[pAt(140.5, 41.5)]).toBeGreaterThan(0);
  for (const [p, kind] of g.coastline.provenance.entries()) if (kind === 'input' && before.grid.edits[p] > 0) expect(g.edits[p]).toBeCloseTo(before.grid.edits[p], 8);
  await mkdir('tmp', { recursive: true });
  await writeFile(`tmp/tsugaru-${name}-project.json`, JSON.stringify(after, null, 2));
  await page.locator('#scenePair').scrollIntoViewIfNeeded();
  await page.locator('#scenePair').screenshot({ path: `tmp/tsugaru-${name}-etopo.png` });
  console.log(JSON.stringify({ sample: name, grid: `${g.nx}x${g.ny}`, land: g.coastline.landCells, water: g.nx * g.ny - g.coastline.landCells, restoredSea: g.coastline.restoredCells, etopoDepth: g.coastline.etopoCells, assumed: g.coastline.fallbackCells, tiles: g.coastline.maskTiles }));
  await loadSettings(page, after);
  expect((await readSettings(page)).grid.edits).toEqual(g.edits);
});

test('48x32 Tsugaru automatic mask preserves measured depths and labels coastal extrapolation',async({page})=>{
  await page.goto('/');const config=fixture();Object.assign(config.grid,{nx:48,ny:32});await loadSettings(page,config);
  await page.locator('#terrainSourceMode').selectOption('external');await page.locator('#openTerrainImport').click();
  await page.locator('#terrainImport').setInputFiles(['shp','dbf','prj','cpg'].map(ext=>'C:/work/sample_bath/depth_contours.'+ext));
  await expect(page.locator('#terrainImportDialog')).toHaveCount(0,{timeout:60000});
  const result=await readSettings(page);expect(result.grid.coastline.maskTiles).toEqual(['tsugaru-15s']);expect(result.grid.coastline.landCells).toBeGreaterThan(0);
  for(const [p,value] of Object.entries(result.grid.contourInterpolation.observedDepths)) {
    if(result.grid.coastline.landPolygons.cellMask[p]===1)expect(result.grid.edits[p]).toBe(0);
    else expect(result.grid.edits[p]).toBeCloseTo(Math.max(1,value),8);
  }
  for(const [p,value] of Object.entries(result.grid.edits)) if(value>0&&result.grid.coastline.provenance[p]==='interpolated')expect(value).toBeCloseTo(result.grid.contourInterpolation.interpolatedDepths[p],8);
  expect(result.grid.coastline.reconstruction.method).toContain('Measured depths fixed');
});
