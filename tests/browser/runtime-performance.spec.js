import { test, expect } from './app-fixture.js';
import { fixture, runCase } from '../runtime-helper.mjs';
import { execFileSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

test('worker pacing and transfers preserve final doubles and quantify old versus new overhead', async ({ page }) => {
  test.setTimeout(120000);
  const old = path => execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
  const baseline = old('runtime/roms-worker.js').replace('../src/runtime-state.js', '../src/runtime-state.js?baseline').replace('../src/recent-series.js', '../src/recent-series.js?baseline');
  const hasLegacyBaseline = !baseline.includes('new RunPacing');
  await page.route('**/runtime/performance-baseline.js', route => route.fulfill({ contentType: 'text/javascript', body: baseline }));
  await page.route('**/src/runtime-state.js?baseline', route => route.fulfill({ contentType: 'text/javascript', body: old('src/runtime-state.js') }));
  await page.route('**/src/recent-series.js?baseline', route => route.fulfill({ contentType: 'text/javascript', body: old('src/recent-series.js') }));
  await page.goto('/');
  const config = fixture('coast'); Object.assign(config.grid, { nx: 24, ny: 24, nz: 3 });
  Object.assign(config.numerics, { dt: 1, maxSteps: 200 });
  const reference = await runCase(config);
  const reports = []; let browserReference;
  for (const name of hasLegacyBaseline ? ['performance-baseline', 'roms-worker'] : ['roms-worker']) {
    const report = await page.evaluate(({ name, config }) => new Promise((resolve, reject) => {
      const worker = new Worker(`/runtime/${name}.js`, { type: 'module' }), start = performance.now();
      let updates = 0, bytes = 0, singlePrecision = true, hasStatic = false;
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('Worker timeout')); }, 60000);
      worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'progress') {
          updates++; singlePrecision &&= data.state.temp instanceof Float32Array; hasStatic ||= !!data.state.h;
          for (const a of Object.values(data.state)) bytes += ArrayBuffer.isView(a) ? a.byteLength : Object.values(a).reduce((s, v) => s + v.byteLength, 0);
          worker.postMessage({ type: 'progress-ack' });
        }
        if (data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(new Error(data.message)); }
        if (data.type === 'complete') {
          clearTimeout(timer); worker.terminate();
          resolve({ name, wallMs: performance.now() - start, updates, bytes, singlePrecision, hasStatic, doubleFinal: data.state.temp instanceof Float64Array, state: Object.fromEntries(['temp', 'salt', 'zeta', 'u', 'v'].map(key => [key, [...data.state[key]]])), timing: data.performance });
        }
      };
      worker.postMessage({ type: 'run', config });
    }), { name, config });
    let maxDifference = 0, maxScaledDifference = 0;
    for (const [key, values] of Object.entries(report.state)) for (let i = 0; i < values.length; i++) {
      const difference = Math.abs(values[i] - reference.state[key][i]);
      maxDifference = Math.max(maxDifference, difference);
      maxScaledDifference = Math.max(maxScaledDifference, difference / Math.max(1, Math.abs(reference.state[key][i])));
    }
    expect(maxScaledDifference).toBeLessThan(1e-12);
    report.maxDifferenceFromNode = maxDifference;
    if (browserReference) expect(report.state).toEqual(browserReference);
    else browserReference = report.state;
    delete report.state; reports.push(report);
  }
  const current = reports.at(-1);
  expect(current.doubleFinal).toBe(true); expect(current.singlePrecision).toBe(true);
  expect(current.hasStatic).toBe(false);
  if (hasLegacyBaseline) {
    expect(current.bytes).toBeLessThan(reports[0].bytes);
    expect(current.updates).toBeLessThan(reports[0].updates);
  }
  await mkdir('.tools/performance', { recursive: true });
  await writeFile('.tools/performance/worker-comparison.json', JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
});
