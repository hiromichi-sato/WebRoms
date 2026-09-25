import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, biologyTracers } from '../src/model.js';
import { runCase } from './runtime-helper.mjs';

export function bioConfig(model) {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, nz: 3, preset: 'open', minDepth: 40, maxDepth: 40 });
  config.initial.distribution = 'uniform';
  Object.assign(config.ecosystem, { enabled: true, model, shortwave: 150 });
  Object.assign(config.numerics, { dt: 60, maxSteps: 60, steadyWindow: 5, horizontalDiffusion: 0, verticalDiffusion: 0, coriolisBeta: 0 });
  return config;
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
