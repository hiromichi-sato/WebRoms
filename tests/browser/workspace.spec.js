import { test, expect } from '@playwright/test';
import { defaults, resizeLayers } from '../../src/model.js';
import { readFile } from 'node:fs/promises';

async function seed(page, changes = () => {}) {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 60, maxDepth: 60 });
  config.initial.distribution = 'uniform';
  changes(config);
  await page.goto('/');
  await page.evaluate(config => localStorage.setItem('webroms.project.v1', JSON.stringify(config)), config);
  await page.reload();
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('webroms.project.v1')));
async function scenePixels(page, selector) {
  const colors = await page.locator(selector).evaluate(source => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 100;
    const context = canvas.getContext('2d'); context.drawImage(source, 0, 0, 120, 100);
    const pixels = context.getImageData(0, 0, 120, 100).data, unique = new Set();
    for (let p = 0; p < pixels.length; p += 4) unique.add(pixels[p] + ',' + pixels[p + 1] + ',' + pixels[p + 2]);
    return unique.size;
  });
  expect(colors).toBeGreaterThan(10);
}
async function clickCenter(page, selector, x = 0.5, y = 0.5) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
}

test('calculation action stays above Back while settings scroll', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await seed(page);
    await page.locator('[data-step="6"]').click();
    const calculate = page.locator('.step-actions #calculateButton');
    await expect(calculate).toHaveCount(1);
    await expect(calculate).toBeInViewport();
    const before = await calculate.boundingBox();
    await page.locator('#settingsForm').evaluate(form => { form.scrollTop = form.scrollHeight; });
    if (viewport.width < 1001) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const after = await calculate.boundingBox();
    const back = await page.locator('#previousButton').boundingBox();
    expect(Math.abs(before.y - after.y)).toBeLessThan(1);
    expect(after.y + after.height).toBeLessThanOrEqual(back.y);
    await expect(page.locator('#previousButton')).toBeInViewport();
    await page.screenshot({ path: `test-results/calculation-actions-${viewport.width}.png`, fullPage: true });
    await page.locator('#previousButton').click();
    await expect(page.locator('#calculateButton')).toHaveCount(0);
    await page.locator('[data-step="6"]').click();
    await expect(calculate).toHaveCount(1);
  }
});

test('direct files show launcher guidance', async ({ page }) => {
  await page.goto(new URL('../../dist/index.html', import.meta.url).href);
  await expect(page.locator('#startupError')).toBeVisible();
  await expect(page.locator('#startupError')).toContainText('start-webroms.bat');
});

test('seven steps, 15 layers, terrain blocks and history reset to inspect', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.steps [data-step]')).toHaveCount(7);
  await page.getByLabel('鉛直層数').fill('15'); await page.getByLabel('鉛直層数').blur();
  await expect(page.locator('#layerMetric')).toHaveText('15 層');
  await page.locator('[data-view="map"]').click();
  await page.locator('#brush').selectOption('fill');
  await clickCenter(page, '#mapCanvas');
  const edited = (await saved(page)).grid.edits;
  expect(Object.values(edited)).toEqual([56]);
  await page.locator('#undoTerrain').click(); expect((await saved(page)).grid.edits).toEqual({});
  await page.locator('#redoTerrain').click(); expect((await saved(page)).grid.edits).toEqual(edited);
  await page.getByLabel('X格子数').fill('10'); await page.getByLabel('X格子数').blur();
  await expect(page.locator('#brush')).toHaveValue('inspect');
  await expect(page.locator('#paintDepth')).toHaveCount(0);
  await page.getByLabel('地形の種類').selectOption('south-pacific');
  await expect(page.getByLabel('最大水深')).toHaveValue('5000');
  await page.locator('[data-step="2"]').click();
  await expect(page.getByLabel('初期分布').locator('option[value="summer"]')).toHaveCount(0);
});

