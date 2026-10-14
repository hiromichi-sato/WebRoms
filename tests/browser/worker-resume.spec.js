import { test, expect } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

for (const model of ['physical', 'npzd', 'gls']) test(`paused worker resumes identical ocean and tide clock: ${model}`, async ({ page }) => {
  await page.goto('/');
  const config = fixture(model === 'npzd' ? 'npzd' : 'uniform');
  config.numerics.maxSteps = 40; config.numerics.dt = 10;
  config.numerics.calculateDiffusion = model === 'gls';
  config.grid.geoBounds = { west: 135, east: 136, south: 34, north: 35 };
  for (const b of Object.values(config.boundary)) b.mode = 'specified';
  config.ocean = { tideMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 1, seaLevelEnabled: false };
  const result = await page.evaluate(async config => {
    const integrate = paused => new Promise((resolve, reject) => {
      const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
      let requested = false, pausedAt;
      worker.onerror = error => { worker.terminate(); reject(new Error(error.message)); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
        if (data.type === 'progress') {
          worker.postMessage({ type: 'progress-ack' });
          if (paused && !requested) { requested = true; worker.postMessage({ type: 'cancel-run' }); }
        }
        if (data.type === 'stopped') { pausedAt = { step: data.step, time: data.time }; worker.postMessage({ type: 'resume' }); }
        if (data.type === 'complete') { worker.terminate(); resolve({ ...data, pausedAt }); }
      };
      worker.postMessage({ type: 'run', config });
    });
    const baseline = await integrate(false), resumed = await integrate(true);
    let maxError = 0;
    const compare = (a, b) => { for (const key of Object.keys(a)) if (key === 'biology') compare(a[key], b[key]); else for (let i = 0; i < a[key].length; i++) maxError = Math.max(maxError, Math.abs(a[key][i] - b[key][i])); };
    compare(baseline.state, resumed.state);
    return { maxError, stopped: resumed.pausedAt, step: resumed.step, time: resumed.time, referenceTime: baseline.time };
  }, config);
  expect(result.stopped.step).toBeGreaterThan(0); expect(result.stopped.step).toBeLessThan(40);
  expect(result.stopped.time).toBe(result.stopped.step * 10);
  expect(result.step).toBe(40); expect(result.time).toBe(result.referenceTime); expect(result.maxError).toBe(0);
});
