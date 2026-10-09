import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { BIO_MODELS } from '../src/biology-catalog.js';
import { massEquivalent, npzdRates, renderEcosystemPanel } from '../src/ecosystem-panel.js';

const defaults = () => ({ ecosystem: {
  enabled: true, model: 'npzd', shortwave: 150,
  parameters: Object.fromEntries(Object.entries(BIO_MODELS).map(([key, model]) => [key, Object.fromEntries(model.parameters.map(p => [p.key, p.value]))])),
  initial: Object.fromEntries(Object.values(BIO_MODELS).flatMap(model => model.tracers.map(t => [t.key, t.initial])))
} });

test('mass conversion distinguishes elemental Si and Redfield equivalents', () => {
  assert.equal(massEquivalent(1, 'mmol N/m³'), '14.007 mg N/m³ / 79.573 mg C/m³ 相当 / 1.9359 mg P/m³ 相当');
  assert.equal(massEquivalent(2, 'mmol Si/m³'), '56.17 mg Si/m³');
  assert.equal(massEquivalent(1, 'mg Chl/m³'), '換算対象外');
  assert.equal(massEquivalent(NaN, 'mmol N/m³'), '換算不可');
});

test('NPZD rates follow Franks uptake and grazing and conserve local nitrogen', () => {
  const config = defaults();
  const p = config.ecosystem.parameters.npzd;
  Object.assign(config.ecosystem.initial, { npzd_NO3_: 2, npzd_Phyt: 0.4, npzd_Zoop: 0.3, npzd_SDet: 0.2 });
  const rates = npzdRates(config, 10);
  assert.ok(Math.abs(rates.U - p.Vm_NO3 * Math.exp(-10 * p.K_ext) * 2 / (p.K_NO3 + 2) * 0.4) < 1e-12);
  assert.ok(Math.abs(rates.G - p.ZooGR * 0.3 / 2) < 1e-12);
  assert.ok(Math.abs(rates.N + rates.P + rates.Z + rates.D) < 1e-12);
  config.ecosystem.shortwave = 0;
  assert.equal(npzdRates(config, 10).U, rates.U);
  p.Vm_NO3 = 0;
  assert.equal(npzdRates(config, 10).U, 0);
  config.ecosystem.initial.npzd_NO3_ = 0;
  config.ecosystem.initial.npzd_Phyt = 0;
  p.K_NO3 = 0; p.K_Phy = 0;
  assert.equal(npzdRates(config).U, 0);
  assert.equal(npzdRates(config).G, 0);
});

test('both models expose every catalog parameter and only supported lessons', () => {
  const config = defaults();
  for (const model of ['npzd', 'nemuro']) {
    config.ecosystem.model = model;
    const html = renderEcosystemPanel(config);
    for (const p of BIO_MODELS[model].parameters) assert.ok(html.includes(`data-eco-param="${p.key}"`), p.key);
    for (const tracer of BIO_MODELS[model].tracers) assert.ok(html.includes(tracer.label), tracer.key);
    assert.ok(html.includes('Redfield C:N:P = 106:16:1'));
  }
  config.ecosystem.model = 'fennel';
  assert.ok(!renderEcosystemPanel(config).includes('data-eco-param'));
});

test('browser edits persist actual config, refresh rates, and support keyboard and mobile', async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.CI ? undefined : 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://ecosystem.test/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const paths = { '/src/ecosystem-panel.js': '../src/ecosystem-panel.js', '/src/biology-catalog.js': '../src/biology-catalog.js', '/ecosystem-panel.css': '../ecosystem-panel.css' };
      await route.fulfill(paths[path] ? {
        contentType: path.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: await readFile(new URL(paths[path], import.meta.url))
      } : { contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/ecosystem-panel.css"><div id="ecosystemLesson"></div>' });
    });
    await page.goto('http://ecosystem.test/');
    await page.evaluate(async config => {
      const panel = await import('/src/ecosystem-panel.js');
      window.lesson = panel;
      window.config = config;
      window.changes = 0;
      const container = document.querySelector('#ecosystemLesson');
      container.innerHTML = panel.renderEcosystemPanel(config);
      panel.bindEcosystemPanel(container, config, () => window.changes++);
      panel.bindEcosystemPanel(container, config, () => window.changes++);
    }, defaults());
    await page.locator('g[data-eco-topic="N"]').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('[data-eco-explanation]').innerText(), /dN\/dt/);
    await page.locator('details').first().locator('summary').click();
    const input = page.locator('input[type="number"][data-eco-param="Vm_NO3"]');
    await input.fill('0');
    assert.equal(await page.evaluate(() => config.ecosystem.parameters.npzd.Vm_NO3), 0);
    assert.equal(await page.evaluate(() => changes), 1);
    assert.match(await page.locator('[data-eco-chart]').innerText(), /U = 0/);
    await input.fill('-1');
    assert.equal(await page.evaluate(() => config.ecosystem.parameters.npzd.Vm_NO3), 0);
    await page.locator('[data-eco-depth]').fill('60');
    assert.equal(await page.evaluate(() => changes), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.ECO_SCREENSHOT) await page.screenshot({ path: process.env.ECO_SCREENSHOT, fullPage: true });
    await page.evaluate(() => {
      config.ecosystem.model = 'nemuro';
      const container = document.querySelector('#ecosystemLesson');
      container.innerHTML = lesson.renderEcosystemPanel(config);
      lesson.bindEcosystemPanel(container, config, () => window.changes++);
    });
    await page.locator('button[data-eco-topic="silicon"]').click();
    assert.match(await page.locator('[data-eco-explanation]').innerText(), /dSiOH\/dt/);
    await page.locator('details').first().locator('summary').click();
    await page.locator('[data-eco-param="RSiN"]').fill('1.5');
    assert.equal(await page.evaluate(() => config.ecosystem.parameters.nemuro.RSiN), 1.5);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
  }
});
