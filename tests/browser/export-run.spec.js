import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults, resizeLayers } from '../../src/model.js';
import { fieldSizes } from '../../src/runtime-state.js';

test('normal integration exceeds the former archive budget without any history records', async ({ page }) => {
  const config = defaults(); Object.assign(config.grid, { nx: 24, ny: 24, preset: 'open' }); resizeLayers(config, 15);
  Object.assign(config.numerics, { dt: 1, maxSteps: 400, outputInterval: 1 });
  for (const boundary of Object.values(config.boundary)) boundary.mode = 'closed';
  const previousArchiveSize = Object.values(fieldSizes(config.grid)).reduce((sum, size) => sum + size * 8, 0) * config.numerics.maxSteps;
  expect(previousArchiveSize).toBeGreaterThan(128e6);
  await page.goto('/');
  const result = await page.evaluate(config => new Promise((resolve, reject) => {
    const worker = new Worker('/runtime/roms-worker.js', { type: 'module' }); let records = 0, updates = 0;
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
    worker.onmessage = ({ data }) => {
      if (data.type === 'record') records++;
      if (data.type === 'progress') updates++;
      if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
      if (data.type === 'complete') { worker.terminate(); resolve({ records, updates, step: data.step }); }
    };
    worker.postMessage({ type: 'run', config });
  }), config);
  expect(result.records).toBe(0); expect(result.step).toBe(400);
  // A slow display that never acknowledges receives only the first and final states.
  expect(result.updates).toBe(2);
});

for (const model of ['physical', 'npzd', 'nemuro']) test(`${model} retained state continues identically to uninterrupted integration`, async ({ page }) => {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, nz: 3, preset: 'open' });
  Object.assign(config.ecosystem, { enabled: model !== 'physical', model: model === 'physical' ? 'npzd' : model });
  Object.assign(config.numerics, { dt: 1, maxSteps: 8 });
  for (const boundary of Object.values(config.boundary)) boundary.mode = 'closed';
  await page.goto('/');
  const output = await page.evaluate(async config => {
    const execute = (config, extra) => new Promise((resolve, reject) => {
      const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
      let state, records = 0;
      const done = (data, state) => {
        worker.terminate();
        const flat = { ...state, ...state.biology }; delete flat.biology;
        resolve({ time: data.time, step: data.step, count: data.count, records, state: Object.fromEntries(Object.entries(flat).map(([key, values]) => [key, Array.from(values)])) });
      };
      worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'record') records++;
        if (data.type === 'progress') { state = data.state; worker.postMessage({ type: 'progress-ack' }); }
        if (data.type === 'error' || data.type === 'export-error') { worker.terminate(); reject(new Error(data.message)); }
        if (data.type === 'complete') {
          if (extra) worker.postMessage({ type: 'export', hours: 4 / 3600, interval: 3, format: 'netcdf' });
          else done(data, state);
        }
        if (data.type === 'export-complete') done(data, data.state);
      };
      worker.postMessage({ type: 'run', config });
    });
    const continued = await execute(config, true);
    config.numerics.maxSteps = 12;
    return { continued, continuous: await execute(config, false) };
  }, config);
  expect(output.continued.records).toBe(0);
  expect(output.continued.count).toBe(3);
  expect(output.continued.time).toBe(12);
  expect(output.continued.step).toBe(12);
  expect(output.continued.state).toEqual(output.continuous.state);
});

test('export rejection preserves the completed run; cancellation and subsequent export work', async ({ page }) => {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open' }); Object.assign(config.numerics, { dt: 1, maxSteps: 8 });
  await page.goto('/');
  const result = await page.evaluate(config => new Promise((resolve, reject) => {
    const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
    let rejected, cancelled;
    worker.onmessage = ({ data }) => {
      if (data.type === 'error') { worker.terminate(); reject(new Error(data.message)); }
      if (data.type === 'complete') worker.postMessage({ type: 'export', hours: -1, interval: 2, format: 'netcdf' });
      if (data.type === 'export-error') {
        if (rejected) { worker.terminate(); reject(new Error(data.message)); return; }
        rejected = { time: data.time, ready: data.ready };
        worker.postMessage({ type: 'export', hours: 100 / 3600, interval: 10, format: 'netcdf' });
      }
      if (data.type === 'export-progress') worker.postMessage({ type: 'cancel-export' });
      if (data.type === 'export-cancelled') {
        cancelled = data.time;
        worker.postMessage({ type: 'export', hours: 0, interval: 1, format: 'netcdf' });
      }
      if (data.type === 'export-complete') { worker.terminate(); resolve({ rejected, cancelled, end: data.time, count: data.count, signature: String.fromCharCode(...data.bytes.slice(0, 3)) }); }
    };
    worker.postMessage({ type: 'run', config });
  }), config);
  expect(result.rejected).toEqual({ time: 8, ready: true });
  expect(result.cancelled).toBeGreaterThan(8); expect(result.cancelled).toBeLessThan(108);
  expect(result.end).toBe(result.cancelled); expect(result.count).toBe(1); expect(result.signature).toBe('CDF');
});
