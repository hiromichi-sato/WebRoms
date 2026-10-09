import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/model.js';
import { exportPlan, RUNTIME_STEP_LIMIT } from '../src/export-plan.js';

test('additional RUN rounds to real steps and includes both ends', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8 }); c.numerics.dt = 10;
  const p = exportPlan(c, 25 / 3600, 11, 'netcdf');
  assert.equal(p.steps, 3); assert.equal(p.duration, 30); assert.equal(p.every, 2); assert.equal(p.interval, 20); assert.equal(p.count, 3);
  assert.equal(exportPlan(c, 0, 1, 'netcdf').count, 1);
  assert.equal(exportPlan(c, 40 / 3600, 20, 'netcdf').count, 3);
  assert.equal(exportPlan(c, 20 / 3600, 100, 'netcdf').count, 2);
});
test('invalid or oversized output is rejected before integration', () => {
  const c = defaults();
  for (const args of [[-1, 1, 'netcdf'], [NaN, 1, 'netcdf'], [1, 0, 'netcdf'], [1, 1, 'unknown'], [Infinity, 1, 'netcdf']]) assert.throws(() => exportPlan(c, ...args));
  assert.throws(() => exportPlan(c, 24, 1, 'netcdf'), /256 MiB/);
  assert.throws(() => exportPlan(c, 2, 60, 'shape'), /50万/);
  assert.throws(() => exportPlan(c, 1, 3600, 'netcdf', RUNTIME_STEP_LIMIT - 1));
  assert.equal(exportPlan(c, 0, 3600, 'netcdf').steps, 0);
});
