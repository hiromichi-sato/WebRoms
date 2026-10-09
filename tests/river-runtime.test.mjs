import test from 'node:test';
import assert from 'node:assert/strict';
import { biologyTracers, BIO_TRACERS, resizeLayers } from '../src/model.js';
import { fixture, runCase } from './runtime-helper.mjs';

function riverCase(model = 'uniform') {
  const config = fixture(model);
  resizeLayers(config, 15);
  Object.assign(config.numerics, { dt: 10, maxSteps: 100, horizontalDiffusion: 0, verticalDiffusion: 0 });
  config.rivers = [{ id: 'river-a', cell: 27, flow: 100, temp: 10, salt: 0, biology: {} }];
  return config;
}

function integral(config, state, field) {
  const { nx, ny, nz, dx, dy } = config.grid;
  let sum = 0;
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const p = j * nx + i;
    if (field === 'volume') sum += state.zeta[p] * dx * dy;
    else for (let k = 0; k < nz; k++) {
      const values = state[field] ?? state.biology[field];
      // Uniform sigma layers use the tracer-time depths, not fast-mode zeta.
      const thickness = state.z_r[nx * ny + p] - state.z_r[p];
      sum += values[k * nx * ny + p] * thickness * dx * dy;
    }
  }
  return sum;
}

test('15-layer physical river adds volume and tracer mass throughout the run', async () => {
  const config = riverCase();
  const short = await runCase(config, 50), long = await runCase(config, 100);
  const q = config.rivers[0].flow;
  for (const result of [short, long]) {
    assert.equal(result.state.temp.length, 8 * 8 * 15);
    assert.ok(result.initial.temp.every(v => Math.abs(v - 20) < 1e-10));
    assert.ok(Math.min(...result.state.temp) < 19.999);
    assert.ok(Math.min(...result.state.salt) < 33.999);
    const volume = integral(config, result.state, 'volume');
    assert.ok(Math.abs(volume - q * result.time) < q * config.numerics.dt * 2, `volume ${volume}, expected ${q * result.time}`);
    for (const [field, concentration] of [['temp', 10], ['salt', 0]]) {
      const added = integral(config, result.state, field) - integral(config, result.initial, field);
      const expected = q * result.time * concentration;
      assert.ok(Math.abs(added - expected) < 0.1, `${field}: added ${added}, expected ${expected}`);
    }
  }
  assert.ok(integral(config, long.state, 'volume') > 1.9 * integral(config, short.state, 'volume'));
});

for (const model of ['npzd', 'nemuro']) test(`15-layer ${model} river forces every biological tracer`, async () => {
  const config = riverCase(model), tracers = biologyTracers(config);
  const parameters = config.ecosystem.parameters[model];
  if (model === 'npzd') parameters.wDet = 0;
  else { parameters.setVPON = 0; parameters.setVOpal = 0; }
  const baseline = await runCase(config, 20);
  config.rivers[0].biology = Object.fromEntries(tracers.map(({ key }, i) => [key, 100 + i]));
  const enriched = await runCase(config, 20);
  for (const { key } of tracers) {
    assert.equal(enriched.state.biology[key].length, 8 * 8 * 15);
    assert.deepEqual(enriched.initial.biology[key], baseline.initial.biology[key]);
    assert.ok(integral(config, enriched.state, key) > integral(config, baseline.state, key) + 1000, `${model}/${key} source must enter the native tracer equation`);
    for (let k = 0; k < config.grid.nz; k++) {
      const p = k * config.grid.nx * config.grid.ny + config.rivers[0].cell;
      assert.ok(enriched.state.biology[key][p] > baseline.state.biology[key][p], `${model}/${key} layer ${k}`);
    }
    assert.ok(enriched.state.biology[key].every(value => Number.isFinite(value) && value >= -1e-8));
  }
  const nitrogen = tracers.filter(tracer => tracer.unit === 'mmol N/m³');
  const added = nitrogen.reduce((sum, { key }) => sum + integral(config, enriched.state, key) - integral(config, baseline.state, key), 0);
  const expected = nitrogen.reduce((sum, { key }) => sum + config.rivers[0].biology[key], 0) * config.rivers[0].flow * enriched.time;
  assert.ok(Math.abs(added - expected) < 0.1, `${model} nitrogen: added ${added}, expected ${expected}`);
});

test('multiple constant rivers add their configured heat and nonzero salt fluxes', async () => {
  const config = riverCase();
  config.rivers.push({ id: 'river-b', cell: 36, flow: 50, temp: 25, salt: 5, biology: {} });
  const { initial, state, time } = await runCase(config, 50);
  for (const field of ['temp', 'salt']) {
    const expected = config.rivers.reduce((sum, river) => sum + river.flow * river[field] * time, 0);
    const actual = integral(config, state, field) - integral(config, initial, field);
    assert.ok(Math.abs(actual - expected) < 0.1, `${field}: added ${actual}, expected ${expected}`);
  }
});

test('zero-flow rivers leave a resting 15-layer basin unchanged', async () => {
  const config = riverCase();
  config.rivers[0].flow = 0;
  const { state } = await runCase(config, 20);
  assert.ok(state.zeta.every(v => Math.abs(v) < 1e-12));
  assert.ok(state.temp.every(v => Math.abs(v - 20) < 1e-10));
  assert.ok(state.salt.every(v => Math.abs(v - 34) < 1e-10));
});

test('river rejects halo cells and invalid flow before native initialization', async () => {
  for (const change of [{ cell: 0 }, { cell: 64 }, { cell: 27.5 }, { flow: -1 }, { temp: NaN }, { salt: -1 }]) {
    const config = riverCase();
    Object.assign(config.rivers[0], change);
    await assert.rejects(runCase(config, 1), /River|河口|河川/);
  }
});

for (const model of ['uniform', 'npzd', 'nemuro']) test(`${model} river accepts the UI's complete tracer catalog`, async () => {
  const config = riverCase(model);
  const baseline = await runCase(config, 2);
  const active = new Set(config.ecosystem.enabled ? biologyTracers(config).map(({ key }) => key) : []);
  config.rivers[0].biology = Object.fromEntries(BIO_TRACERS.map(({ key }) => [key, active.has(key) ? 0 : NaN]));
  const result = await runCase(config, 2);
  assert.deepEqual(result.state, baseline.state);
});

test('river rejects unknown and invalid active biological concentrations', async () => {
  for (const biology of [{ unknown: 1 }, { npzd_NO3_: -1 }, { npzd_NO3_: NaN }]) {
    const config = riverCase('npzd');
    config.rivers[0].biology = biology;
    await assert.rejects(runCase(config, 1), /Invalid river|河川/);
  }
});

test('gyre zonal wind differs spatially from uniform wind in the native solution', async () => {
  const config = riverCase();
  config.rivers = [];
  config.numerics.windX = 0.1;
  config.numerics.windPattern = 'uniform';
  const uniform = await runCase(config, 20);
  config.numerics.windPattern = 'gyre';
  const gyre = await runCase(config, 20);
  assert.ok(gyre.state.u.some((value, p) => Math.abs(value - uniform.state.u[p]) > 1e-5));
});
