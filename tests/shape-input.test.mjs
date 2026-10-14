import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readShapeFiles, importTerrain, exportTerrain } from '../src/shape-io.js';
import { unzipSync } from '../vendor/fflate.js';
import { defaults, buildFields } from '../src/model.js';

function header(type) {
  const bytes = new Uint8Array(100), view = new DataView(bytes.buffer);
  view.setInt32(0, 9994); view.setInt32(28, 1000, true); view.setInt32(32, type, true);
  return bytes;
}
test('single contour shp explains missing attributes and unsupported geometry instead of ZIP data', async () => {
  await assert.rejects(readShapeFiles(new File([header(3)], 'depth_contours.shp')), error => /depth_contours.dbf/.test(error.message) && /depth_contours.prj/.test(error.message) && /等深線/.test(error.message) && !/invalid zip data/i.test(error.message));
});
test('invalid renamed ZIP produces a readable error', async () => {
  await assert.rejects(readShapeFiles(new File([header(3)], 'depth_contours.zip')), /拡張子/);
});
test('related files can be selected directly, while contours are not silently treated as land', async () => {
  const files = [new File([header(3)], 'depth_contours.shp'), new File(['test'], 'depth_contours.dbf'), new File(['test'], 'depth_contours.prj')];
  assert.equal(Object.keys(await readShapeFiles(files)).length, 3);
  await assert.rejects(importTerrain(files, defaults().grid), /等深線.*NetCDF/);
});
test('raw geographic polygon set imports and ZIP round trip stays compatible', async () => {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'uniform', geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  const bytes = await exportTerrain(config, buildFields(config));
  const files = unzipSync(bytes), raw = Object.entries(files).filter(([name]) => /^terrain\.(shp|dbf|prj|shx)$/.test(name)).map(([name, data]) => new File([data], name));
  const grid = await importTerrain(raw, config.grid);
  assert.ok(Object.values(grid.edits).some(v => v > 0)); assert.ok(grid.geoBounds);
  const restored = await importTerrain(new File([bytes], 'terrain.zip'), config.grid);
  assert.equal(restored.nx, config.grid.nx);
});
