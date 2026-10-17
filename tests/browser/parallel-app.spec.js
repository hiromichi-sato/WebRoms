import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { NetCDFReader } from 'netcdfjs';

function parallelConfig(model = 'physical', gls = false) {
  const c = fixture(model === 'physical' ? 'uniform' : model);
  Object.assign(c.grid, { nx: 16, ny: 16 });
  Object.assign(c.numerics, { executionMode: '4', calculateDiffusion: gls, dt: 10, maxSteps: 20 });
  c.particles = { cell: 119, count: 2, depth: 2, mode: 'depth', hours: .02, interval: 20 };
  return c;
}

// Observe real worker traffic without replacing its runtime or message handlers.
async function observeWorkers(page) {
  await page.addInitScript(() => {
    window.__executionTraffic = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          window.__executionTraffic.push({ type: data.type, execution: data.execution, step: data.step, time: data.time, message: data.message,
            ...(data.type === 'export-complete' ? { state: data.state } : {}) });
        });
      }
    };
  });
}

async function start(page, config) {
  await observeWorkers(page);
  await page.goto('/');
  await loadSettings(page, config);
  await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('[data-path="numerics.executionMode"]')).toHaveValue(config.numerics.executionMode ?? 'serial');
  await page.locator('#calculateButton').click();
}

async function messages(page) {
  return page.evaluate(() => window.__executionTraffic);
}

for (const model of ['physical', 'npzd', 'nemuro']) for (const gls of [false, true]) {
  test(`JSON to real OpenMP worker, result and saved execution: ${model}, GLS=${gls}`, async ({ page }) => {
    await start(page, parallelConfig(model, gls));
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    await expect(page.locator('#executionBadge')).toContainText('CPU 並列 4');
    await expect(page.locator('#runStateBadge')).toContainText('計算完了');
    await expect(page.locator('#iterations')).toHaveText('20');
    const traffic = await messages(page);
    expect(traffic.filter(m => m.type === 'error')).toEqual([]);
    const artifact = `openmp/${gls ? 'gls/' : ''}${model}/roms.wasm`;
    for (const type of ['execution', 'progress', 'complete']) {
      const records = traffic.filter(m => m.type === type);
      expect(records.length, type).toBeGreaterThan(0);
      for (const record of records) expect(record.execution).toMatchObject({ threads: 4, artifact });
    }
    expect((await readSettings(page)).reproducibility.lastExecution).toMatchObject({ threads: 4, artifact });
  });
}

test('parallel run shows active badge and preserves clock through stop and resume', async ({ page }) => {
  const c = parallelConfig(); c.numerics.maxSteps = 100000;
  await start(page, c);
  await expect(page.locator('#runStateBadge')).toContainText('計算中');
  await expect(page.locator('#executionBadge')).toContainText('CPU 並列 4');
  await expect(page.locator('#iterations')).not.toHaveText('0');
  await page.locator('#calculateButton').click();
  await expect(page.locator('#resumeCalculation')).toBeEnabled();
  const stopped = (await messages(page)).findLast(m => m.type === 'stopped');
  expect(stopped.execution.threads).toBe(4);
  expect(stopped.time).toBeCloseTo(stopped.step * c.numerics.dt);
  await page.locator('#resumeCalculation').click();
  await expect.poll(async () => {
    const confirmation = page.getByRole('button', { name: '計算を再開する', exact: true });
    if (await confirmation.isVisible()) await confirmation.click();
    return page.locator('#runStateBadge').textContent();
  }).toContain('計算中');
  await expect.poll(async () => (await messages(page)).filter(m => m.type === 'progress').at(-1)?.step ?? 0).toBeGreaterThan(stopped.step);
  await page.locator('#calculateButton').click();
  await expect(page.locator('#resumeCalculation')).toBeEnabled();
  const resumed = (await messages(page)).findLast(m => m.type === 'stopped');
  expect(resumed.step).toBeGreaterThan(stopped.step);
  expect(resumed.time).toBeCloseTo(resumed.step * c.numerics.dt);
  expect(resumed.execution.threads).toBe(4);
});

test('parallel additional RUN exports advancing ocean time', async ({ page }) => {
  await start(page, parallelConfig());
  await expect(page.locator('#runStateBadge')).toContainText('計算完了', { timeout: 30000 });
  await page.locator('#resultButton').click();
  await page.locator('#exportFormat').selectOption('netcdf');
  await page.locator('#exportHours').fill('0.02');
  await page.locator('#exportInterval').fill('20');
  await page.locator('#downloadResults').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.length)).toBeGreaterThan(0);
  const bytes = await page.evaluate(async () => [...new Uint8Array(await window.__fileWrites.at(-1).blob.arrayBuffer())]);
  const nc = new NetCDFReader(Uint8Array.from(bytes));
  const times = nc.getDataVariable('ocean_time');
  expect(times[0]).toBe(200);
  expect(times.at(-1)).toBeGreaterThan(200);
  await expect(page.locator('#executionBadge')).toContainText('CPU 並列 4');
  expect((await messages(page)).filter(m => m.type === 'error')).toEqual([]);
});

