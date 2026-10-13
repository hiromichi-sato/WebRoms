import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate } from '../src/model.js';
import { heatParameters, surfaceHeatFlux } from '../src/heat-forcing.js';

test('air and prescribed flux cannot be added together; legacy settings remain adiabatic', () => {
  const c = defaults(); delete c.heat;
  assert.deepEqual(heatParameters(c), [0, 0, 0, 0]);
  c.heat = { mode: 'air', airTemperature: 25, exchangeCoefficient: 20, netFlux: -200 };
  assert.equal(surfaceHeatFlux(c, 20), 100);
  assert.equal(surfaceHeatFlux(c, 30), -100);
  assert.equal(surfaceHeatFlux(c, 25), 0);
  c.heat.mode = 'flux'; assert.equal(surfaceHeatFlux(c, 20), -200);
  assert.deepEqual(heatParameters(c), [2, 0, 0, -200]);
  c.heat.mode = 'off'; assert.equal(surfaceHeatFlux(c, 20), 0);
});
test('invalid active heat conditions fail validation', () => {
  const c = defaults(); c.heat.mode = 'air'; c.heat.airTemperature = NaN;
  assert.ok(validate(c).some(e => e.includes('気温')));
  c.heat.mode = 'flux'; c.heat.netFlux = Infinity;
  assert.throws(() => heatParameters(c), /熱フラックス/);
});
