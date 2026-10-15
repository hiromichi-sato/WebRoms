import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';
import { readFile, access } from 'node:fs/promises';

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

test('terrain chooser accepts multiple files and accumulates companions across selections', async ({ page }) => {
  await page.goto('/'); await loadSettings(page, fixture());
  await page.locator('#terrainSourceMode').selectOption('external');
  await expect(page.locator('#terrainImport')).toHaveAttribute('multiple', '');
  await expect(page.locator('#terrainFileHelp')).toBeHidden();
  await page.locator('#terrainFileInfo').click();
  await expect(page.locator('#terrainFileHelp')).toContainText('3ファイルが必須');
  const bytes = Buffer.alloc(100); bytes.writeInt32BE(9994, 0); bytes.writeInt32LE(1000, 28); bytes.writeInt32LE(3, 32);
  await page.locator('#terrainImport').setInputFiles({ name: 'contours.shp', mimeType: 'application/octet-stream', buffer: bytes });
  await expect(page.locator('#terrainImportError')).toContainText('contours.dbf');
  await expect(page.locator('#terrainFileStatus .missing')).toContainText(['contours.dbf', 'contours.prj']);
  await page.locator('#terrainImport').setInputFiles([
    { name: 'contours.dbf', mimeType: 'application/octet-stream', buffer: Buffer.from('test') },
    { name: 'contours.prj', mimeType: 'text/plain', buffer: Buffer.from('test') }
  ]);
  await expect(page.locator('#terrainSelectedFiles')).toContainText('3 ファイル');
  await expect(page.locator('#terrainFileStatus .missing')).toHaveCount(0);
  await expect(page.locator('#terrainImportError')).toBeVisible();
  await expect(page.locator('#terrainImportError')).not.toContainText('も一緒に選択');
  await page.locator('#terrainClearFiles').click();
  await expect(page.locator('#terrainSelectedFiles')).toHaveText('未選択');
  await expect(page.locator('#terrainFileStatus .idle')).toHaveCount(3);
  await expect(page.locator('#terrainImportError')).toHaveCount(0);
});

test('drop generates bathymetry from actual sample_bath contours', async ({ page }) => {
  const directory = process.env.TERRAIN_SAMPLE_DIR || 'C:/work/sample_bath';
  try { await access(directory); } catch { test.skip(true, 'Local sample_bath fixture is not available'); }
  const files = await Promise.all(['shp', 'dbf', 'prj', 'cpg'].map(async ext => ({ name: `depth_contours.${ext}`, bytes: Array.from(await readFile(`${directory}/depth_contours.${ext}`)) })));
  const settings = fixture(); Object.assign(settings.grid, { nx: 48, ny: 32 });
  await page.goto('/'); await loadSettings(page, settings);
  await page.locator('#terrainSourceMode').selectOption('external');
  const before = await readSettings(page);
  await page.evaluate(files => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name));
    const zone = document.querySelector('#terrainDropZone');
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, files);
  await expect(page.locator('#terrainImportProgress')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('#terrainImportError')).toHaveCount(0);
  const after = await readSettings(page);
  expect(after.grid.geoSource).toContain('Laplace');
  expect(after.grid.contourInterpolation.landMaskKnown).toBe(false);
  expect(Object.values(after.grid.edits).every(v => Number.isFinite(v) && v >= 0)).toBe(true);
  expect(after.grid.nx).toBe(before.grid.nx);
  expect(after.grid.geoBounds.west).toBeGreaterThan(138);
  expect(after.grid.contourInterpolation.shallowContourLandCells).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/imported-contour-land.png', fullPage: true });
  await expect(page.locator('#terrainDropZone')).not.toHaveClass(/drag-active/);
});

test('actual sample_depth2 point files generate terrain through the multi-file chooser', async ({ page }) => {
  const directory = process.env.TERRAIN_POINT_SAMPLE_DIR || 'C:/work/sample_depth2';
  try { await access(directory); } catch { test.skip(true, 'Local point fixture is not available'); }
  const settings = fixture(); Object.assign(settings.grid, { nx: 48, ny: 32 });
  await page.goto('/'); await loadSettings(page, settings);
  await page.locator('#terrainSourceMode').selectOption('external');
  await page.locator('#terrainImport').setInputFiles(['shp', 'dbf', 'prj', 'shx', 'cpg'].map(ext => `${directory}/depth_points.${ext}`));
  await expect(page.locator('#terrainImportProgress')).toHaveCount(0, { timeout: 60000 });
  await expect(page.locator('#terrainImportError')).toHaveCount(0);
  const config = await readSettings(page);
  expect(config.grid.contourInterpolation.sourceGeometry).toBe('points');
  expect(config.grid.contourInterpolation.sourceCount).toBe(142945);
  expect(config.grid.contourInterpolation.converged).toBe(true);
  expect(config.grid.contourInterpolation.inferredLandCells).toBeGreaterThan(0);
  expect(Object.values(config.grid.edits).every(v => Number.isFinite(v) && (v === 0 || v >= 1))).toBe(true);
  await expect(page.locator('#pointLandMask')).toBeChecked();
  await page.screenshot({ path: 'test-results/imported-point-land.png', fullPage: true });
  await page.locator('#pointLandMask').uncheck();
  const restored = await readSettings(page);
  expect(Object.values(restored.grid.edits).every(v => v >= 1)).toBe(true);
});
