import test from 'node:test';
import assert from 'node:assert/strict';
import { coastlineTerrain } from '../src/coastline-terrain.js';
import { defaults, buildFields } from '../src/model.js';
import { TERRAIN_DATA } from '../src/data/terrain-etopo2022.js';
import { sampleEtopo } from '../src/terrain-presets.js';
const ring = (w, e, s, n) => [[w,s],[e,s],[e,n],[w,n],[w,s]];
const collection = rings => ({ features: [{ geometry: { type: 'Polygon', coordinates: rings } }] });
test('ETOPO land mask needs no polygons and rejects unsupported areas', () => {
  const c = setup();
  const g = coastlineTerrain(c.grid, buildFields(c), null, { maskSource: 'etopo' });
  assert.equal(g.coastline.maskSource, 'etopo'); assert.ok(g.coastline.maskTiles.length);
  c.grid.geoBounds = { west: 10, east: 11, south: 80, north: 81 };
  assert.throws(() => coastlineTerrain(c.grid, buildFields(c), null, { maskSource: 'etopo' }), /範囲外/);
});
function setup() {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 10, maxDepth: 10, geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  return config;
}
test('land polygons take precedence, holes stay water and depth is preserved', () => {
  const c = setup(), coast = collection([ring(134, 135.6, 33, 36), ring(135.15, 135.45, 34.15, 34.45)]);
  const result = coastlineTerrain(c.grid, buildFields(c), coast, { etopo: false });
  assert.equal(result.edits[0], 0); assert.equal(result.edits[7], 10);
  assert.equal(result.edits[2 + 2 * 8], 10);
  assert.equal(result.coastline.fallbackCells, 0);
  assert.equal(JSON.parse(JSON.stringify(result)).edits[18], 10);
});
test('restores depth inferred as land and never fills a lake as land', () => {
  const c = setup(); c.grid.edits = { 18: 0 }; c.grid.contourInterpolation = { interpolatedDepths: { 18: 25 }, inferredLandCells: 1 };
  const g = coastlineTerrain(c.grid, buildFields(c), collection([ring(134, 137, 33, 36), ring(135.15, 135.45, 34.15, 34.45)]), { etopo: false });
  assert.equal(g.edits[18], 25); assert.equal(g.coastline.restoredCells, 1); assert.equal(g.contourInterpolation.inferredLandCells, 0);
});
test('ETOPO supplies missing depth only, never overrides a detailed wet cell', () => {
  const c = setup(), tile = TERRAIN_DATA.osaka; c.grid.geoBounds = tile.bounds; c.grid.edits = {};
  for (let p = 0; p < 64; p++) c.grid.edits[p] = 0;
  c.grid.edits[63] = 77;
  const b = tile.bounds, land = collection([ring(b.west - .1, b.west + (b.east - b.west) / 10, b.south - .1, b.north + .1)]);
  const g = coastlineTerrain(c.grid, buildFields(c), land);
  assert.ok(g.coastline.etopoCells > 0); assert.equal(g.edits[63], 77);
  for (let p = 0; p < 64; p++) if (g.coastline.provenance[p] === 'etopo') {
    const t = TERRAIN_DATA[g.coastline.etopoSources[p]], b = t.bounds;
    const lon = tile.bounds.west + p % 8 / 7 * (tile.bounds.east - tile.bounds.west), lat = tile.bounds.south + Math.floor(p / 8) / 7 * (tile.bounds.north - tile.bounds.south);
    assert.ok(Math.abs(g.edits[p] - Math.max(1, sampleEtopo(t, (lon - b.west) / (b.east - b.west), (lat - b.south) / (b.north - b.south)))) < 1e-7);
  }
});
test('missing isolated basin gets explicit assumed depth, open coastline is rejected', () => {
  const c = setup(), fields = { h: new Float64Array(64), mask: new Uint8Array(64) };
  const g = coastlineTerrain(c.grid, fields, collection([ring(134, 135.3, 33, 36)]), { etopo: false });
  assert.ok(g.coastline.fallbackCells > 0); assert.equal(g.edits[7], 10);
  assert.throws(() => coastlineTerrain(c.grid, buildFields(c), { features: [{ geometry: { type: 'LineString', coordinates: ring(135,136,34,35) } }] }), /陸域ポリゴン/);
  assert.throws(() => coastlineTerrain(c.grid, buildFields(c), collection([ring(10,11,10,11)])), /重なりません/);
});
