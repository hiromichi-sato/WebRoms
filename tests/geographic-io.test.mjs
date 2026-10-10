import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './runtime-helper.mjs';
import { buildFields, resizeLayers } from '../src/model.js';
import { initialNetcdf } from '../src/initial-export.js';
import { readGeographicNetcdf, resampleInitial, sampleGeographic, resampleTerrain } from '../src/geographic-io.js';
import { exportSeaLevel, importSeaLevel } from '../src/shape-io.js';

test('initial NetCDF is georeferenced and round trips physical depths and TS', async () => {
  const c = fixture(); c.grid.geoBounds = { west: 135, east: 135.1, south: 34, north: 34.1 };
  c.initial.distribution = 'stratified'; c.initial.tempBottom = 8;
  const source = readGeographicNetcdf(await initialNetcdf(c));
  assert.equal(source.attributes.webroms_format, 'geographic-v1');
  const f = buildFields(c), result = resampleInitial(source, c, f);
  for (let k = 0; k < c.grid.nz; k++) assert(Math.abs(result.painted.temp[k][20] - f.temp[k * 64 + 20]) < 1e-9);
  resizeLayers(c, 15);
  const refined = resampleInitial(source, c, buildFields(c));
  assert.equal(refined.painted.temp.length, 15);
  assert(refined.painted.temp[14][20] >= refined.painted.temp[0][20]);
  const terrain = resampleTerrain(source, c.grid); assert.equal(terrain.edits[20], 40);
});
test('missing coordinates, source coverage, bad units and unsupported NetCDF are rejected', async () => {
  assert.throws(() => readGeographicNetcdf(new Uint8Array([137, 72, 68, 70])), /classic/);
  const c = fixture(); await assert.rejects(initialNetcdf(c), /緯度経度/);
  c.grid.geoBounds = { west: 135, east: 135.1, south: 34, north: 34.1 };
  const source = readGeographicNetcdf(await initialNetcdf(c));
  assert.throws(() => sampleGeographic(source, source.vars.temp, 140, 34, -10), /覆って/);
  source.vars.temp.attrs.units = 'K'; assert.throws(() => resampleInitial(source, c, buildFields(c)), /単位/);
});
test('sea-level Shape round trip retains coordinate coverage and datum metadata', async () => {
  globalThis.self = globalThis;
  const c = fixture(); c.grid.geoBounds = { west: 135, east: 135.1, south: 34, north: 34.1 };
  c.initial.zeta = .27;
  const f = buildFields(c), bytes = exportSeaLevel(c, f);
  const result = await importSeaLevel(new File([bytes], 'surface.zip'), c, f);
  assert.equal(result.metadata.datum, 'model-reference');
  assert.equal(result.painted.zeta[0][22], .27);
});
for (const model of ['npzd', 'nemuro']) test(`${model} initial NetCDF preserves all explicit biological tracer keys`, async () => {
  const c = fixture(model); c.grid.geoBounds = { west: 135, east: 135.1, south: 34, north: 34.1 };
  const fields = buildFields(c), source = readGeographicNetcdf(await initialNetcdf(c));
  const result = resampleInitial(source, c, fields);
  for (const [key, values] of Object.entries(fields.biology)) assert.equal(result.painted[key][1][22], values[64 + 22]);
});
