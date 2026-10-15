import test from 'node:test';
import assert from 'node:assert/strict';
import { contourTerrain } from '../src/contour-terrain.js';

const grid = { nx: 9, ny: 9, nz: 4, dx: 1000, dy: 1000 };
const line = (x, depth) => ({ depth, geometry: { type: 'LineString', coordinates: [[135 + x, 34], [135 + x, 35]] } });
test('parallel contours retain depth constraints and interpolate an approximately linear slope', () => {
  const g = contourTerrain([line(0, 10), line(1, 90)], grid);
  for (let j = 0; j < 9; j++) for (let i = 0; i < 9; i++) assert.ok(Math.abs(g.edits[j * 9 + i] - (10 + i * 10)) < .05);
  assert.ok(g.contourInterpolation.converged);
  assert.equal(g.contourInterpolation.landMaskKnown, false);
  assert.equal(g.nz, 4);
});
test('constant contours fill sparse areas without NaN or invented land', () => {
  const g = contourTerrain([line(0, 80), line(1, 80)], grid);
  assert.ok(Object.values(g.edits).every(v => v === 80));
  assert.equal(g.minDepth, 80); assert.equal(g.maxDepth, 80);
});
test('zero-depth bathymetry stays water with a one-metre minimum', () => {
  const g = contourTerrain([line(0, 0), line(1, 100)], grid);
  assert.equal(g.edits[0], 1);
  assert.ok(Object.values(g.edits).every(v => Number.isFinite(v) && v >= 1 && v <= 100));
  assert.ok(g.contourInterpolation.shallowCells > 0);
});
test('degenerate or invalid coordinates fail before generating terrain', () => {
  assert.throws(() => contourTerrain([line(0, 20)], grid), /範囲/);
  assert.throws(() => contourTerrain([{ depth: 10, geometry: { type: 'LineString', coordinates: [[NaN, 34], [136, 35]] } }], grid), /座標/);
});
