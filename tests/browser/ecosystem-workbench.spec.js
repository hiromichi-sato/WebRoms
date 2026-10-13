import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('diagram inspector and complete researcher parameters share the same values', async ({ page }) => {
  const c = defaults(); c.ecosystem.enabled = true;
  await page.goto('/'); await loadSettings(page, c); await page.locator('[data-step="1"]').click();
  const left = await page.locator('.eco-circulation').boundingBox(), right = await page.locator('.eco-reaction-inspector').boundingBox();
  expect(right.x).toBeGreaterThan(left.x + left.width);
  await page.locator('g.eco-lesson-edge[data-eco-topic="G"]').first().click();
  await expect(page.locator('[data-eco-explanation]')).toContainText('捕食と配分');
  await expect(page.locator('g.eco-lesson-edge[data-eco-topic="G"]').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.eco-quick-controls input[type="number"][data-eco-param="ZooGR"]').fill('0.8');
  expect((await readSettings(page)).ecosystem.parameters.npzd.ZooGR).toBe(.8);
  await page.locator('.eco-parameter-list>summary').click();
  await expect(page.locator('.eco-parameter-list input[data-eco-param="ZooGR"]')).toHaveValue('0.8');
  await page.getByLabel('パラメータを検索').fill('K_ext');
  await expect(page.locator('.eco-parameter-list label.eco-lesson-control:visible')).toHaveCount(1);
  await page.locator('.eco-parameter-list input[data-eco-param="K_ext"]').fill('0.12');
  await page.locator('button[data-eco-topic="U"]').click();
  await expect(page.locator('.eco-quick-controls input[type="number"][data-eco-param="K_ext"]')).toHaveValue('0.12');
  await page.locator('[data-eco-reset]').click();
  expect((await readSettings(page)).ecosystem.parameters.npzd.K_ext).toBe(c.ecosystem.parameters.npzd.K_ext);
  await page.screenshot({ path: 'test-results/ecosystem-workbench-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/ecosystem-workbench-mobile.png', fullPage: true });
});

test('NEMURO keeps 84 parameters and exposes process-specific editing from the diagram', async ({ page }) => {
  const c = defaults(); Object.assign(c.ecosystem, { enabled: true, model: 'nemuro' });
  await page.goto('/'); await loadSettings(page, c); await page.locator('[data-step="1"]').click();
  await expect(page.locator('.eco-parameter-list input[data-eco-param]')).toHaveCount(84);
  await page.locator('button[data-eco-topic="light"]').click();
  await expect(page.locator('[data-eco-explanation]')).toContainText('光制限と光阻害');
  await page.locator('.eco-quick-controls input[data-eco-param="AlphaPS"]').fill('0.03');
  expect((await readSettings(page)).ecosystem.parameters.nemuro.AlphaPS).toBe(.03);
  const scroll = page.locator('.eco-parameter-scroll');
  await scroll.evaluate(el => { el.scrollTop = 0; });
  const headingBefore = await page.locator('.eco-inspector-fixed').boundingBox();
  await scroll.evaluate(el => { el.scrollTop = 200; });
  expect(await scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const headingAfter = await page.locator('.eco-inspector-fixed').boundingBox();
  expect(Math.abs(headingAfter.y - headingBefore.y)).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/ecosystem-workbench-nemuro.png' });
});
