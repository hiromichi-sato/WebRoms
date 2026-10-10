import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('no autosave or restoration; only explicitly chosen files retain settings', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('webroms.project.v1', JSON.stringify({ name: '旧自動保存' })); localStorage.setItem('unrelated', 'keep'); });
  await page.reload();
  await expect(page.locator('#projectName')).not.toHaveValue('旧自動保存');
  expect(await page.evaluate(() => localStorage.getItem('webroms.project.v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated'))).toBe('keep');
  await page.locator('#projectName').fill('保存しない設定'); await page.locator('#projectName').blur();
  await expect(page.locator('#saveStatus')).toContainText('未保存');
  await page.reload(); await expect(page.locator('#projectName')).not.toHaveValue('保存しない設定');
  await page.locator('#projectName').fill('手動保存'); await page.locator('#projectName').blur();
  const config = await readSettings(page); expect(config.name).toBe('手動保存');
  await expect(page.locator('#saveStatus')).toContainText('保存先：webroms-project.json');
  await page.reload(); await expect(page.locator('#projectName')).not.toHaveValue('手動保存');
  await loadSettings(page, config); await expect(page.locator('#projectName')).toHaveValue('手動保存');
  expect(await page.evaluate(() => localStorage.getItem('webroms.project.v1'))).toBeNull();
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
  await page.locator('#saveButton').click(); await expect(page.locator('#toast')).toContainText('キャンセル');
  expect(await page.evaluate(() => window.__fileWrites.length)).toBe(0);
  await page.evaluate(() => { delete window.showSaveFilePicker; });
  await page.locator('#saveButton').click(); await expect(page.locator('#toast')).toContainText('保存先を選択できません');
  expect(await page.evaluate(() => window.__fileWrites.length)).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#saveStatus')).toBeVisible();
  await page.screenshot({ path: 'test-results/explicit-save-mobile.png', fullPage: true });
});

test('cancelled destination skips additional RUN and write failures are reported', async ({ page }) => {
  await page.goto('/'); const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 60, maxDepth: 60 }); Object.assign(c.numerics, { dt: 1, maxSteps: 2 });
  await loadSettings(page, c); await page.locator('[data-step="6"]').click(); await page.locator('#calculateButton').click();
  await expect(page.locator('#convergence')).toHaveText('完了');
  await page.locator('#resultButton').click(); await page.locator('#exportHours').fill('0.001');
  await page.evaluate(() => { window.showSaveFilePicker = async () => { throw new DOMException('cancelled', 'AbortError'); }; });
  await page.locator('#downloadResults').click(); await expect(page.locator('#exportSummary')).toContainText('保存先未指定');
  await expect(page.locator('#iterations')).toHaveText('2');
  await page.evaluate(() => { window.showSaveFilePicker = async () => ({ name: 'unwritable.nc', createWritable: async () => { throw new Error('disk full'); } }); });
  await page.locator('#exportHours').fill('0'); await page.locator('#downloadResults').click();
  await expect(page.locator('#exportSummary')).toContainText('保存できません');
  await expect(page.locator('#exportSummary')).toContainText('disk full');
  await expect(page.locator('#downloadResults')).toBeEnabled();
});
