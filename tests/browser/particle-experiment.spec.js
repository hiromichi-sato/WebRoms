import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { NetCDFReader } from 'netcdfjs';

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) test(`08 retains the ocean, tracks and saves NetCDF at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const config = fixture(); config.numerics.calculateDiffusion = true; config.numerics.maxSteps = 10;
  config.particles = { cell: 27, count: 9, depth: 2, mode: 'depth', hours: .02, interval: 20 };
  await loadSettings(page, config);
  await expect(page.locator('.steps [data-step]')).toHaveCount(8);
  await page.locator('.steps [data-step="7"]').click();
  await expect(page.locator('#particleRun')).toBeDisabled();
  await page.locator('.steps [data-step="6"]').click();
  await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了');
  await page.locator('#nextButton').click();
  await expect(page.locator('#stepTitle')).toHaveText('追加実験');
  await expect(page.locator('#particleRun')).toBeEnabled();
  await page.locator('[data-path="particles.sources.0.count"]').fill('4');
  await page.locator('[data-path="particles.sources.0.count"]').dispatchEvent('change');
  await expect(page.locator('#particleRun')).toBeEnabled();
  await page.locator('#particleRun').click();
  await expect(page.locator('#particleStatus')).toContainText('追跡が完了');
  await expect(page.locator('#modelTime')).toHaveText('0.03 h');
  await expect(page.locator('#particleElapsedTime')).toHaveText('0.02 h');
  await expect(page.locator('#particleTimeMetric')).toBeVisible();
  await expect(page.locator('#threeView')).toHaveAttribute('data-particle-count', '4');
  const pixels = await page.locator('#threeView canvas').evaluate(el => {
    const copy = document.createElement('canvas'); copy.width = el.width; copy.height = el.height;
    const ctx = copy.getContext('2d'); ctx.drawImage(el, 0, 0);
    const values = ctx.getImageData(0, 0, copy.width, copy.height).data; let colored = 0, pink = 0;
    for (let p = 0; p < values.length; p += 4) { if (values[p + 2] > values[p] + 20) colored++; if (values[p] > 130 && values[p + 1] < 110 && values[p + 2] > 60) pink++; }
    return { colored, pink };
  });
  expect(pixels.colored).toBeGreaterThan(1000); expect(pixels.pink).toBeGreaterThan(4);
  await expect(page.locator('#particleDownload')).toBeEnabled();
  await page.locator('#particleDownload').click();
  await expect.poll(() => page.evaluate(() => window.__fileWrites.some(f => f.name === 'webroms-particles.nc'))).toBe(true);
  await expect(page.locator('#particleStatus')).toContainText('軌跡を保存しました');
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.__fileWrites.find(f => f.name === 'webroms-particles.nc').blob.arrayBuffer())));
  const nc = new NetCDFReader(Uint8Array.from(bytes));
  expect(nc.dimensions.find(d => d.name === 'trajectory').size).toBe(4);
  const times = nc.getDataVariable('ocean_time'); expect(times[0]).toBe(100); expect(times.at(-1)).toBe(180);
  await page.locator('[data-view="map"]').click();
  await expect(page.locator('#mapCanvas')).toBeVisible();
  await page.screenshot({ path: `test-results/08-particle-map-${viewport.width}.png`, fullPage: true });
  await page.locator('[data-view="3d"]').click();
  await page.screenshot({ path: `test-results/08-particle-3d-${viewport.width}.png`, fullPage: true });
  expect((await readSettings(page)).particles.sources[0].count).toBe(4);
  await page.locator('#particleRun').click();
  await expect(page.locator('#particleStatus')).toContainText('追跡が完了');
  await expect(page.locator('#modelTime')).toHaveText('0.03 h');
  await expect(page.locator('#particleElapsedTime')).toHaveText('0.04 h');
  await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('#modelTime')).toHaveText('0.07 h');
  await expect(page.locator('#particleTimeMetric')).toBeHidden();
  expect(errors).toEqual([]);
});

test('release picking rejects boundary cells and preserves navigation', async ({ page }) => {
  await page.goto('/'); const config = fixture(); await loadSettings(page, config);
  await page.locator('.steps [data-step="7"]').click();
  await page.locator('[data-view="map"]').click(); await page.locator('#chooseParticleCell').click();
  const canvas = page.locator('#mapCanvas');
  const point = await canvas.evaluate(el => {
    const r = el.getBoundingClientRect(), pad = 52, side = Math.min(r.width - 2 * pad, r.height - 2 * pad);
    return { x: (r.width - side) / 2 + 3.5 / 8 * side, y: (r.height - side) / 2 + 4.5 / 8 * side };
  });
  await canvas.click({ position: point });
  await expect(page.locator('.particle-location')).toContainText('X 4');
  await canvas.click({ position: { x: point.x + 40, y: point.y - 40 } });
  await expect(page.locator('[data-particle-source]')).toHaveCount(2);
  await expect(page.locator('#threeView')).toHaveAttribute('data-release-pin-count', '2');
  await page.locator('#removeParticleSource').click();
  await expect(page.locator('[data-particle-source]')).toHaveCount(1);
  const saved = await readSettings(page); expect(saved.particles.sources[0].cell).toBe(27);
  await page.locator('#deleteParticleCells').click();
  await canvas.click({ position: point });
  await expect(page.locator('[data-particle-source]')).toHaveCount(0);
  expect((await readSettings(page)).particles.sources).toHaveLength(0);
});

test('multiple origins, geographic cells and per-site recoloring remain distinct in NetCDF', async ({ page }) => {
  await page.goto('/');
  const config = fixture(); config.numerics.maxSteps = 5;
  config.grid.geoBounds = { west: 130, east: 131, south: 30, north: 31 };
  config.particles = { mode: 'depth', hours: .02, interval: 20, sources: [
    { id: 'source-a', cell: 27, count: 2, depth: 2, color: '#c52c64' },
    { id: 'source-b', cell: 36, count: 3, depth: 5, color: '#007f91' }
  ] };
  await loadSettings(page, config); await page.locator('.steps [data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了'); await page.locator('#nextButton').click();
  await expect(page.locator('.particle-location')).toContainText('経度 130.42857');
  await page.locator('[data-particle-source="1"]').click();
  await expect(page.locator('.particle-location')).toContainText('緯度 30.57143');
  await page.locator('#particleRun').click(); await expect(page.locator('#particleStatus')).toContainText('追跡が完了');
  await expect(page.locator('#threeView')).toHaveAttribute('data-particle-count', '5');
  await expect(page.locator('#threeView')).toHaveAttribute('data-release-pin-count', '2');
  await page.locator('[aria-label="粒子の色"]').evaluate(el => { el.value = '#00ff00'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await expect(page.locator('#particleStatus')).toContainText('色を更新');
  await expect(page.locator('#particleDownload')).toBeEnabled();
  await page.locator('#particleDownload').click(); await expect(page.locator('#particleStatus')).toContainText('保存しました');
  const bytes = await page.evaluate(async () => [...new Uint8Array(await window.__fileWrites.at(-1).blob.arrayBuffer())]);
  const nc = new NetCDFReader(Uint8Array.from(bytes));
  expect(nc.getDataVariable('release_site_index')).toEqual([1, 1, 2, 2, 2]);
  expect(nc.getDataVariable('release_cell')).toEqual([27, 36]);
  expect(nc.getDataVariable('release_longitude')[1]).toBeCloseTo(130 + 4 / 7);
  const metadata = JSON.parse(nc.globalAttributes.find(a => a.name === 'release_site_metadata').value);
  expect(metadata[1].id).toBe('source-b'); expect(metadata[1].color).toBe('#00ff00');
  const settings = await readSettings(page); expect(settings.particles.sources[1].color).toBe('#00ff00');
  await page.screenshot({ path: 'test-results/multiple-particle-origins.png', fullPage: true });
  await page.locator('[data-view="map"]').click();
  await page.locator('#fieldSelect').selectOption('h');
  await expect(page.locator('[data-view="3d"]')).toHaveAttribute('aria-pressed', 'true');
  expect(Number(await page.locator('#threeView').getAttribute('data-particle-vertical-span'))).toBeGreaterThan(.1);
  await page.screenshot({ path: 'test-results/particles-bathymetry-3d.png', fullPage: true });
  await page.locator('#deleteParticleCells').click();
  const pinPoint = await page.locator('#threeView canvas').evaluate(async canvas => {
    const THREE = await import('/vendor/three/three.module.js'), rect = canvas.getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(38, rect.width / rect.height, .1, 100); camera.position.set(12, 12, 15); camera.lookAt(0, -1.1, 0); camera.updateMatrixWorld();
    const p = new THREE.Vector3(.625, .34, -.625).project(camera);
    return { x: (p.x + 1) * rect.width / 2, y: (1 - p.y) * rect.height / 2 };
  });
  await page.locator('#threeView canvas').click({ position: pinPoint });
  await expect(page.locator('[data-particle-source]')).toHaveCount(1);
});
