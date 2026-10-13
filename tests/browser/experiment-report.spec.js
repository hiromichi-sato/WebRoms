import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('heat modes are exclusive and leave boundary conditions unchanged; Excel is explicit', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const c = defaults();
  c.boundary.west.mode = c.boundary.east.mode = 'periodic';
  await loadSettings(page, c);
  const before = (await readSettings(page)).boundary;
  await page.locator('[data-step="6"]').click();
  await page.locator('[data-path="heat.mode"]').selectOption('air');
  await page.locator('[data-path="heat.airTemperature"]').fill('25');
  await page.locator('[data-path="heat.airTemperature"]').press('Tab');
  await expect(page.locator('[data-path="heat.netFlux"]')).toHaveCount(0);
  await page.locator('[data-path="heat.mode"]').selectOption('flux');
  await expect(page.locator('[data-path="heat.airTemperature"]')).toHaveCount(0);
  await page.locator('[data-path="heat.netFlux"]').fill('-100');
  await page.locator('[data-path="heat.netFlux"]').press('Tab');
  const after = await readSettings(page);
  expect(after.boundary).toEqual(before);
  expect(after.heat).toMatchObject({ mode: 'flux', netFlux: -100, airTemperature: 25 });
  await page.locator('#conditionsButton').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.at(-1)?.name)).toMatch(/\.xlsx$/);
  const workbook = await page.evaluate(async () => {
    const { unzipSync, strFromU8 } = await import('/vendor/fflate.js');
    const files = unzipSync(new Uint8Array(await window.__fileWrites.at(-1).blob.arrayBuffer()));
    return strFromU8(files['xl/workbook.xml']);
  });
  expect(workbook).toContain('完全設定JSON');
  expect(errors).toEqual([]);
  const count = await page.evaluate(() => window.__fileWrites.length);
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('Cancelled', 'AbortError'); }; });
  await page.locator('#conditionsButton').click();
  await expect(page.locator('#conditionsButton')).toBeEnabled();
  expect(await page.evaluate(() => window.__fileWrites.length)).toBe(count);
});

test('result package includes actual run inputs, conditions and NetCDF records', async ({ page }) => {
  await page.goto('/');
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open' });
  Object.assign(config.numerics, { dt: 1, maxSteps: 8 });
  config.heat = { mode: 'flux', netFlux: 100 };
  const result = await page.evaluate(config => new Promise((resolve, reject) => {
    const worker = new Worker('/runtime/roms-worker.js', { type: 'module' });
    const chunks = [];
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
    worker.onmessage = async ({ data }) => {
      if (['error', 'export-error'].includes(data.type)) { worker.terminate(); reject(new Error(data.message)); }
      if (data.type === 'progress') worker.postMessage({ type: 'progress-ack' });
      if (data.type === 'complete') worker.postMessage({ type: 'export', hours: 4 / 3600, interval: 3, format: 'experiment' });
      if (data.type === 'export-chunk') { chunks.push(data.bytes); worker.postMessage({ type: 'export-chunk-ack' }); }
      if (data.type === 'export-complete') {
        worker.terminate();
        try {
          const { unzipSync, strFromU8 } = await import('/vendor/fflate.js');
          const files = unzipSync(new Uint8Array(await new Blob(chunks).arrayBuffer()));
          const excel = unzipSync(files['conditions.xlsx']);
          resolve({ names: Object.keys(files), config: JSON.parse(strFromU8(files['project.json'])),
            metadata: JSON.parse(strFromU8(files['metadata.json'])),
            workbook: strFromU8(excel['xl/workbook.xml']), signature: strFromU8(files['time_00000.nc'].slice(0, 3)) });
        } catch (error) { reject(error); }
      }
    };
    worker.postMessage({ type: 'run', config });
  }), config);
  expect(result.names).toEqual(expect.arrayContaining(['project.json', 'conditions.xlsx', 'asset-manifest.json', 'runtime-manifest.json', 'experiment.json']));
  expect(result.metadata.timesSeconds).toEqual([8, 11, 12]);
  expect(result.config).toEqual(config);
  expect(result.workbook).toContain('ROMS入力');
  expect(result.signature).toBe('CDF');
});

for (const width of [1440, 390]) test(`heat settings and save toolbar fit ${width}px viewport`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/');
  await page.locator('[data-step="6"]').click();
  await page.locator('[data-path="heat.mode"]').selectOption('air');
  await expect(page.locator('[data-path="heat.airTemperature"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  const buttons = await page.locator('.file-actions button').evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width, content: el.scrollWidth, client: el.clientWidth };
  }));
  for (const b of buttons) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(width); expect(b.content).toBeLessThanOrEqual(b.client + 1); }
  for (let i = 1; i < buttons.length; i++) expect(buttons[i].x).toBeGreaterThanOrEqual(buttons[i - 1].right);
  await page.screenshot({ path: `test-results/heat-${width}.png`, fullPage: true });
});
