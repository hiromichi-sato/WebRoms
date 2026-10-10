import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

const boundary = async page => (await readSettings(page)).boundary;
async function stroke(page) {
  const canvas = page.locator('#sectionCanvas'); await canvas.scrollIntoViewIfNeeded();
  const r = await canvas.boundingBox();
  await page.mouse.move(r.x + r.width * .4, r.y + r.height * .4); await page.mouse.down();
  await page.mouse.move(r.x + r.width * .7, r.y + r.height * .4, { steps: 10 }); await page.mouse.up();
}

test('boundary inspect, stroke undo/redo, manual modes and history invalidation', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 60, maxDepth: 60 });
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('[data-step="3"]').click();
  await expect(page.locator('#boundaryBrush')).toHaveValue('inspect');
  await expect(page.locator('#undoBoundary')).toBeDisabled();
  const original = await boundary(page);
  await stroke(page); expect(await boundary(page)).toEqual(original);
  await page.locator('#sectionHome').click();
  await page.locator('#editValue').fill('29'); await page.locator('#editValue').blur();
  await page.locator('#boundaryBrush').selectOption('paint'); await stroke(page);
  const painted = await boundary(page); expect(painted).not.toEqual(original); expect(painted.west.fromInitial).toBe(false);
  expect(Object.values(painted.west.painted.temp).flatMap(Object.values)).toContain(29);
  await page.locator('#undoBoundary').click(); expect(await boundary(page)).toEqual(original);
  await expect(page.locator('#undoBoundary')).toBeDisabled(); await expect(page.locator('#boundaryBrush')).toHaveValue('inspect');
  await page.locator('#redoBoundary').click(); expect(await boundary(page)).toEqual(painted);
  await page.locator('#undoBoundary').click();
  await page.locator('#editValue').fill('27'); await page.locator('#editValue').blur();
  await page.locator('#boundaryBrush').selectOption('paint'); await stroke(page);
  await expect(page.locator('#redoBoundary')).toBeDisabled();
  await page.locator('#boundarySide').selectOption('east'); await expect(page.locator('#boundaryBrush')).toHaveValue('inspect');
  await page.locator('[data-path="boundary.east.mode"]').selectOption('periodic');
  expect((await boundary(page)).west.mode).toBe('periodic');
  await page.locator('#undoBoundary').click(); expect((await boundary(page)).east.mode).toBe('specified'); expect((await boundary(page)).west.mode).toBe('specified');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/boundary-inspect-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-step="2"]').click();
  await page.locator('[data-path="initial.tempSurface"]').fill('25'); await page.locator('[data-path="initial.tempSurface"]').blur();
  await page.locator('[data-step="3"]').click(); await expect(page.locator('#undoBoundary')).toBeDisabled();
  expect(errors).toEqual([]);
});
