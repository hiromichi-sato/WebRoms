import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runCase } from './runtime-helper.mjs';
import { buildFields } from '../src/model.js';
import { ensureOcean, tideRequest, validateTidePackage, prepareForcing, parseCorrection } from '../src/ocean-boundary.js';
import { exportPlan } from '../src/export-plan.js';
import { readFile } from 'node:fs/promises';
import createRoms from '../runtime/roms.js';
import { writeInputs } from '../src/roms-input.js';
import { NetCDFReader } from '../vendor/netcdf-reader.js';

export function tideFixture() {
  const c = fixture(); c.grid.geoBounds = { west: 135, east: 135.1, south: 34, north: 34.1 };
  for (const b of Object.values(c.boundary)) { b.mode = 'open'; b.fromInitial = true; }
  const o = ensureOcean(c), request = tideRequest(c, buildFields(c));
  o.tides = { format: 'webroms-tides-v1', gridSignature: request.gridSignature, epoch: o.startUtc, kind: 'ocean-tide', unit: 'm', source: 'SYNTHETIC TEST ONLY', times: [0, 1800, 3600], points: request.points.map(p => ({ ...p, height: [0, .1, 0] })) };
  return c;
}
test('disabled height ignores retained values; manual layers generate consistent means', async () => {
  const c = tideFixture(); c.ocean.tideMode = 'off'; c.initial.zeta = .5;
  const runtime = await createRoms({ print() {}, printErr() {} });
  const template = await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8');
  writeInputs(runtime, c, template);
  let nc = new NetCDFReader(runtime.FS.readFile('roms_bry.nc'));
  assert(nc.getDataVariable('zeta_west').every(v => v === 0));
  assert.match(runtime.FS.readFile('roms.in', { encoding: 'utf8' }), /LBC\(isUvel\)\s*==\s*Gra/);
  c.ocean.seaLevelEnabled = true; c.ocean.velocityMode = 'manual';
  c.boundary.west.fromInitial = false;
  c.boundary.west.zeta = .25;
  c.boundary.west.layers.forEach((l, k) => { l.u = k; });
  c.boundary.west.ubar = -9;
  writeInputs(runtime, c, template);
  nc = new NetCDFReader(runtime.FS.readFile('roms_bry.nc'));
  assert(nc.getDataVariable('zeta_west').every(v => v === .25));
  assert(nc.getDataVariable('ubar_west').every(v => v === (c.grid.nz - 1) / 2));
});
test('FES boundary packages validate coordinates, mask, units and coverage', () => {
  const c = tideFixture(), f = buildFields(c);
  assert.equal(validateTidePackage(c.ocean.tides, c, f), c.ocean.tides);
  assert.equal(prepareForcing(c, f).value(0, 900), .05);
  const bad = structuredClone(c.ocean.tides); bad.points.pop(); assert.throws(() => validateTidePackage(bad, c, f), /すべて/);
  assert.throws(() => validateTidePackage({ ...bad, unit: 'cm' }, c, f), /形式/);
  assert.throws(() => exportPlan(c, 2, 3600, 'netcdf-series'), /期間/);
  c.grid.nx++; assert.throws(() => validateTidePackage(c.ocean.tides, c, f), /一致/);
});
test('corrections use residual after datum conversion, reject invalid values and cadence', () => {
  const c = tideFixture(); c.ocean.tideMode = 'off'; c.ocean.seaLevelEnabled = true;
  const opts = { cell: 0, kind: 'absolute', datumOffsetCm: -100, radiusKm: 30 };
  c.ocean.corrections = [parseCorrection('2026-01-01T00:00:00Z,110\n2026-01-01T01:00:00Z,110', opts)];
  assert(Math.abs(prepareForcing(c, buildFields(c)).value(0, 500) - .1) < 1e-10);
  c.ocean.corrections[0].samples[0].cm = 500;
  assert.throws(() => prepareForcing(c, buildFields(c)), /許容幅/);
  assert.throws(() => parseCorrection('2026-01-01T00:00:00,0\n2026-01-01T01:00:00,0', opts), /UTC/);
  assert.throws(() => parseCorrection('2026-01-01T00:00:00Z,0\n2026-01-01T12:00:00Z,0', opts), /1〜6/);
});
test('missing atlas uses explicit idealized tide, switches suppress retained forcing', () => {
  const c = tideFixture(); delete c.ocean.tides;
  let forcing = prepareForcing(c, buildFields(c));
  assert.match(forcing.source, /IDEALIZED/);
  assert(forcing.value(0, 3600) > .1);
  assert.equal(forcing.end, 45 * 86400);
  c.ocean.tideMode = 'off'; c.ocean.seaLevelEnabled = false;
  c.ocean.corrections = [{ samples: [{ utc: 'invalid', cm: 99999 }] }];
  assert.equal(prepareForcing(c, buildFields(c)), null);
});
test('density experiment with both switches off preserves computed motion', async () => {
  const c = tideFixture(); c.ocean.tideMode = 'off'; c.ocean.seaLevelEnabled = false;
  c.initial.distribution = 'gradient-x'; c.initial.tempGradient = 10; c.numerics.dt = 1;
  const { state } = await runCase(c, 100);
  assert(state.u.every(Number.isFinite));
  assert(Math.max(...state.u.map(Math.abs)) > 1e-8);
});
for (const model of ['physical', 'npzd', 'nemuro']) test(`real ROMS ${model} accepts Chapman/Flather/RadNud and time-dependent tidal boundary`, async () => {
  const c = tideFixture();
  c.ecosystem.model = model === 'physical' ? 'npzd' : model; c.ecosystem.enabled = model !== 'physical';
  c.numerics.dt = 1;
  const { state } = await runCase(c, 100);
  for (const key of ['zeta', 'u', 'v', 'temp', 'salt']) for (const value of state[key]) assert(Number.isFinite(value));
  assert(Math.max(...state.zeta.map(Math.abs)) > 1e-5);
});
