import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('3D boundary markers choose a side and toolbar modes and initial defaults are editable', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' });
  await page.goto('/'); await loadSettings(page, c); await page.locator('[data-step="3"]').click();
  await expect(page.locator('#seedBoundary')).toHaveCount(0);
  await expect(page.locator('#boundarySide')).toBeHidden();
  await expect(page.locator('#boundaryFromInitial')).toBeChecked();
  await expect(page.locator('.view-toolbar [data-path="boundary.west.mode"]')).toHaveValue('specified');
  await page.locator('[data-boundary-side="east"]').click();
  await expect(page.locator('[data-boundary-side="east"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.view-toolbar [data-path="boundary.east.mode"]').selectOption('closed');
  expect((await readSettings(page)).boundary.east.mode).toBe('closed');
  await page.locator('[data-path="boundary.east.mode"]').selectOption('specified');
  await page.locator('#boundaryFromInitial').uncheck(); expect((await readSettings(page)).boundary.east.fromInitial).toBe(false);
  await page.locator('#boundaryFromInitial').check(); expect((await readSettings(page)).boundary.east.fromInitial).toBe(true);
  await expect(page.locator('#sectionCanvas')).toHaveAttribute('data-layers', '3');
  await page.screenshot({ path: 'test-results/boundary-side-controls.png' });
});
