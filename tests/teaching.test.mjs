import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields, validate, resizeLayers } from '../src/model.js';
import { TERRAIN_PRESETS, applyTerrainPreset, terrainBlockEdits, sampleTerrain, sampleEtopo, fitTerrainSpacing } from '../src/terrain-presets.js';
import { TERRAIN_DATA, TERRAIN_DATA_SHA256 } from '../src/data/terrain-etopo2022.js';
import { createHash } from 'node:crypto';

test('ETOPO source grids have provenance, complete axes and an intact payload', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(TERRAIN_DATA)).digest('hex'), TERRAIN_DATA_SHA256);
  assert.equal(Object.keys(TERRAIN_DATA).length, 10);
  for (const [id, data] of Object.entries(TERRAIN_DATA)) {
    assert.equal(data.elevation.length, data.width * data.height, id);
    assert.ok(data.elevation.every(Number.isFinite), id);
    assert.ok(data.elevation.some(z => z >= 0) && data.elevation.some(z => z < 0), id);
    assert.ok(data.bounds.south < data.bounds.north && data.bounds.west < data.bounds.east);
    for (const source of data.sources) { assert.equal(new URL(source.url).hostname, 'oceanwatch.pifsc.noaa.gov'); assert.match(source.sha256, /^[a-f0-9]{64}$/); }
    const c = defaults(); applyTerrainPreset(c, id);
    for (const n of [8, 100]) { c.grid.nx = c.grid.ny = n; fitTerrainSpacing(c.grid); assert.deepEqual(validate(c), [], id); }
  }
  assert.equal(TERRAIN_DATA['north-atlantic'].sources.length, 2);
  assert.ok(TERRAIN_DATA['north-pacific'].bounds.east > 180);
});

test('ETOPO retains bay water, Awaji and peninsulas, with metre-based depth clipping', () => {
  for (const [id, lon, lat, wet] of [
    ['osaka', 135.3, 34.55, true], ['osaka', 134.83, 34.4, false],
    ['tokyo', 139.85, 35.4, true], ['tokyo', 140.1, 35.35, false],
    ['ise', 136.75, 34.7, true], ['ise', 136.9, 34.8, false],
    ['japan', 138, 36, false], ['japan', 144, 35, true]
  ]) {
    const d = TERRAIN_DATA[id], b = d.bounds;
    const x = (lon - b.west) / (b.east - b.west), y = (lat - b.south) / (b.north - b.south);
    const raw = sampleEtopo(d, x, y);
    assert.equal(raw > 0, wet, `${id} ${lon}, ${lat}`);
    assert.equal(sampleTerrain(id, x, y, 8, 100), wet ? Math.max(8, Math.min(100, raw)) : 0);
  }
  const d = { width: 2, height: 2, elevation: [-20, 2000, -40, 3000] };
  assert.equal(sampleEtopo(d, 0.25, 0.5), 30);
  assert.equal(sampleEtopo(d, 0.75, 0.5), 0);
});

test('teaching terrains support 15 layers and bounded wet cells', () => {
  const bays = new Set();
  for (const name of Object.keys(TERRAIN_PRESETS)) {
    const c = defaults(); applyTerrainPreset(c, name); resizeLayers(c, 15);
    const f = buildFields(c);
    assert.ok(f.wetCount > 0, name); assert.deepEqual(validate(c), []);
    for (let p = 0; p < f.h.length; p++) if (f.mask[p]) assert.ok(f.h[p] >= c.grid.minDepth && f.h[p] <= c.grid.maxDepth, name);
    if (['osaka', 'tokyo', 'ise'].includes(name)) bays.add(Array.from(f.mask).join(''));
    if (name.startsWith('south-')) assert.ok(c.numerics.coriolisF0 < 0);
  }
  assert.equal(bays.size, 3);
});

test('one block is removed or added per brush cell, including side hits', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, nz: 3, preset: 'uniform', minDepth: 60, maxDepth: 60 });
  const f = buildFields(c);
  assert.deepEqual(terrainBlockEdits(c.grid, f, 27, 'fill', 1), { 27: 40 });
  const wide = terrainBlockEdits(c.grid, f, 27, 'fill', 2);
  assert.equal(Object.keys(wide).length, 9); assert.ok(Object.values(wide).every(v => v === 40));
  c.grid.edits[27] = 0;
  assert.deepEqual(terrainBlockEdits(c.grid, buildFields(c), 27, 'dig', 1), { 27: 20 });
  assert.deepEqual(terrainBlockEdits(c.grid, buildFields(c), 27, 'dig', 1, { depth: 25, normal: { x: 1, y: 0, z: 0 } }), { 27: 40 });
});

test('mixing affects all layers; gradient axes and hemisphere restrictions hold', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 60, maxDepth: 60 }); resizeLayers(c, 15);
  Object.assign(c.initial, { distribution: 'summer', mixing: 1, tempSurface: 26, tempBottom: 10, saltSurface: 32, saltBottom: 34 });
  let f = buildFields(c); assert.ok(f.temp.every(v => v === 18)); assert.ok(f.salt.every(v => v === 33));
  c.initial.distribution = 'gradient-y'; c.initial.tempGradient = 4;
  f = buildFields(c); assert.equal(f.temp[7], f.temp[0]); assert.equal(f.temp[56] - f.temp[0], 4);
  assert.equal(f.temp[14 * 64], f.temp[0]);
  c.grid.geoBounds = { west: 120, east: 140, south: -40, north: -20 }; c.initial.distribution = 'summer';
  assert.ok(validate(c).some(message => message.includes('夏季')));
});

test('river mouths survive vertical resize but reject dry or halo cells', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 60, maxDepth: 60 });
  c.rivers = [{ id: 'a', cell: 27, flow: 50, temp: 15, salt: 0, biology: {} }]; resizeLayers(c, 15);
  assert.equal(buildFields(c).nz, 15);
  c.grid.edits[27] = 0; assert.throws(() => buildFields(c), /河口/);
  c.grid.edits = {}; c.rivers[0].cell = 0; assert.throws(() => buildFields(c), /河口/);
});
