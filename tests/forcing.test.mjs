import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { WIND_DATA, WIND_SHA256 } from '../src/data/wind-ncep.js';
import { buildWind, ensureWind, windStress, sampleWindClimate, rotationCoefficients, seasonalProfile, OMEGA, EARTH_RADIUS } from '../src/forcing.js';
import { defaults, validate, resizeLayers, buildFields } from '../src/model.js';
import { fixture, runCase } from './runtime-helper.mjs';
import { parseWindAscii } from '../scripts/fetch-wind.mjs';

test('NOAA wind payload integrity, source provenance and periods', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(WIND_DATA)).digest('hex'), WIND_SHA256);
  assert.equal(WIND_DATA.latitude.length, 94); assert.equal(WIND_DATA.longitude.length, 192);
  assert.equal(WIND_DATA.products.annual.months, 360);
  for (const id of ['JJA', 'DJF']) assert.equal(WIND_DATA.products[id].months, 90);
  for (const id of ['elnino', 'lanina']) assert.equal(WIND_DATA.products[id].months, 9);
  for (const source of WIND_DATA.sources) { assert.equal(new URL(source.url).hostname, 'psl.noaa.gov'); assert.match(source.sha256, /^[a-f0-9]{64}$/); }
  for (const data of Object.values(WIND_DATA.products)) for (const key of ['u', 'v', 'tx', 'ty']) { assert.equal(data[key].length, 94 * 192); assert.ok(data[key].every(Number.isFinite)); }
  assert.notDeepEqual(WIND_DATA.products.JJA.u, WIND_DATA.products.DJF.u);
  assert.notDeepEqual(WIND_DATA.products.elnino.u, WIND_DATA.products.lanina.u);
  assert.deepEqual(sampleWindClimate('annual', 0, 35), sampleWindClimate('annual', 360, 35));
  assert.ok(Object.values(sampleWindClimate('annual', -125, 90)).every(Number.isFinite));
});

test('OPeNDAP parser rejects missing and duplicated values', () => {
  const text = 'header\n---------------------------------------------\nuwnd.uwnd[1][1][2]\n[0][0], 2, 3\n\nuwnd.time[1]\n1674264\n\nuwnd.lat[1]\n35\n\nuwnd.lon[2]\n130, 132\n\n';
  assert.deepEqual([...parseWindAscii(text, 'uwnd').values], [2, 3]);
  assert.throws(() => parseWindAscii(text.replace('2, 3', '2, -9.96921e36'), 'uwnd'));
  assert.throws(() => parseWindAscii(text.replace('2, 3', '2'), 'uwnd'));
});

test('wind directions, one-cell overrides and invalid settings', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8 });
  const w = ensureWind(c); Object.assign(w, { speed: 10, direction: 90 });
  let fields = buildWind(c); assert.ok(Math.abs(fields.u[27] - 10) < 1e-10); assert.ok(Math.abs(fields.tx[27] - 0.15925) < 1e-10);
  const prior = fields; w.edits[27] = { u: -3, v: 4 }; fields = buildWind(c);
  assert.equal(fields.u[27], -3); assert.equal(fields.ty[27], windStress(-3, 4).ty);
  for (let p = 0; p < 64; p++) if (p !== 27) assert.equal(fields.u[p], prior.u[p]);
  w.edits[64] = { u: 1, v: 0 }; assert.ok(validate(c).some(s => s.includes('風のセル番号'))); delete w.edits[64];
  w.edits[27].u = NaN; assert.ok(validate(c).some(s => s.includes('風速')));
});

test('thermocline shifts, broadens and converges with cell-averaged vertical resolution', () => {
  const profile = (mix, nz) => Array.from({ length: nz }, (_, k) => seasonalProfile(k, nz, mix, 26, 10));
  assert.ok(profile(0.5, 15).filter(t => t > 18).length > profile(0, 15).filter(t => t > 18).length);
  assert.ok(profile(1, 15).every(t => t === 18));
  const coarse = profile(0.3, 3), fine = profile(0.3, 15);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(coarse[k] - fine.slice(k * 5, k * 5 + 5).reduce((a, b) => a + b) / 5) < 1e-12);
  const c = defaults(); c.initial.distribution = 'summer'; c.initial.mixing = 0.3; resizeLayers(c, 15);
  const f = buildFields(c), p = f.mask.findIndex(Boolean), size = f.nx * f.ny;
  for (let k = 0; k < 15; k++) assert.equal(f.temp[k * size + p], seasonalProfile(k, 15, 0.3, 20, 8));
});

test('latitude rotation has correct hemispheric sign, equator and f-plane', () => {
  const at = latitude => rotationCoefficients({ rotationMode: 'latitude', latitude, rotationPlane: 'beta' });
  assert.equal(at(0).f0, 0); assert.equal(at(0).beta, 2 * OMEGA / EARTH_RADIUS);
  assert.equal(at(-35).f0, -at(35).f0); assert.equal(at(-35).beta, at(35).beta);
  assert.equal(rotationCoefficients({ rotationMode: 'latitude', latitude: 35, rotationPlane: 'f' }).beta, 0);
});

test('opening wind settings preserves legacy gyre stress until edited', () => {
  const c = defaults(); Object.assign(c.numerics, { windPattern: 'gyre', windX: 0.1, windY: 0.03 });
  const before = buildWind(c); ensureWind(c); const after = buildWind(c);
  assert.deepEqual(after.tx, before.tx); assert.deepEqual(after.ty, before.ty);
});

test('NOAA seasonal wind forces native ROMS without a network dependency', async () => {
  const c = fixture(); Object.assign(ensureWind(c), { pattern: 'climatology', climate: 'DJF', reference: 'setouchi' });
  const result = await runCase(c, 20);
  assert.ok(result.state.u.every(Number.isFinite));
  assert.ok(result.state.u.some(v => Math.abs(v) > 1e-8));
});

test('native ROMS responds to one-cell wind edits and latitude coefficients', async () => {
  const c = fixture(); resizeLayers(c, 15); c.numerics.dt = 2;
  Object.assign(ensureWind(c), { speed: 0, direction: 90 });
  const base = await runCase(c, 20);
  c.wind.edits[27] = { u: 10, v: 0 };
  Object.assign(c.numerics, { rotationMode: 'latitude', latitude: 35, rotationPlane: 'beta' });
  const edited = await runCase(c, 20);
  assert.ok(edited.state.u.some((v, i) => Math.abs(v - base.state.u[i]) > 1e-8));
  assert.ok(edited.state.u.every(Number.isFinite));
  const { f0, beta } = rotationCoefficients(c.numerics);
  Object.assign(c.numerics, { rotationMode: 'manual', coriolisF0: f0, coriolisBeta: beta });
  const manual = await runCase(c, 20);
  assert.deepEqual(manual.state.u, edited.state.u);
});