test('ecosystem diagrams, actual light parameters, skip, and concentration units', async ({ page }) => {
  await seed(page);
  await page.locator('[data-step="1"]').click();
  await page.getByLabel('生態系の計算').selectOption('true');
  await expect(page.locator('.eco-lesson-diagram svg')).toBeVisible();
  await page.locator('button[data-eco-topic="U"]').click();
  await expect(page.locator('[data-eco-explanation]')).toContainText('exp');
  const prior = await page.locator('[data-eco-chart]').innerText();
  await page.locator('input[type="range"][data-eco-param="K_ext"]').evaluate(input => { input.value = '0.12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  expect((await saved(page)).ecosystem.parameters.npzd.K_ext).toBe(0.12);
  expect(await page.locator('[data-eco-chart]').innerText()).not.toEqual(prior);
  await page.screenshot({ path: 'test-results/ecosystem-desktop.png', fullPage: true });
  await page.locator('[data-step="2"]').click();
  await expect(page.locator('.mass-equivalent').first()).toContainText('mg N');
  await expect(page.locator('.eco-parameters')).toHaveCount(0);
  await page.locator('[data-step="1"]').click();
  await page.locator('#skipEcosystem').click();
  await expect(page.locator('#stepTitle')).toHaveText('初期条件');
  expect((await saved(page)).ecosystem.enabled).toBe(false);
});

test('initial companion section, inspect mode, painting history and advanced settings', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await seed(page);
  await page.locator('[data-step="2"]').click();
  await expect(page.locator('#initialBrush')).toHaveValue('inspect');
  await expect(page.locator('#threeView canvas')).toBeVisible();
  await expect(page.locator('#sectionCanvas')).toBeVisible();
  await scenePixels(page, '#threeView canvas'); await scenePixels(page, '#sectionCanvas');
  await expect(page.getByLabel('海面高度', { exact: true })).not.toBeVisible();
  await page.getByLabel('初期分布').selectOption('summer');
  await expect(page.getByRole('slider', { name: '混合の強さ' })).toBeVisible();
  await page.getByLabel('初期分布').selectOption('gradient-y');
  await expect(page.getByLabel('北端 − 南端 水温差')).toBeVisible();
  await expect(page.getByRole('slider', { name: '混合の強さ' })).toHaveCount(0);
  await page.locator('#initialBrush').selectOption('paint'); await page.locator('#editValue').fill('23'); await page.locator('#editValue').blur();
  await clickCenter(page, '#sectionCanvas', 0.5, 0.4);
  expect(Object.keys((await saved(page)).initial.painted.temp ?? {})).not.toHaveLength(0);
  await page.locator('#undoInitial').click(); expect((await saved(page)).initial.painted).toEqual({});
  await page.locator('#redoInitial').click(); expect((await saved(page)).initial.painted.temp).toBeDefined();
  await page.screenshot({ path: 'test-results/initial-dual-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await scenePixels(page, '#threeView canvas'); await scenePixels(page, '#sectionCanvas');
  await page.screenshot({ path: 'test-results/initial-dual-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('river positions and initial concentrations persist; boundary face is paired with 3D', async ({ page }) => {
  await seed(page, config => { config.ecosystem.enabled = true; config.grid.edits[36] = 0; });
  await page.locator('[data-view="map"]').click(); await page.locator('#riverBrush').selectOption('river-add');
  const box = await page.locator('#mapCanvas').boundingBox(), size = Math.min(box.width - 104, box.height - 104);
  await page.mouse.click(box.x + box.width / 2 + size / 16, box.y + box.height / 2 - size / 16);
  expect((await saved(page)).rivers).toHaveLength(1);
  await page.locator('[data-step="4"]').click();
  await page.getByLabel('河川水温').fill('15'); await page.getByLabel('河川水温').blur();
  expect((await saved(page)).rivers[0].temp).toBe(15);
  await page.locator('[data-step="3"]').click(); await page.getByLabel('境界形式').selectOption('specified');
  await expect(page.locator('#threeView canvas')).toBeVisible(); await expect(page.locator('#sectionCanvas')).toBeVisible();
  await page.locator('#editValue').fill('24'); await page.locator('#editValue').blur();
  await clickCenter(page, '#sectionCanvas', 0.5, 0.4);
  expect((await saved(page)).boundary.west.painted.temp).toBeDefined();
  await expect(page.getByLabel('海面高度', { exact: true })).not.toBeVisible();
  await expect(page.locator('#editValueEnd')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/boundary-dual-desktop.png', fullPage: true });
  await page.reload(); expect((await saved(page)).rivers[0].temp).toBe(15);
});

test('bundled NOAA climatology applies offline and survives reload', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await seed(page);
  await page.locator('[data-step="2"]').click();
  await page.getByLabel('初期分布').selectOption('climatology');
  await expect(page.locator('#climatePreset option')).not.toHaveCount(0);
  await page.locator('#applyClimate').click();
  await expect(page.locator('#toast')).toContainText('気候値を初期場に反映');
  const config = await saved(page);
  expect(config.climatology.product).toContain('NOAA');
  expect(config.initial.painted.temp).toBeDefined();
  await page.locator('#undoInitial').click();
  expect((await saved(page)).climatology).toBeUndefined();
  expect((await saved(page)).initial.painted).toEqual({});
  await page.locator('#redoInitial').click();
  expect((await saved(page)).climatology.id).toBe(config.climatology.id);
  await page.reload(); expect((await saved(page)).climatology.id).toBe(config.climatology.id);
});

for (const model of ['physical', 'npzd', 'nemuro']) test('15-layer browser runs ' + model + ' and exports results', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await seed(page, config => {
    resizeLayers(config, 15);
    Object.assign(config.ecosystem, { enabled: model !== 'physical', model: model === 'physical' ? 'npzd' : model });
    Object.assign(config.numerics, { dt: 10, maxSteps: 30, steadyWindow: 5, tolerance: 1e-12 });
  });
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#runLog')).toContainText('ROMS: DONE', { timeout: 60000 });
  await page.locator('#resultButton').click();
  const downloading = page.waitForEvent('download'); await page.locator('#downloadResults').click();
  const download = await downloading, path = 'test-results/' + model + '-15layer-results.nc';
  await download.saveAs(path); const bytes = await readFile(path);
  expect(bytes.subarray(0, 3).toString()).toBe('CDF'); expect(bytes.length).toBeGreaterThan(8 * 8 * 15 * 8);
  await page.locator('#closeResults').click();
  await scenePixels(page, '#threeView canvas');
  expect(errors).toEqual([]);
});

test('camera moves and the terrain scene fits mobile', async ({ page }) => {
  await page.goto('/'); await scenePixels(page, '#threeView canvas');
  const before = await page.locator('#threeView canvas').evaluate(canvas => canvas.toDataURL());
  await page.locator('#zoomIn').click();
  expect(await page.locator('#threeView canvas').evaluate(canvas => canvas.toDataURL())).not.toEqual(before);
  await page.screenshot({ path: 'test-results/terrain-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/terrain-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('ETOPO presets render offline with recognizable coastlines on desktop and mobile', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await seed(page, config => { config.grid.nx = 64; config.grid.ny = 64; });
  await page.locator('[data-view="map"]').click();
  for (const id of ['osaka', 'tokyo', 'ise', 'japan', 'california', 'north-pacific', 'south-pacific', 'north-atlantic', 'south-atlantic']) {
    await page.getByLabel('地形の種類').selectOption(id);
    await expect(page.locator('.source-note').first()).toContainText('NOAA ETOPO 2022');
    await scenePixels(page, '#mapCanvas');
    if (['osaka', 'tokyo', 'ise'].includes(id)) await page.screenshot({ path: `test-results/etopo-${id}.png`, fullPage: true });
  }
  await page.getByLabel('地形の種類').selectOption('japan');
  await page.locator('[data-view="3d"]').click();
  await scenePixels(page, '#threeView canvas');
  await page.screenshot({ path: 'test-results/etopo-japan-3d.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await scenePixels(page, '#threeView canvas');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/etopo-mobile.png', fullPage: true });
});

test('wind is explicit, editable by cell, offline NOAA climates and history persist', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await seed(page);
  await page.locator('.steps [data-step="5"]').click();
  await expect(page.locator('#stepTitle')).toHaveText('風の強制力');
  await expect(page.locator('#windBrush')).toHaveValue('inspect');
  await page.getByRole('slider', { name: '風の強さ' }).fill('8');
  expect((await saved(page)).wind.speed).toBe(8);
  await page.getByLabel('吹いていく向き（北0°・東90°）').fill('90'); await page.getByLabel('吹いていく向き（北0°・東90°）').blur();
  await scenePixels(page, '#windCanvas');
  await page.locator('#windBrush').selectOption('paint');
  await page.locator('#windEditU').fill('-3'); await page.locator('#windEditU').blur();
  await page.locator('#windEditV').fill('4'); await page.locator('#windEditV').blur();
  await clickCenter(page, '#windCanvas');
  const edits = (await saved(page)).wind.edits;
  expect(Object.keys(edits)).toHaveLength(1); expect(Object.values(edits)[0]).toEqual({ u: -3, v: 4 });
  await expect(page.locator('#windCellValue')).toContainText('U=-3.00');
  await page.locator('#undoWind').click(); expect((await saved(page)).wind.edits).toEqual({});
  await page.locator('#redoWind').click(); expect((await saved(page)).wind.edits).toEqual(edits);
  await page.screenshot({ path: 'test-results/wind-edit-desktop.png', fullPage: true });
  await page.reload(); await page.locator('.steps [data-step="5"]').click(); expect((await saved(page)).wind.edits).toEqual(edits);
  await page.getByLabel('風の分布', { exact: true }).selectOption('climatology');
  await expect(page.locator('#windBrush')).toHaveValue('inspect');
  const annual = await page.locator('#windCanvas').evaluate(c => c.toDataURL());
  for (const id of ['JJA', 'DJF', 'elnino', 'lanina']) {
    await page.getByLabel('風の気候値').selectOption(id);
    await scenePixels(page, '#windCanvas');
    expect(await page.locator('#windCanvas').evaluate(c => c.toDataURL())).not.toEqual(annual);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/wind-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('section location lines follow initial and running views; rotation derives from latitude', async ({ page }) => {
  await seed(page, c => { resizeLayers(c, 15); Object.assign(c.numerics, { maxSteps: 30, steadyWindow: 5 }); });
  await page.locator('.steps [data-step="2"]').click();
  await page.getByLabel('初期分布').selectOption('summer');
  const before = await page.locator('#sectionCanvas').evaluate(c => c.toDataURL());
  await page.getByRole('slider', { name: '混合の強さ' }).fill('0.6');
  expect(await page.locator('#sectionCanvas').evaluate(c => c.toDataURL())).not.toEqual(before);
  await page.locator('#sliceRow').fill('3');
  await expect(page.locator('#threeView')).toHaveAttribute('data-section-row', '3');
  await expect(page.locator('#sectionCanvas')).toHaveAttribute('data-section-row', '3');
  const pink = await page.locator('#threeView canvas').evaluate(source => {
    const c = document.createElement('canvas'); c.width = source.width; c.height = source.height;
    const ctx = c.getContext('2d'); ctx.drawImage(source, 0, 0); const a = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] > 150 && a[i + 1] < 100 && a[i + 2] > 70 && a[i + 2] < 150) n++; return n;
  });
  expect(pink).toBeGreaterThan(30);
  await page.screenshot({ path: 'test-results/thermocline-line.png', fullPage: true });
  await page.locator('.steps [data-step="6"]').click();
  await page.getByLabel('コリオリの設定方法').selectOption('latitude');
  await page.getByLabel('基準緯度（北緯＋・南緯−）').fill('-35'); await page.getByLabel('基準緯度（北緯＋・南緯−）').blur();
  await expect(page.locator('.rotation-formula')).toContainText('sin');
  expect((await saved(page)).numerics.latitude).toBe(-35);
  await page.locator('#calculateButton').click();
  await expect(page.locator('#sectionCanvas')).toBeVisible();
  await expect(page.locator('#runLog')).toContainText('ROMS: DONE', { timeout: 60000 });
  await scenePixels(page, '#sectionCanvas'); await scenePixels(page, '#threeView canvas');
  await page.locator('#sliceRow').fill('4');
  await expect(page.locator('#threeView')).toHaveAttribute('data-section-row', '4');
  await expect(page.locator('#sectionCanvas')).toHaveAttribute('data-section-row', '4');
  await page.screenshot({ path: 'test-results/calculation-dual.png', fullPage: true });
});

test('Seto Inland Sea terrain is available with geographic scale', async ({ page }) => {
  await seed(page, c => { c.grid.nx = 80; c.grid.ny = 40; });
  await page.getByLabel('地形の種類').selectOption('setouchi');
  await page.locator('[data-view="map"]').click(); await scenePixels(page, '#mapCanvas');
  const c = await saved(page); expect(c.grid.dx).toBeGreaterThan(4000); expect(c.grid.dy).toBeGreaterThan(4000);
  await page.screenshot({ path: 'test-results/setouchi.png', fullPage: true });
});
