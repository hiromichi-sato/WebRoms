import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate, buildFields, resizeLayers, inspect } from '../src/model.js';

test('layer resize preserves sparse anchors, surface fields and independent painted cells', () => {
  const c = defaults(); c.grid.preset = 'open';
  c.initial.anchors.temp = { 2: 22 }; c.initial.painted.temp = [{ 9: 10 }]; c.initial.painted.zeta = [{ 9: .5 }];
  c.boundary.west.anchors.temp = { 0: 8, 2: 20 }; c.boundary.west.painted.temp = [{ 1: 11 }];
  c.boundary.west.painted.zeta = [{ 1: .3 }]; c.boundary.west.painted.ubar = [{ 1: .1 }];
  for (const nz of [8, 15, 2, 5]) {
    resizeLayers(c, nz); assert.deepEqual(validate(c), []); assert.equal(buildFields(c).nz, nz);
    assert.equal(c.initial.anchors.temp[nz - 1], 22);
    assert.equal(c.boundary.west.anchors.temp[0], 8); assert.equal(c.boundary.west.anchors.temp[nz - 1], 20);
    assert.deepEqual(c.initial.painted.zeta, [{ 9: .5 }]);
    assert.deepEqual(c.boundary.west.painted.zeta, [{ 1: .3 }]); assert.deepEqual(c.boundary.west.painted.ubar, [{ 1: .1 }]);
    if (nz > 2) { const next = c.initial.painted.temp[1][9]; assert.notStrictEqual(c.initial.painted.temp[0], c.initial.painted.temp[1]); c.initial.painted.temp[0][9] = 7; assert.equal(c.initial.painted.temp[1][9], next); }
  }
});

test('step count no longer depends on legacy convergence settings', () => {
  const config = defaults();
  assert.equal('tolerance' in config.numerics, false);
  assert.equal('steadyWindow' in config.numerics, false);
  Object.assign(config.numerics, { maxSteps: 1, tolerance: -1, steadyWindow: 10000 });
  assert.deepEqual(validate(config), []);
  config.numerics.maxSteps = 0;
  assert(validate(config).some(message => message.includes('計算ステップ数')));
});

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
