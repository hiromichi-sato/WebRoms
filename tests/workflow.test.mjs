import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { coastalReceiver } from '../src/coastal-rivers.js';
import { seedBoundary } from '../src/boundary-initial.js';
import { exportTerrain, importTerrain, gridGeometry } from '../src/shape-io.js';
import { selectRecords, selectFinalHours, resultShape } from '../src/results-export.js';
import { validRange } from '../src/contour-settings.js';
import { regionalClimate, applyRegionalClimate } from '../src/climatology.js';
import { biologyProfile } from '../src/biology-initial.js';
import { fetchTides } from '../src/tides.js';

function fixture() { const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 20, maxDepth: 100 }); return c; }

test('final-hour export anchors sampling to actual completion and includes the final state', () => {
  const records = [0, 3600, 7200, 10800, 12000].map(time => ({ time }));
  assert.deepEqual(selectFinalHours(records, 2, 3600).map(r => r.time), [7200, 12000]);
  assert.deepEqual(selectFinalHours(records, 0, 3600).map(r => r.time), [12000]);
  assert.deepEqual(selectFinalHours(records, 24, 1), records);
  assert.deepEqual(selectFinalHours(records, 1, 1e6).map(r => r.time), [12000]);
  assert.deepEqual(selectFinalHours([{ time: 0 }], 24, 3600), [{ time: 0 }]);
  for (const hours of [-1, NaN, Infinity]) assert.throws(() => selectFinalHours(records, hours, 1));
  assert.throws(() => selectFinalHours([], 1, 1));
  assert.throws(() => selectFinalHours(records, 1, 0));
  assert.equal(validRange(-2, 2), true);
  for (const range of [[1, 1], [2, 1], [NaN, 1], [0, Infinity]]) assert.equal(validRange(...range), false);
});
test('terrain shapefile round trip preserves lattice and land', async () => {
  for (const preset of ['open', 'osaka', 'california', 'north-pacific', 'south-pacific', 'north-atlantic', 'south-atlantic']) {
    const c = fixture(); c.grid.preset = preset; c.grid.edits = { 18: 0, 19: 54.125 };
    const f = buildFields(c), bytes = await exportTerrain(c, f);
    const g = await importTerrain(new File([bytes], 'terrain.zip'), c.grid);
    for (let p = 0; p < 64; p++) assert(Math.abs(g.edits[p] - (f.mask[p] ? f.h[p] : 0)) < 1e-6);
    assert.equal(g.nx, 8); assert.equal(g.dx, c.grid.dx);
    assert.doesNotThrow(() => buildFields({ ...c, grid: g }));
    if (preset !== 'open') for (const ring of gridGeometry(c).rings.flat()) for (const [lon, lat] of ring) { assert(lon >= -180 && lon <= 180); assert(lat >= -90 && lat <= 90); }
  }
});
test('coastal land selection only accepts adjacent interior water', () => {
  const c = fixture(); c.grid.edits[18] = 0; const f = buildFields(c);
  assert.equal(coastalReceiver(f, 18), 17);
  assert.throws(() => coastalReceiver(f, 17), /陸地/);
  const mask = new Uint8Array(64); mask[0] = 1;
  assert.throws(() => coastalReceiver({ nx: 8, ny: 8, mask }, 1), /2マス/);
});
test('specified boundary defaults follow painted nearest initial cells', () => {
  const c = fixture(); c.initial.painted = { temp: [{ 8: 17.25 }] }; seedBoundary(c, buildFields(c), 'west');
  assert.equal(c.boundary.west.mode, 'specified');
  assert.equal(c.boundary.west.painted.temp[0][1], 17.25);
});
test('regional means distinguish hemispheric seasons and preserve provenance', () => {
  for (const preset of ['osaka', 'tokyo', 'ise', 'setouchi', 'japan', 'california', 'north-pacific', 'south-pacific', 'north-atlantic', 'south-atlantic']) {
    const c = fixture(); c.grid.preset = preset;
    const r = regionalClimate(c, 'summer');
    assert.equal(r.period, preset.startsWith('south') ? 'DJF' : 'JJA');
    const next = applyRegionalClimate(c, 'summer');
    assert(buildFields(next).temp.every(Number.isFinite)); assert(next.climatology.regionLabel);
  }
  assert.throws(() => regionalClimate(fixture()), /参照海域/);
});
test('chlorophyll conversion and inferred biological profiles are positive and layered', () => {
  const c = fixture(); c.grid.preset = 'japan'; c.ecosystem.distribution = 'climatology';
  const top = biologyProfile(c, 'npzd_Phyt', 2, 200), bottom = biologyProfile(c, 'npzd_Phyt', 0, 200);
  assert(top > bottom && bottom > 0);
  assert.equal(biologyProfile(c, 'npzd_Zoop', 2, 200), top * .5);
});
test('result selection uses saved times without invented interpolation', () => {
  const records = [0, 20, 40, 50].map(time => ({ time }));
  assert.deepEqual(selectRecords(records, 10, 50, 25).map(r => r.time), [20, 50]);
  assert.throws(() => selectRecords(records, 60, 70, 1));
});
test('tide API parsing preserves UTC, datum and missing gaps', async () => {
  const result = await fetchTides('9414290', '2026-01-01', 1, 'hourly_height', async () => ({ ok: true, json: async () => ({ data: [{ t: '2026-01-01 00:00', v: '1.2' }, { t: '2026-01-01 01:00', v: '' }, { t: '2026-01-01 02:00', v: '-0.4' }] }) }));
  assert.equal(result.samples.length, 2); assert.equal(result.range, 1.6); assert.equal(result.datum, 'MSL');
  await assert.rejects(fetchTides('not-a-station', '2026-01-01'), /ID/);
});
