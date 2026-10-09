import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runCase } from './runtime-helper.mjs';
import { defaults, resizeLayers, buildFields, biologyTracers } from '../src/model.js';
import { readFile } from 'node:fs/promises';
import { writeInputs } from '../src/roms-input.js';

test('native NetCDF input writer resolves initial boundaries without UI seeding', async () => {
  for (const model of ['npzd', 'nemuro']) {
    const c = fixture(model); for (const b of Object.values(c.boundary)) { b.mode = 'specified'; b.fromInitial = true; }
    c.initial.distribution = 'stratified'; c.initial.tempBottom = 7;
    const key = biologyTracers(c)[0].key; c.initial.painted[key] = { 0: { 8: 17.125 } };
    const f = buildFields(c), original = structuredClone(c);
    const factory = (await import(`../runtime/${model}/roms.js`)).default;
    const runtime = await factory({ print() {}, printErr() {} });
    runtime.FS.writeFile('varinfo.dat', await readFile(new URL('../runtime/varinfo.dat', import.meta.url)));
    const ccall = runtime.ccall.bind(runtime), dims = new Map(), variables = new Map(), output = new Map();
    let path;
    runtime.ccall = (name, type, types, args) => {
      if (name === 'nc_create') { path = args[0]; dims.clear(); variables.clear(); }
      if (name === 'nc_put_var_double' && path === 'roms_bry.nc') {
        const variable = variables.get(args[1]);
        output.set(variable.name, runtime.HEAPF64.slice(args[2] / 8, args[2] / 8 + variable.length));
      }
      const code = ccall(name, type, types, args);
      if (name === 'nc_def_dim') dims.set(runtime.HEAP32[args[3] / 4], args[2]);
      if (name === 'nc_def_var') {
        const length = Array.from(runtime.HEAP32.subarray(args[4] / 4, args[4] / 4 + args[3])).reduce((n, id) => n * dims.get(id), 1);
        variables.set(runtime.HEAP32[args[5] / 4], { name: args[1], length });
      }
      return code;
    };
    writeInputs(runtime, c, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'));
    assert.deepEqual(c, original);
    assert.equal(output.get('temp_west')[1], f.temp[8]);
    for (const { key, boundary } of biologyTracers(c)) assert.equal(output.get(`${boundary}_west`)[1], f.biology[key][8]);
    for (const name of ['zeta', 'u', 'v', 'ubar', 'vbar', 'salt']) assert.equal(output.get(`${name}_south`)[1], f[name][1]);
    c.boundary.west.fromInitial = false; c.boundary.west.layers[0].temp = 31;
    writeInputs(runtime, c, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'));
    assert.equal(output.get('temp_west')[1], 31);
  }
});

test('actual ROMS runs a two-layer basin', async () => {
  const config = fixture();
  resizeLayers(config, 2);
  const { state } = await runCase(config, 100);
  assert.equal(state.temp.length, 8 * 8 * 2);
  for (const value of state.temp) assert(Math.abs(value - 20) < 1e-10);
});

test('default sloping coastal bathymetry remains finite for 100 steps', async () => {
  const { state, masks } = await runCase(defaults(), 100);
  for (const values of Object.values(state)) for (const value of values) assert(Number.isFinite(value));
  for (const [field, mask] of [['u', masks.maskU], ['v', masks.maskV]]) {
    for (let i = 0; i < state[field].length; i++) if (!mask[i % mask.length]) assert(state[field][i] === 0);
  }
});

test('actual ROMS preserves a uniform resting closed basin', async () => {
  const { state, time } = await runCase(fixture());
  assert.equal(time, 1000);
  for (const value of state.temp) assert(Math.abs(value - 20) < 1e-10);
  for (const value of state.salt) assert(Math.abs(value - 34) < 1e-10);
  for (const field of ['u', 'v', 'zeta']) for (const value of state[field]) assert(Math.abs(value) < 1e-12);
});

test('actual ROMS responds to wind while closing dry C-grid faces', async () => {
  const { state, masks } = await runCase(fixture('coast'));
  assert(Math.max(...state.u.map(Math.abs)) > 1e-5);
  for (const [field, mask] of [['u', masks.maskU], ['v', masks.maskV]]) {
    assert(mask.some(value => value === 0));
    for (let i = 0; i < state[field].length; i++) if (!mask[i % mask.length]) assert(state[field][i] === 0);
  }
});

test('actual ROMS vertical diffusion smooths stratification and conserves tracer', async () => {
  const { initial, state } = await runCase(fixture('diffusion'));
  assert(Math.max(...state.temp) < Math.max(...initial.temp) - 0.01);
  assert(Math.min(...state.temp) > Math.min(...initial.temp) + 0.01);
  const mean = a => a.reduce((sum, value) => sum + value, 0) / a.length;
  assert(Math.abs(mean(initial.temp) - mean(state.temp)) < 1e-9);
});

for (const mode of ['specified', 'radiation', 'periodic']) test(`actual ROMS executes ${mode} boundaries`, async () => {
  const config = fixture(mode), { state } = await runCase(config, 20);
  if (mode === 'specified') {
    for (let k = 0; k < 3; k++) for (let j = 1; j < 7; j++) assert(Math.abs(state.temp[k * 64 + j * 8] - config.boundary.west.layers[k].temp) < 1e-10);
  } else for (const value of state.temp) assert(Math.abs(value - 20) < 1e-10);
});