for (const model of ['physical', 'npzd', 'nemuro']) for (const gls of [false, true]) {
test(`parallel ocean checkpoints branch to serial particles and retain primary time: ${model}, GLS=${gls}`, async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.url().endsWith('.wasm')) requests.push(new URL(request.url()).pathname); });
  const c = parallelConfig(model, gls);
  c.initial.distribution = 'stratified';
  c.numerics.windX = 0.02;
  await start(page, c);
  await expect(page.locator('#runStateBadge')).toContainText('計算完了');
  const primaryTime = await page.locator('#modelTime').textContent();
  const capturePrimary = async () => {
    const count = (await messages(page)).filter(m => m.type === 'export-complete').length;
    await page.locator('#resultButton').click();
    await page.locator('#exportFormat').selectOption('netcdf');
    await page.locator('#exportHours').fill('0');
    await page.locator('#downloadResults').click();
    await expect.poll(async () => (await messages(page)).filter(m => m.type === 'export-complete').length).toBe(count + 1);
    await expect(page.locator('#downloadResults')).toBeEnabled();
    await page.locator('#resultsDialog').evaluate(dialog => dialog.close());
    return (await messages(page)).findLast(m => m.type === 'export-complete');
  };
  const before = await capturePrimary();
  expect(before.state).toBeDefined();
  await page.locator('#nextButton').click();
  const outputs = [];
  for (let i = 0; i < 2; i++) {
    await page.locator('#particleRun').click();
    await expect(page.locator('#particleStatus')).toContainText('追跡が完了');
    await page.locator('#particleDownload').click();
    await expect.poll(() => page.evaluate(() => window.__fileWrites.filter(f => f.name === 'webroms-particles.nc').length)).toBe(i + 1);
    const bytes = await page.evaluate(async () => [...new Uint8Array(await window.__fileWrites.filter(f => f.name === 'webroms-particles.nc').at(-1).blob.arrayBuffer())]);
    outputs.push(new NetCDFReader(Uint8Array.from(bytes)));
  }
  const parallelArtifact = `openmp/${gls ? 'gls/' : ''}${model}/roms.wasm`;
  const serialArtifact = gls ? `gls/${model}/roms.wasm` : model === 'physical' ? 'roms.wasm' : `${model}/roms.wasm`;
  expect(requests).toContain(`/runtime/${parallelArtifact}`);
  expect(requests).toContain(`/runtime/${serialArtifact}`);
  expect(before.execution).toMatchObject({ threads: 4, artifact: parallelArtifact });
  for (const variable of ['ocean_time', 'grid_x', 'grid_y']) expect(outputs[1].getDataVariable(variable)).toEqual(outputs[0].getDataVariable(variable));
  expect(outputs[0].getDataVariable('ocean_time')[0]).toBe(200);
  const plan = JSON.parse(outputs[0].globalAttributes.find(a => a.name === 'experiment_config').value);
  expect(plan.startMethod).toContain('PERFECT_RESTART');
  await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('#modelTime')).toHaveText(primaryTime);
  const after = await capturePrimary();
  expect(after.step).toBe(before.step);
  expect(after.time).toBe(before.time);
  expect(after.state).toEqual(before.state);
  expect(after.execution).toMatchObject({ threads: 4, artifact: parallelArtifact });
  await expect(page.locator('#executionBadge')).toContainText('CPU 並列 4');
  expect((await messages(page)).filter(m => m.type === 'error')).toEqual([]);
});
}

test('without isolation real worker falls back to serial', async ({ page }) => {
  await page.route('**/*', async route => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['cross-origin-opener-policy'];
    delete headers['cross-origin-embedder-policy'];
    await route.fulfill({ response, headers });
  });
  await start(page, parallelConfig());
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await expect(page.locator('#runStateBadge')).toContainText('計算完了');
  await expect(page.locator('#executionBadge')).toContainText('CPU 直列');
  expect((await messages(page)).find(m => m.type === 'execution').execution).toMatchObject({ requested: '4', threads: 1, artifact: 'roms.wasm' });
});

test('legacy JSON runs serial even on an isolated capable browser', async ({ page }) => {
  const c = parallelConfig(); delete c.numerics.executionMode;
  await start(page, c);
  await expect(page.locator('#runStateBadge')).toContainText('計算完了');
  await expect(page.locator('#executionBadge')).toContainText('CPU 直列');
  expect((await messages(page)).find(m => m.type === 'execution').execution).toMatchObject({ requested: 'serial', threads: 1, artifact: 'roms.wasm' });
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`CPU selector and badge screenshot at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await start(page, parallelConfig());
    await expect(page.locator('#runStateBadge')).toContainText('計算完了');
    await expect(page.locator('#executionBadge')).toHaveText('CPU 並列 4');
    const selector = page.locator('[data-path="numerics.executionMode"]');
    await expect(selector).toHaveValue('4');
    await selector.scrollIntoViewIfNeeded();
    const path = testInfo.outputPath(`cpu-selector-badge-${viewport.width}.png`);
    await page.screenshot({ path, fullPage: true });
    await testInfo.attach('CPU selector and badge', { path, contentType: 'image/png' });
    if (viewport.width < 700) {
      await selector.evaluate(element => element.scrollIntoView({ block: 'center' }));
      const selectorPath = testInfo.outputPath(`cpu-selector-${viewport.width}.png`);
      await page.screenshot({ path: selectorPath });
      await testInfo.attach('Mobile CPU selector', { path: selectorPath, contentType: 'image/png' });
    }
  });
}
