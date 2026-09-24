import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate, buildFields, resizeLayers, inspect } from '../src/model.js';

test('dry rho points close both adjacent C-grid faces', () => {
  const config = defaults(); config.grid.preset = 'open'; config.grid.edits[100] = 0;
  const f = buildFields(config), i = 100 % f.nx, j = Math.floor(100 / f.nx);
  assert.equal(f.mask[100], 0);
  assert.ok(f.h[100] > 0);
  assert.equal(f.maskU[j * (f.nx - 1) + i - 1], 0);
  assert.equal(f.maskU[j * (f.nx - 1) + i], 0);
  assert.equal(f.maskV[(j - 1) * f.nx + i], 0);
  assert.equal(f.maskV[j * f.nx + i], 0);
  assert.equal(f.maskU.length, (f.nx - 1) * f.ny);
});
test('uniform initial fields have no accidental stratification', () => {
  const config = defaults(); config.initial.distribution = 'uniform';
  const f = buildFields(config);
  for (let p = 0; p < f.temp.length; p++) if (f.mask[p % f.mask.length]) assert.equal(f.temp[p], config.initial.tempSurface);
});
test('layer changes preserve the existing surface and bottom conditions', () => {
  const config = defaults(); config.boundary.west.layers[2].temp = 25; config.boundary.west.layers[0].temp = 3;
  resizeLayers(config, 5);
  assert.equal(config.boundary.west.layers[4].temp, 25); assert.equal(config.boundary.west.layers[0].temp, 3);
  assert.deepEqual(validate(config), []);
});
test('invalid imports fail before allocating arrays', () => {
  for (const value of [null, {}, { schemaVersion: 1 }, { ...defaults(), grid: { nx: 1e12 } }]) assert.ok(validate(value).length);
  const config = defaults(); config.grid.edits = { 999999: 0 }; assert.throws(() => buildFields(config));
  config.grid.edits = {}; config.numerics.dt = NaN; assert.throws(() => buildFields(config));
});
test('all-land and below-bed sea levels are rejected', () => {
  const config = defaults(); config.grid.edits = Object.fromEntries(Array.from({ length: config.grid.nx * config.grid.ny }, (_, p) => [p, 0]));
  assert.throws(() => buildFields(config), /水域/);
  config.grid.edits = { 200: 1 }; config.initial.zeta = -2;
  assert.throws(() => buildFields(config), /海底/);
});
test('periodic pairing and barotropic consistency are checked', () => {
  const config = defaults(); config.boundary.west.mode = 'periodic'; assert.ok(validate(config).length);
  config.boundary.east.mode = 'periodic'; assert.deepEqual(validate(config), []);
  assert.ok(inspect(config, buildFields(config)).some(message => message.includes('周期端')));
});
