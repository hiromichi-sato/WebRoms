import test from 'node:test';
import assert from 'node:assert/strict';
import { reconstructCoastline } from '../src/coastline-reconstruction.js';
import { coastlineTerrain } from '../src/coastline-terrain.js';
import { resizeTerrainGrid } from '../src/terrain-domain.js';

function fixture() {
  const nx = 16, ny = 16, observedDepths = {};
  for (let j = 0; j < ny; j++) for (let i = 5; i <= 8; i++) observedDepths[j * nx + i] = (i - 3.5) * 5;
  const grid = { nx, ny, dx: 100, dy: 100, minDepth: 1, maxDepth: 100,
    geoBounds: { west: 10, east: 10.02, south: 0, north: .02 },
    contourInterpolation: { observedDepths, interpolatedDepths: {} } };
  const fields = { h: new Float64Array(nx * ny).fill(20), mask: new Uint8Array(nx * ny).fill(1) };
  const land = Uint8Array.from({ length: nx * ny }, (_, p) => p % nx < 6 ? 1 : 0);
  return { grid, fields, land };
}

test('depth planes recover the zero contour without altering measured depths', () => {
  const { grid, fields, land } = fixture();
  const result = reconstructCoastline(grid, fields, land);
  assert.ok(result.predictions[8 * 16 + 3] < 0);
  assert.ok(result.predictions[8 * 16 + 4] > 0);
  assert.equal(result.predictions[8 * 16 + 5], undefined);
  assert.equal(result.observed[8 * 16 + 5], 7.5);
  assert.equal(result.predictions[8 * 16 + 14], undefined);
  assert.ok(Object.values(result.predictions).every(Number.isFinite));
});

test('no unsupported island, flat-slope land, or extrapolation from collinear samples', () => {
  const { grid, fields, land } = fixture();
  assert.deepEqual(reconstructCoastline(grid, fields, new Uint8Array(256)).predictions, {});
  grid.contourInterpolation.observedDepths = Object.fromEntries(Object.keys(grid.contourInterpolation.observedDepths).map(p => [p, 10]));
  assert.deepEqual(reconstructCoastline(grid, fields, land).predictions, {});
  grid.contourInterpolation.observedDepths = { 85: 5, 86: 10, 87: 15 };
  assert.deepEqual(reconstructCoastline(grid, fields, land).predictions, {});
});

test('ETOPO cannot erase source depths; inferred cells and metadata survive JSON/grid changes', () => {
  const { grid, fields } = fixture();
  const elevation = Array.from({ length: 256 }, (_, p) => p % 16 < 6 ? 10 : -30);
  const options = { maskSource: 'etopo', regionalTiles: { test: { bounds: grid.geoBounds, width: 16, height: 16, elevation } } };
  const result = coastlineTerrain(grid, fields, null, options);
  assert.equal(result.edits[8 * 16 + 5], 7.5);
  assert.equal(result.edits[8 * 16 + 3], 0);
  assert.ok(result.edits[8 * 16 + 4] > 0);
  assert.ok(result.coastline.reconstruction.inferredLandCells > 0);
  assert.equal(result.coastline.provenance[8 * 16 + 4], 'coastal-extrapolation');
  const parsed = JSON.parse(JSON.stringify(result));
  const coarse = resizeTerrainGrid(parsed, 8, 8), restored = resizeTerrainGrid(coarse, 16, 16);
  assert.deepEqual(restored.edits, result.edits);
  assert.deepEqual(restored.coastline.reconstruction.observedDepths, result.coastline.reconstruction.observedDepths);
  const preservedMask = new Int8Array(256).fill(-1); preservedMask[8 * 16 + 5] = 0;
  const preserved = coastlineTerrain(grid, fields, null, { ...options, preservedMask });
  assert.equal(preserved.edits[8 * 16 + 5], 0);
});
