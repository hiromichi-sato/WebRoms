import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

function config() {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40, geoBounds: { west: 135, east: 135.1, south: 34, north: 34.1 } });
  Object.assign(c.numerics, { dt: 1, maxSteps: 8 });
  return c;
}
test('bundled MDT applies offline, exports fill provenance and runs in ROMS', async ({ page }) => {
  const c = config(); c.grid.preset = 'osaka'; c.grid.geoBounds = null;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="3"]').click();
  await page.getByLabel('潮汐を設定', { exact: true }).uncheck();
  await page.getByLabel('海面高度を設定', { exact: true }).check();
  await expect(page.locator('#toast')).toContainText('MDTを適用しました');
  const saved = await readSettings(page);
  expect(saved.ocean.seaLevel.source).toBe('HYBRID_MDT_CNES_CLS22_CMEMS2020');
  expect(Object.values(saved.initial.painted.zeta[0]).some(v => v > .1)).toBe(true);
  await page.locator('#seaLevelNetcdf').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.length)).toBe(2);
  const provenance = await page.evaluate(async () => {
    const { NetCDFReader } = await import('/vendor/netcdf-reader.js');
    const r = new NetCDFReader(await window.__fileWrites.at(-1).blob.arrayBuffer());
    return r.variables.find(v => v.name === 'mdt_fill_status').attributes.find(a => a.name === 'processing').value;
  });
  expect(provenance).toContain('Steady diffusion');
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('完了');
  expect(errors).toEqual([]);
});
test('geographic initial fields export and import, tide availability and correction validation are visible', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await loadSettings(page, config());
  await page.locator('[data-step="2"]').click();
  await page.locator('#initialNetcdfExport').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.length)).toBe(1);
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.__fileWrites[0].blob.arrayBuffer())));
  await page.locator('#initialNetcdfImport').setInputFiles({ name: 'initial.nc', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await expect(page.locator('#toast')).toContainText('補間しました');
  await page.locator('[data-step="3"]').click();
  await expect(page.locator('#oceanStatus')).toContainText('ダミー');
  await expect(page.locator('#tideStation')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ocean-boundary-desktop.png', fullPage: true });
  await page.getByLabel('潮汐を設定', { exact: true }).uncheck();
  await expect(page.locator('#tideImport')).toBeDisabled();
  await expect(page.locator('#seaLevelImport')).toBeDisabled();
  await expect(page.locator('#averageBoundary')).toHaveCount(0);
  await page.getByText('高度な設定：潮位の補正', { exact: true }).click();
  await expect(page.locator('#applyCorrection')).toBeDisabled();
  await page.getByLabel('海面高度を設定', { exact: true }).check();
  await expect(page.locator('#seaLevelImport')).toBeEnabled();
  await page.getByText('高度な設定：潮位の補正', { exact: true }).click();
  await page.locator('#correctionValues').fill('2026-01-01T00:00:00Z,99999\n2026-01-01T01:00:00Z,99999');
  await page.locator('#applyCorrection').click();
  await expect(page.locator('#toast')).toContainText('許容幅');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/ocean-boundary-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('streamed NetCDF ZIP has complete files and explicit save destination', async ({ page }) => {
  const c = config(); c.ocean = { tideMode: 'off', startUtc: '2026-01-01T00:00:00Z', corrections: [] };
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('完了');
  await page.locator('#resultButton').click();
  await page.locator('#exportFormat').selectOption('netcdf-series');
  await page.locator('#exportHours').fill(String(4 / 3600));
  await page.locator('#exportInterval').fill('2');
  await page.locator('#downloadResults').click();
  await expect(page.locator('#exportSummary')).toContainText('保存先：webroms-results.zip');
  await expect.poll(() => page.evaluate(() => window.__fileWrites.length)).toBe(1);
  const summary = await page.evaluate(async () => {
    const { unzipSync } = await import('/vendor/fflate.js');
    const { NetCDFReader } = await import('/vendor/netcdf-reader.js');
    const files = unzipSync(new Uint8Array(await window.__fileWrites[0].blob.arrayBuffer()));
    return Object.entries(files).filter(([name]) => name.endsWith('.nc')).map(([name, bytes]) => ({ name, time: new NetCDFReader(bytes).getDataVariable('ocean_time')[0] }));
  });
  expect(summary.map(s => s.time)).toEqual([8, 10, 12]);
});
test('prepared tide package drives retained browser runtime and keeps phase through export', async ({ page }) => {
  const c = config(); c.numerics.maxSteps = 20;
  await page.goto('/');
  const output = await page.evaluate(async c => {
    const { buildFields } = await import('/src/model.js');
    const { tideRequest, ensureOcean } = await import('/src/ocean-boundary.js');
    const o = ensureOcean(c), request = tideRequest(c, buildFields(c));
    for (const b of Object.values(c.boundary)) b.mode = 'open';
    o.tides = { format: 'webroms-tides-v1', gridSignature: request.gridSignature, epoch: o.startUtc, kind: 'ocean-tide', unit: 'm', source: 'SYNTHETIC TEST ONLY', times: [0, 1800, 3600], points: request.points.map(p => ({ ...p, height: [0, .1, 0] })) };
    return new Promise((resolve, reject) => {
      const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
      worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'error' || data.type === 'export-error') { worker.terminate(); reject(new Error(data.message)); }
        if (data.type === 'complete') worker.postMessage({ type: 'export', hours: 20 / 3600, interval: 10, format: 'netcdf' });
        if (data.type === 'export-complete') { worker.terminate(); resolve({ time: data.time, start: data.start, count: data.count, surface: Math.max(...data.state.zeta.map(Math.abs)) }); }
      };
      worker.postMessage({ type: 'run', config: c });
    });
  }, c);
  expect(output.time).toBe(40); expect(output.start).toBe(20); expect(output.count).toBe(3); expect(output.surface).toBeGreaterThan(1e-8);
});
