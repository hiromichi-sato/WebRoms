import test from 'node:test';
import assert from 'node:assert/strict';
import { shallowContourMask } from '../src/shallow-contour-mask.js';
import { contourTerrain, pointTerrain } from '../src/contour-terrain.js';
import { gridContourMask } from '../src/grid-contour-mask.js';
const bounds = { west: 0, east: 8, south: 0, north: 8 };
const line = (coordinates, depth = 10) => ({ coordinates, depth });
test('only the strict inside of the shallowest contour is land, not its boundary or deeper rings', () => {
  const result = shallowContourMask([line([[2, 2], [6, 2], [6, 6], [2, 6], [2, 2]]), line([[0, 0], [8, 0], [8, 8], [0, 8], [0, 0]], 30)], bounds, 9, 9);
  assert.ok(result.cells.includes(4 * 9 + 4));
  assert.ok(!result.cells.includes(2 * 9 + 4));
  assert.equal(result.cells.length, 9);
});
test('small gaps are bridged and their exact coordinates are recorded', () => {
  const lines = [line([[2, 2], [6, 2], [6, 6]]), line([[6, 6.2], [2, 6], [2, 2.2]])];
  const exact = shallowContourMask(lines, bounds, 9, 9, 0), approximate = shallowContourMask(lines, bounds, 9, 9, .5);
  assert.equal(exact.rings, 0); assert.equal(approximate.rings, 1);
  assert.equal(approximate.connections.length, 2);
  assert.ok(approximate.cells.includes(4 * 9 + 4));
});
test('large gaps are left open', () => {
  const result = shallowContourMask([line([[2, 2], [6, 2], [6, 6], [2, 6]])], bounds, 9, 9, 1);
  assert.equal(result.rings, 0); assert.equal(result.connections.length, 0);
});
test('closed shallow rings are applied to the actual terrain edits', () => {
  const g = contourTerrain([{ depth: 10, geometry: { type: 'LineString', coordinates: [[135.2, 34.2], [135.8, 34.2], [135.8, 34.8], [135.2, 34.8], [135.2, 34.2]] } }, { depth: 100, geometry: { type: 'LineString', coordinates: [[135, 34], [136, 34], [136, 35], [135, 35], [135, 34]] } }], { nx: 9, ny: 9, nz: 3, dx: 1000, dy: 1000 });
  assert.equal(g.edits[40], 0); assert.ok(g.edits[0] > 0);
  assert.equal(g.contourInterpolation.shallowContourDepthMetres, 10);
});
test('an enclosed gap between depth points is not automatically classified as land', () => {
  const features = [];
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) if (i === 0 || i === 8 || j === 0 || j === 8) features.push({ depth: 20, geometry: { type: 'Point', coordinates: [135 + i / 8, 34 + j / 8] } });
  const g = pointTerrain(features, { nx: 9, ny: 9, nz: 3, dx: 1000, dy: 1000 });
  assert.equal(g.edits[40], 20); assert.equal(g.contourInterpolation.inferredLandCells, 0);
});
test('one-cell raster gaps close and the side with deeper contours remains sea', () => {
  const mask = gridContourMask([line([[4, 0], [4, 3]]), line([[4, 5], [4, 8]]), line([[8, 0], [8, 8]], 100)], bounds, 9, 9, 10, []);
  assert.ok(mask.cells.includes(4 * 9 + 2));
  assert.ok(!mask.cells.includes(4 * 9 + 6));
  assert.ok(!mask.cells.includes(4 * 9 + 4));
});
