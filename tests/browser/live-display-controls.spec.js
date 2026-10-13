import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('display menus remain mounted and usable across live ROMS progress updates', async ({ page }) => {
  const config = defaults(); Object.assign(config.grid, { nx: 16, ny: 16, preset: 'open', minDepth: 40, maxDepth: 40 }); Object.assign(config.numerics, { dt: 1, maxSteps: 100000 });
  await page.goto('/'); await loadSettings(page, config); await page.locator('[data-step="6"]').click();
  await page.evaluate(() => {
    window.displayMenuRemovals = 0;
    new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes) if (node.nodeType === 1 && (['fieldSelect', 'diagnosticSelect'].includes(node.id) || node.querySelector('#fieldSelect,#diagnosticSelect') || node.tagName === 'OPTION' && record.target.id === 'fieldSelect')) window.displayMenuRemovals++;
    }).observe(document.querySelector('.workspace'), { childList: true, subtree: true });
  });
  await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算中');
  await expect.poll(() => page.locator('#iterations').textContent()).not.toBe('0');
  await expect(page.locator('#fieldSelect')).toBeEnabled(); await expect(page.locator('#diagnosticSelect')).toBeEnabled();
  await page.locator('#fieldSelect').selectOption('salt');
  const previous = await page.locator('#iterations').textContent();
  await expect.poll(() => page.locator('#iterations').textContent()).not.toBe(previous);
  await expect(page.locator('#fieldSelect')).toHaveValue('salt');
  await page.locator('#diagnosticSelect').selectOption('diagVorticity');
  const next = await page.locator('#iterations').textContent();
  await expect.poll(() => page.locator('#iterations').textContent()).not.toBe(next);
  await expect(page.locator('#diagnosticSelect')).toHaveValue('diagVorticity');
  expect(await page.evaluate(() => window.displayMenuRemovals)).toBe(0);
  await page.locator('#fieldSelect').selectOption('temp'); await expect(page.locator('#diagnosticSelect')).toHaveValue('');
  await page.locator('#calculateButton').click(); await expect(page.locator('#runStateBadge')).not.toContainText('計算中');
});
