import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

test('project JSON preserves conditions and warns about a different kernel without erasing its identity', async ({ page }) => {
  await page.goto('/');
  const config = fixture(); await loadSettings(page, config);
  const saved = await readSettings(page);
  expect(saved.reproducibility.comparison.relativeTolerance).toBe(.01);
  expect(saved.reproducibility.comparison.statisticalConfidence).toBeNull();
  expect(saved.reproducibility.expectedKernel.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(saved.grid).toEqual(config.grid); expect(saved.initial).toEqual(config.initial);
  await loadSettings(page, saved);
  expect((await readSettings(page)).reproducibility).toEqual(saved.reproducibility);
  const different = structuredClone(saved); different.reproducibility.expectedKernel.sha256 = '0'.repeat(64);
  await page.locator('#importFile').setInputFiles({ name: 'other-pc.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(different)) });
  await expect(page.locator('#toast')).toContainText('計算核が異なります');
  const resaved = await readSettings(page);
  expect(resaved.reproducibility.expectedKernel.sha256).toBe('0'.repeat(64));
  expect(resaved.reproducibility.availableKernel.sha256).toBe(saved.reproducibility.availableKernel.sha256);
  expect(resaved.grid).toEqual(saved.grid); expect(resaved.initial).toEqual(saved.initial);
});
