import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runCase } from './runtime-helper.mjs';

const mean = a => a.reduce((sum, x) => sum + x, 0) / a.length;
for (const mixing of [false, true]) for (const model of ['physical', 'npzd', 'nemuro']) {
  test(`${model} ${mixing ? 'GLS' : 'fixed'} heat flux conserves column heat`, async () => {
    const c = fixture();
    c.numerics.calculateDiffusion = mixing;
    Object.assign(c.ecosystem, { enabled: model !== 'physical', model: model === 'physical' ? 'npzd' : model, shortwave: 0 });
    c.heat = { mode: 'flux', netFlux: 200, airTemperature: -50, exchangeCoefficient: 200 };
    const { initial, state, time } = await runCase(c, 20);
    const expected = 200 * time / (1025 * 3985 * 40);
    assert.ok(Math.abs(mean(state.temp) - mean(initial.temp) - expected) < expected * .01, `${mean(state.temp) - mean(initial.temp)} vs ${expected}`);
    assert.ok(state.temp.every(Number.isFinite));
  });
}
test('air mode heats/cools from current SST and ignores inactive direct flux', async () => {
  for (const airTemperature of [10, 20, 30]) {
    const c = fixture();
    c.heat = { mode: 'air', airTemperature, exchangeCoefficient: 20, netFlux: 2000 };
    const { initial, state } = await runCase(c, 20);
    const delta = mean(state.temp) - mean(initial.temp);
    if (airTemperature === 20) assert.ok(Math.abs(delta) < 1e-10);
    else assert.equal(Math.sign(delta), Math.sign(airTemperature - 20));
  }
});
test('off mode is identical to legacy configuration without heat settings', async () => {
  const c = fixture(); delete c.heat;
  const legacy = await runCase(c, 10);
  c.heat = { mode: 'off', airTemperature: 50, exchangeCoefficient: 200, netFlux: 2000 };
  assert.deepEqual((await runCase(c, 10)).state, legacy.state);
});
