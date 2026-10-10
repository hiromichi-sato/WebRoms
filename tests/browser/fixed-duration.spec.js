import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

for (const model of ['physical', 'npzd', 'nemuro']) test(`${model} runs all requested steps even with legacy convergence settings`, async ({ page }) => {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, nz: 3, preset: 'open' });
  Object.assign(config.ecosystem, { enabled: model !== 'physical', model: model === 'physical' ? 'npzd' : model });
  Object.assign(config.numerics, { dt: 1, maxSteps: 8, outputInterval: 3, tolerance: .1, steadyWindow: 2 });
  for (const boundary of Object.values(config.boundary)) boundary.mode = 'closed';
  config.initial.distribution = 'uniform';
  await page.goto('/');
  const run = await page.evaluate(config => new Promise((resolve, reject) => {
    const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
    const records = [], progress = [];
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'record') records.push(data.time);
      if (data.type === 'progress') progress.push({ step: data.step, residual: 'residual' in data, stable: 'stable' in data });
      if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
      if (data.type === 'complete') { worker.terminate(); resolve({ complete: data, records, progress }); }
    };
    worker.postMessage({ type: 'run', config });
  }), config);
  expect(run.complete.step).toBe(8);
  expect(run.complete).not.toHaveProperty('converged');
  expect(run.records).toEqual([]);
  expect(run.progress.every(p => !p.residual && !p.stable)).toBe(true);
  await loadSettings(page, config); await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('[data-path="numerics.tolerance"], [data-path="numerics.steadyWindow"], #residual')).toHaveCount(0);
  await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('完了');
  await expect(page.locator('#iterations')).toHaveText('8');
  await expect(page.locator('#phaseText')).toHaveText('計算完了');
  const saved = (await readSettings(page)).numerics;
  expect(saved).not.toHaveProperty('tolerance'); expect(saved).not.toHaveProperty('steadyWindow');
  if (model === 'physical') await page.screenshot({ path: 'test-results/fixed-duration.png', fullPage: true });
});
