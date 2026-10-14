import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

test('bare contour input explains required companions and preserves the existing terrain', async ({ page }) => {
  await page.goto('/'); await loadSettings(page, fixture());
  await page.locator('#terrainSourceMode').selectOption('external');
  const bytes = Buffer.alloc(100); bytes.writeInt32BE(9994, 0); bytes.writeInt32LE(1000, 28); bytes.writeInt32LE(3, 32);
  const before = await readSettings(page);
  await page.locator('#terrainImport').setInputFiles({ name: 'depth_contours.shp', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.locator('#terrainImportError')).toContainText('depth_contours.dbf');
  await expect(page.locator('#terrainImportError')).toContainText('depth_contours.prj');
  await expect(page.locator('#terrainImportError')).toContainText('等深線');
  await expect(page.locator('#terrainImportError')).not.toContainText('invalid zip data');
  expect((await readSettings(page)).grid).toEqual(before.grid);
});
