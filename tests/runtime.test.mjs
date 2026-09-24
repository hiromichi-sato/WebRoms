import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runCase } from './runtime-helper.mjs';
import { defaults, resizeLayers } from '../src/model.js';

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
