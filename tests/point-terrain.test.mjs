import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { pointTerrain, setPointLandMask } from '../src/contour-terrain.js';
import { shapeFiles, importTerrain, exportTerrain } from '../src/shape-io.js';
import { defaults, buildFields } from '../src/model.js';
import { zipSync } from '../vendor/fflate.js';

const grid = { ...defaults().grid, nx: 8, ny: 8 };
const point = (x, y, depth) => ({ depth, geometry: { type: 'Point', coordinates: [135 + x, 34 + y] } });
test('depth points are averaged and unsupported outer gaps become reversible inferred land', () => {
  const g = pointTerrain([point(0, 0, 10), point(0, 0, 30), point(1, 1, 100)], grid);
  assert.equal(g.edits[0], 20); assert.equal(g.edits[63], 100);
  assert.ok(Object.values(g.edits).every(v => Number.isFinite(v) && (v === 0 || v >= 20 && v <= 100)));
  assert.ok(g.contourInterpolation.inferredLandCells > 0);
  setPointLandMask(g, false);
  assert.ok(Object.values(g.edits).every(v => v >= 20 && v <= 100));
  setPointLandMask(g, true);
  assert.equal(g.edits[0], 20);
  assert.equal(g.contourInterpolation.sourceCount, 3);
  assert.equal(g.contourInterpolation.filledCells, 62);
  assert.ok(g.contourInterpolation.converged);
});
test('multipoints and shallow point data remain water', () => {
  const g = pointTerrain([{ depth: 0, geometry: { type: 'MultiPoint', coordinates: [[135, 34], [136, 35]] } }], grid);
  assert.equal(g.edits[0], 1); assert.equal(g.edits[63], 1);
  assert.ok(Object.values(g.edits).every(v => v === 0 || v === 1));
  assert.equal(g.contourInterpolation.sourceCount, 2);
  assert.throws(() => pointTerrain([point(0, 0, NaN)], grid), /水深/);
});
test('point Shapefile imports and survives terrain ZIP reimport', async () => {
  const coordinates = [[135, 34], [136, 34], [135, 35], [136, 35]];
  const files = shapeFiles('points', coordinates.map((_, i) => ({ depth_m: 10 + 10 * i, src_flag: i % 2 })), coordinates, true, 'POINT');
  const result = await importTerrain(new File([zipSync(files)], 'points.zip'), grid);
  assert.equal(result.contourInterpolation.sourceGeometry, 'points');
  assert.ok(Object.values(result.edits).every(v => v === 0 || v >= 10 && v <= 40));
  const config = defaults(); config.grid = result;
  assert.equal(buildFields(config).mask[0], 1);
  const saved = await exportTerrain(config, buildFields(config));
  const restored = await importTerrain(new File([saved], 'terrain.zip'), result);
  assert.deepEqual(restored.edits, result.edits);
  assert.equal(restored.contourInterpolation.sourceCount, 4);
});
