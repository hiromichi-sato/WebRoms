import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { defaults, resizeLayers, validate } from '../src/model.js';
import { ensureWind } from '../src/forcing.js';

const root = fileURLToPath(new URL('../', import.meta.url)), output = new URL('../docs/images/readme/', import.meta.url);
await mkdir(output, { recursive: true });
const config = defaults(); config.name = 'README計算例：成層した理想湾と一様風';
Object.assign(config.grid, { nx: 24, ny: 20, dx: 2000, dy: 2000, minDepth: 40, maxDepth: 120 }); resizeLayers(config, 8);
Object.assign(config.initial, { distribution: 'summer', tempSurface: 26, tempBottom: 12, saltSurface: 32, saltBottom: 35, mixing: .1 });
config.ecosystem.enabled = true; config.ecosystem.distribution = 'summer';
Object.assign(ensureWind(config), { pattern: 'uniform', speed: 6, direction: 180, edits: {} });
Object.assign(config.numerics, { dt: 10, maxSteps: 8640, rotationMode: 'latitude', latitude: 35, rotationPlane: 'f' });
for (const boundary of Object.values(config.boundary)) { boundary.mode = 'closed'; boundary.fromInitial = false; }
assert.deepEqual(validate(config), []);
await writeFile(new URL('../docs/examples/readme-wind-npzd.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
const port = 5194, server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'pipe' });
let browser;
try {
  for (let attempt = 0; ; attempt++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} if (attempt > 40 || server.exitCode !== null) throw new Error('README preview server failed'); await new Promise(resolve => setTimeout(resolve, 250)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1800, height: 1150 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator('#importFile').setInputFiles({ name: 'readme-wind-npzd.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator('#toast')).toContainText('設定を読み込みました');
  await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了', { timeout: 180000 });
  await expect(page.locator('#modelTime')).toHaveText('24.00 h');
  await page.locator('#vectorToggle').check();
  for (const [field, name] of [['temp', 'results-temperature'], ['npzd_Phyt', 'results-biology']]) {
    await page.locator('#fieldSelect').selectOption(field);
    await page.locator('#contourToggle').click(); await page.locator('#contourAutoMode').selectOption('full'); await page.locator('#contourClose').click();
    await page.locator('#sectionContourToggle').click(); await page.locator('#sectionContourAutoMode').selectOption('full'); await page.locator('#sectionContourClose').click();
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await page.locator('#scenePair').screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) });
    console.log(`Captured ${name}: ${await page.locator('#modelTime').textContent()}`);
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('metadata.json', output), JSON.stringify({ modelHours: 24, grid: [24, 20, 8], wind: { speed: 6, direction: 180 }, tide: false, heat: 'off', ecosystem: 'npzd', steadyStateClaim: false, source: 'browser-roms-wasm', colorRange: 'full', configuration: '../../examples/readme-wind-npzd.json' }, null, 2) + '\n');
} finally { await browser?.close(); server.kill(); }
