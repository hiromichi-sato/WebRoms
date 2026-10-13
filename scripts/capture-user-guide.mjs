// Capture the actual application and exercise the documented save/load/export path.
import { spawn } from 'node:child_process';
import { mkdir, writeFile as writeFileOnce } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { defaults, resizeLayers, buildFields, validate } from '../src/model.js';
import { coastalReceiver } from '../src/coastal-rivers.js';
async function writeFile(path, data) { for (let attempt = 0; ; attempt++) { try { return await writeFileOnce(path, data); } catch (error) { if (attempt >= 4) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); } } }
import { ensureWind } from '../src/forcing.js';
import { unzipSync } from '../vendor/fflate.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const imageDir = new URL('../docs/images/user-guide/', import.meta.url);
const samplePath = new URL('../docs/examples/quickstart.json', import.meta.url);
await mkdir(imageDir, { recursive: true });
await mkdir(new URL('../docs/examples/', import.meta.url), { recursive: true });
const port = Number(process.env.GUIDE_PORT || 5193), url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, windowsHide: true, stdio: 'pipe' });
let serverLog = ''; server.stdout.on('data', b => { serverLog += b; }); server.stderr.on('data', b => { serverLog += b; });
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (attempt === 40 || server.exitCode !== null) throw new Error(`Guide server failed: ${serverLog}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1040 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // The native OS picker cannot be photographed in headless mode. Keep the UI intact;
  // capture writes in memory only, then validate and persist the example artifact.
  await page.addInitScript(() => {
    window.__guideWrites = [];
    window.showSaveFilePicker = async ({ suggestedName }) => ({ name: suggestedName, createWritable: async () => {
      const chunks = [];
      return { write: async data => chunks.push(data), abort: async () => { chunks.length = 0; }, close: async () => {
        window.__guideWrites.push({ name: suggestedName, blob: new Blob(chunks) });
      } };
    } });
  });
  const capture = async name => {
    await expect(page.locator('#toast')).toBeHidden({ timeout: 10000 });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const bitmap = await page.screenshot();
    for (let attempt = 0; ; attempt++) { try { await writeFile(fileURLToPath(new URL(name + '.png', imageDir)), bitmap); break; } catch (error) { if (attempt >= 4) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); } }
    console.log(`Captured ${name}`);
  };
  const config = defaults(); config.name = '利用ガイド：湾の短時間実験';
  Object.assign(config.grid, { nx: 24, ny: 20, minDepth: 40, maxDepth: 120 }); resizeLayers(config, 6);
  Object.assign(config.initial, { distribution: 'summer', mixing: .15, tempSurface: 24, tempBottom: 14 });
  config.ecosystem.enabled = true;
  Object.assign(ensureWind(config), { pattern: 'uniform', speed: 3, direction: 90, edits: {} });
  Object.assign(config.numerics, { dt: 10, maxSteps: 120 });
  for (const boundary of Object.values(config.boundary)) { boundary.mode = 'closed'; boundary.fromInitial = false; }
  config.heat.mode = 'air'; config.heat.airTemperature = 24;
  const fields = buildFields(config);
  for (let p = 0; p < fields.mask.length; p++) {
    const i = p % fields.nx, j = Math.floor(p / fields.nx);
    if (fields.mask[p] || i < 2 || j < 2 || i >= fields.nx - 2 || j >= fields.ny - 2) continue;
    try {
      const cell = coastalReceiver(fields, p);
      config.rivers.push({ id: 'guide-river', landCell: p, cell, flow: 10, temp: 18, salt: 0, biology: { ...config.ecosystem.initial } });
      break;
    } catch {}
  }
  assert.equal(config.rivers.length, 1); assert.deepEqual(validate(config), []);
  await page.goto(url);
  await page.locator('#importFile').setInputFiles({ name: 'quickstart.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator('#toast')).toContainText('設定を読み込みました');
  for (const [step, name] of ['01-terrain', '02-ecosystem', '03-initial', '04-boundary', '05-rivers', '06-wind', '07-calculation'].entries()) {
    await page.locator(`.steps button[data-step="${step}"]`).click();
    await capture(name);
  }
  await page.locator('#saveButton').click();
  await expect.poll(() => page.evaluate(() => window.__guideWrites.length)).toBe(1);
  const savedText = await page.evaluate(async () => window.__guideWrites[0].blob.text());
  const saved = JSON.parse(savedText); assert.deepEqual(validate(saved), []);
  await writeFile(samplePath, savedText + '\n');
  await page.locator('#conditionsButton').click();
  await expect.poll(() => page.evaluate(() => window.__guideWrites.length)).toBe(2);
  await page.locator('#calculateButton').click();
  await expect(page.locator('#phaseText')).toContainText('計算完了', { timeout: 90000 });
  await page.locator('#vectorToggle').check();
  await capture('08-results');
  await page.locator('#resultLevelMode').selectOption('depth');
  await page.locator('#resultDepthNumber').fill('20'); await page.locator('#resultDepthNumber').press('Tab');
  await capture('09-depth');
  await page.locator('#resultButton').click();
  await page.locator('#exportFormat').selectOption('experiment');
  await capture('10-export');
  await page.locator('#downloadResults').click();
  await expect.poll(() => page.evaluate(() => window.__guideWrites.length), { timeout: 60000 }).toBe(3);
  const bytes = await page.evaluate(async () => [...new Uint8Array(await window.__guideWrites[2].blob.arrayBuffer())]);
  const files = unzipSync(Uint8Array.from(bytes));
  for (const name of ['project.json', 'conditions.xlsx', 'time_00000.nc']) assert.ok(files[name], name);
  await page.locator('#closeResults').click();
  await page.reload();
  await page.locator('#importFile').setInputFiles(fileURLToPath(samplePath));
  await expect(page.locator('#toast')).toContainText('設定を読み込みました');
  await expect(page.locator('[data-path="grid.nz"]')).toHaveValue('6');
  await capture('11-json-reloaded');
  const header = await page.locator('.app-header').boundingBox();
  await page.screenshot({ path: fileURLToPath(new URL('12-file-actions.png', imageDir)), clip: header });
  assert.deepEqual(errors, []);
  const diagram = await browser.newPage({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
  await diagram.goto(new URL('../docs/images/setup-flow.svg', import.meta.url).href);
  await diagram.evaluate(() => document.fonts.ready);
  await diagram.screenshot({ path: fileURLToPath(new URL('../docs/images/setup-flow.png', import.meta.url)) });
  console.log('Verified: saved JSON reload, completed RUN, Excel output and experiment ZIP.');
} finally { await browser?.close(); server.kill(); }
