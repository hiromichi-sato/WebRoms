import test from 'node:test';
import assert from 'node:assert/strict';
import { biologyTracers } from '../src/model.js';
import { fixture, runCase } from './runtime-helper.mjs';

export function bioConfig(model) {
  return fixture(model);
}

for (const model of ['npzd', 'nemuro']) test(`actual ROMS ${model} reacts and remains finite`, async () => {
  const config = bioConfig(model), { initial, state, time } = await runCase(config);
  assert.equal(time, 3600);
  let changed = false;
  for (const { key } of biologyTracers(config)) {
    assert.equal(state.biology[key].length, 192);
    for (const value of state.biology[key]) assert.ok(Number.isFinite(value) && value >= -1e-10, `${model}/${key} ${value}`);
    if (Math.abs(initial.biology[key][27] - state.biology[key][27]) > 1e-7) changed = true;
  }
  assert.ok(changed, 'biology must react, not just copy initial concentrations');
});

for (const model of ['npzd', 'nemuro']) test(`${model} conserves nitrogen without sinking`, async () => {
  const config = bioConfig(model), params = config.ecosystem.parameters[model];
  if (model === 'npzd') params.wDet = 0;
  else { params.setVPON = 0; params.setVOpal = 0; }
  const { initial, state } = await runCase(config);
  const nitrogen = biologyTracers(config).filter(tracer => tracer.unit === 'mmol N/m³');
  const total = fields => nitrogen.reduce((sum, { key }) => sum + [27, 91, 155].reduce((a, p) => a + fields.biology[key][p], 0), 0);
  assert.ok(Math.abs(total(state) - total(initial)) < 1e-8);
});

for (const model of ['npzd', 'nemuro']) test(`${model} uses edited reaction parameters`, async () => {
  const config = bioConfig(model), baseline = await runCase(config);
  const key = model === 'npzd' ? 'npzd_Phyt' : 'nemuro_Sphy';
  if (model === 'npzd') config.ecosystem.parameters.npzd.Vm_NO3 = 0;
  else config.ecosystem.parameters.nemuro.VmaxS = 0;
  const modified = await runCase(config);
  assert.ok(Math.abs(modified.state.biology[key][155] - baseline.state.biology[key][155]) > 1e-6);
});

test('NEMURO photosynthesis responds to surface shortwave radiation', async () => {
  const config = bioConfig('nemuro'), light = await runCase(config);
  config.ecosystem.shortwave = 0;
  const dark = await runCase(config);
  assert.ok(light.state.biology.nemuro_Sphy[155] > dark.state.biology.nemuro_Sphy[155]);
});

for (const model of ['npzd', 'nemuro']) test(`${model} diffuses biological concentrations`, async () => {
  const config = bioConfig(model), key = model === 'npzd' ? 'npzd_NO3_' : 'nemuro_NO3_';
  config.initial.painted[key] = { 2: { 27: 12 } };
  const unmixed = await runCase(config, 10);
  config.numerics.horizontalDiffusion = 1000;
  const mixed = await runCase(config, 10);
  assert.ok(mixed.state.biology[key][155] < unmixed.state.biology[key][155] - 0.1);
  assert.ok(mixed.state.biology[key][156] > unmixed.state.biology[key][156] + 0.01);
});

for (const model of ['npzd', 'nemuro']) test(`${model} remains finite next to masked land`, async () => {
  const config = bioConfig(model);
  config.grid.preset = 'island'; config.numerics.windX = 0.02;
  config.numerics.horizontalDiffusion = 10; config.numerics.verticalDiffusion = 0.0001;
  const { state, masks } = await runCase(config);
  assert.ok(masks.mask.some(value => value === 0));
  for (const values of Object.values(state.biology)) {
    for (let p = 0; p < values.length; p++) if (masks.mask[p % 64]) assert.ok(Number.isFinite(values[p]) && values[p] >= -1e-10);
  }
});

for (const model of ['npzd', 'nemuro']) for (const mode of ['specified', 'radiation', 'periodic']) test(`${model} supports ${mode} tracer boundaries`, async () => {
  const config = bioConfig(model), tracer = biologyTracers(config)[0].key;
  for (const boundary of Object.values(config.boundary)) boundary.mode = mode;
  if (mode === 'specified') config.boundary.west.layers.forEach(layer => { layer[tracer] = 1.2; });
  const { state } = await runCase(config, 10);
  for (const values of Object.values(state.biology)) assert.ok(values.every(Number.isFinite));
  if (mode === 'specified') assert.ok(Math.abs(state.biology[tracer][24] - 1.2) < 1e-10);
});
