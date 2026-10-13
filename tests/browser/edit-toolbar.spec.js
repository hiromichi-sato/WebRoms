import { test, expect, loadSettings, readSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

test('compact cleanup, stable side settings, no river skip and collapsed calculation groups', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#fillIsolatedWater')).toContainText('孤立を陸埋め');
  expect(await page.locator('#fillIsolatedWater').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('[data-step="3"]').click();
  const side = page.locator('.boundary-initial-toggle'); const before = (await side.boundingBox()).y;
  await page.locator('#tideEnabled').check();
  expect(Math.abs((await side.boundingBox()).y - before)).toBeLessThan(1);
  await page.locator('[data-step="4"]').click();
  await expect(page.locator('#skipRivers')).toHaveCount(0);
  await expect(page.locator('.river-empty')).toBeVisible();
  await page.locator('[data-step="6"]').click();
  await expect(page.locator('.calculation-group')).toHaveCount(3);
  for (const title of ['大気との熱交換', 'コリオリ力', '混合・拡散']) await expect(page.locator(`.calculation-group[data-group="${title}"]`)).not.toHaveAttribute('open');
  await expect(page.locator('#layerSelect')).toBeHidden();
});

test('initial item groups, compact forcing switches and a wind compass preserve settings', async ({ page }) => {
  const c = defaults(); c.ecosystem.enabled = true; await page.goto('/'); await loadSettings(page, c);
  await expect(page.locator('.view-toolbar #fillIsolatedWater')).toBeVisible();
  expect(await page.locator('.view-toolbar').evaluate(el => el.firstElementChild.id)).toBe('editHistoryTools');
  await page.locator('[data-step="2"]').click();
  await page.getByLabel('表面水温', { exact: true }).fill('22'); await page.getByLabel('表面水温', { exact: true }).press('Tab');
  await page.locator('[data-initial-panel="biological"]').click();
  await expect(page.locator('#biologicalInitialItems')).toBeVisible();
  await expect(page.locator('#physicalInitialItems')).toBeHidden();
  await page.locator('[data-initial-panel="physical"]').click();
  await expect(page.getByLabel('表面水温', { exact: true })).toHaveValue('22');
  await page.locator('[data-step="3"]').click();
  await expect(page.locator('.boundary-forcing-toggles input')).toHaveCount(2);
  await page.locator('[data-step="5"]').click();
  await expect(page.locator('#windDirectionDial')).toBeVisible();
  const dial = await page.locator('#windDirectionDial').boundingBox();
  await page.mouse.click(dial.x + dial.width * .85, dial.y + dial.height * .5);
  expect((await readSettings(page)).wind.direction).toBe(90);
  await page.locator('#windDirectionDial').focus(); await page.keyboard.press('ArrowRight');
  expect((await readSettings(page)).wind.direction).toBe(95);
  await page.locator('[data-step="6"]').click();
  const titles = await page.locator('#settingsForm>.calculation-group>summary').allTextContents();
  expect(titles.indexOf('混合・拡散')).toBeGreaterThan(titles.indexOf('コリオリ力'));
  await expect(page.locator('#calculationAdvanced')).toBeVisible();
  expect(await page.locator('#calculationAdvanced').evaluate(el => el.previousElementSibling.querySelector('summary').textContent)).toBe('混合・拡散');
});

test('labelled tools, file actions, collapsed formulas and default forcing are clear', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.labelled-tool-group[data-tool-group="terrain"]')).toContainText('地形');
  await expect(page.locator('.labelled-tool-group[data-tool-group="river"]')).toContainText('河川');
  await expect(page.locator('#undoTerrain')).toContainText('戻す');
  await expect(page.locator('.file-actions #terrainDownload')).toBeVisible();
  await expect(page.locator('.file-actions #initialNetcdfExport')).toBeVisible();
  await expect(page.locator('.view-toolbar [data-path="grid.maxDepth"]')).toBeVisible();
  await expect(page.locator('#nextButton')).toContainText('次へ');
  await page.locator('[data-step="1"]').click();
  await expect(page.locator('[data-path="ecosystem.model"]')).toBeDisabled();
  await expect(page.locator('[data-path="ecosystem.model"]')).toHaveValue('none');
  await page.locator('[data-step="2"]').click();
  await expect(page.locator('#settingsForm .rotation-formula')).toBeHidden();
  await page.locator('#initialSourceMode').selectOption('external');
  await expect(page.locator('#initialNetcdfImport')).toBeVisible();
  await page.locator('[data-step="3"]').click();
  await expect(page.locator('#tideEnabled')).not.toBeChecked();
  await expect(page.locator('#seaLevelEnabled')).not.toBeChecked();
});

test('terrain cleanup is undoable and hover previews the actual 3D and map targets', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 100 });
  for (const p of [18, 19, 20, 26, 28, 34, 35, 36]) c.grid.edits[p] = 0;
  await page.goto('/'); await loadSettings(page, c);
  await expect(page.locator('#sectionCanvas')).toBeVisible();
  await expect(page.locator('[data-edit-tool="land"],[data-edit-tool="water"]')).toHaveCount(0);
  await expect(page.locator('.view-toolbar #contourControls,.view-toolbar #zoomIn')).toHaveCount(0);
  await expect(page.locator('.main-scene-tools #contourControls')).toBeVisible();
  await expect(page.locator('.legend')).toBeHidden();
  await expect(page.locator('[data-view="section"]')).toBeHidden();
  await expect(page.locator('.view-toolbar #undoTerrain')).toBeVisible();
  await page.locator('#fillIsolatedWater').click(); expect((await readSettings(page)).grid.edits[27]).toBe(0);
  await page.locator('#undoTerrain').click(); expect((await readSettings(page)).grid.edits[27]).toBeUndefined();
  await page.locator('#redoTerrain').click(); expect((await readSettings(page)).grid.edits[27]).toBe(0);
  await page.locator('[data-edit-tool="dig"]').click();
  await page.locator('#brushSize').selectOption('2');
  await page.locator('[data-view="map"]').click();
  const canvas = page.locator('#mapCanvas'), rect = await canvas.boundingBox();
  const mapSize = Math.min(rect.width - 104, rect.height - 104);
  await page.mouse.move(rect.x + rect.width / 2 + mapSize * 1.5 / 8, rect.y + rect.height / 2 - mapSize * 1.5 / 8);
  const cells = await canvas.getAttribute('data-preview-cells'); expect(cells.split(',').length).toBeGreaterThan(1);
  await page.screenshot({ path: 'test-results/edit-map-highlight.png' });
  await page.locator('[data-view="3d"]').click();
  const bounds = await page.locator('#threeView canvas').boundingBox();
  let found = false;
  for (const y of [.45, .55, .65, .75]) { for (const x of [.4, .5, .6]) { await page.mouse.move(bounds.x + bounds.width * x, bounds.y + bounds.height * y); if (await page.locator('#threeView canvas').getAttribute('data-preview-cells')) { found = true; break; } } if (found) break; }
  await expect(page.locator('#threeView canvas')).not.toHaveAttribute('data-preview-cells', '');
  await page.screenshot({ path: 'test-results/edit-3d-highlight.png' });
  expect(errors).toEqual([]);
});

test('initial and boundary colorbars are adjustable and independent from the section', async ({ page }) => {
  await page.goto('/'); const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' }); await loadSettings(page, c);
  for (const step of [2, 3]) {
    await page.locator(`.steps button[data-step="${step}"]`).click();
    await expect(page.locator('#sectionContourControls')).toBeVisible();
    await expect(page.locator('#contourControls')).toBeVisible();
    await expect(page.locator('#contourControls .colorbar-caption')).toContainText('水温');
    await expect(page.locator('#sectionContourControls .colorbar-caption')).toContainText('水温');
    await page.locator('#contourToggle').click();
    await page.locator('#contourAutoMode').selectOption('full');
    await expect(page.locator('#contourAuto')).toBeChecked();
    await page.locator('#contourAutoMode').selectOption('quartile');
    await page.locator('#contourClose').click();
    await expect(page.locator('[data-view="section"]')).toBeHidden();
    const sectionBefore = await page.locator('#sectionCanvas').getAttribute('data-color-min');
    await page.locator('#contourToggle').click();
    await page.locator('#contourMin').evaluate(el => { el.value = Number(el.min) + (Number(el.max) - Number(el.min)) * .1; el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(await page.locator('#sectionCanvas').getAttribute('data-color-min')).toBe(sectionBefore);
    const mainBefore = await page.locator('#contourLow').textContent();
    await page.locator('#contourClose').click(); await page.locator('#sectionContourToggle').click();
    await page.locator('#sectionContourMin').evaluate(el => { el.value = Number(el.min) + (Number(el.max) - Number(el.min)) * .1; el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(await page.locator('#contourLow').textContent()).toBe(mainBefore);
    await page.locator('#sectionContourClose').click();
    await page.screenshot({ path: `test-results/edit-stage-${step}.png` });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/edit-mobile.png', fullPage: true });
});

test('river and wind modes and history are on their toolbars', async ({ page }) => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', edits: { 27: 0 } });
  await page.goto('/'); await loadSettings(page, c);
  await page.locator('.steps button[data-step="4"]').click();
  await expect(page.locator('.view-toolbar [data-edit-tool="river-add"]')).toBeVisible();
  const toolbar = await page.locator('.view-toolbar').boundingBox(), riverTools = await page.locator('#editToolButtons').boundingBox();
  expect(Math.abs(riverTools.x + riverTools.width / 2 - toolbar.x - toolbar.width / 2)).toBeLessThan(2);
  await page.locator('[data-view="map"]').click(); await page.locator('[data-edit-tool="river-add"]').click();
  const r = await page.locator('#mapCanvas').boundingBox(), size = Math.min(r.width - 104, r.height - 104);
  await page.mouse.click(r.x + r.width / 2 - size / 16, r.y + r.height / 2 + size / 16);
  expect((await readSettings(page)).rivers).toHaveLength(1);
  await page.locator('#undoRiver').click(); expect((await readSettings(page)).rivers).toHaveLength(0);
  await page.locator('#redoRiver').click(); expect((await readSettings(page)).rivers).toHaveLength(1);
  await page.locator('.steps button[data-step="5"]').click();
  await expect(page.locator('.wind-toolbar #undoWind')).toBeVisible();
  await expect(page.locator('.wind-toolbar [data-edit-tool="paint"]')).toBeVisible();
  await expect(page.locator('.wind-toolbar #windEditU')).toBeVisible();
});

test('terrain source comes first, input errors appear above content, and toolbars stick while scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#settingsForm fieldset').first()).toContainText('地形の選択');
  await expect(page.locator('#settingsForm fieldset').nth(1)).toContainText('計算格子');
  await page.locator('#terrainSourceMode').selectOption('external');
  await expect(page.locator('#terrainImport')).toBeVisible();
  await page.locator('#terrainSourceMode').selectOption('packaged');
  await page.locator('[data-path="grid.nx"]').fill('2'); await page.locator('[data-path="grid.nx"]').press('Tab');
  await expect(page.locator('[data-check-step="0"]')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('[data-check-step="0"]')).toContainText('01海底地形');
  await expect(page.locator('[data-check-step="0"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.steps [data-step="0"]')).toHaveText('');
  await expect(page.locator('#inputCheckDialog')).not.toBeVisible();
  await page.locator('[data-check-step="0"]').click();
  await expect(page.locator('#errorSummary')).toContainText('X格子数');
  await page.locator('#inputCheckDialog').getByRole('button', { name: '閉じる' }).click();
  await page.locator('[data-path="grid.nx"]').fill('48'); await page.locator('[data-path="grid.nx"]').press('Tab');
  await expect(page.locator('#errorSummary')).toBeHidden();
  await expect(page.locator('[data-check-step="0"]')).not.toHaveAttribute('data-state', 'error');
  await expect(page.locator('[data-check-step="4"]')).toHaveAttribute('data-state', 'ok');
  const sticky = await page.evaluate(() => {
    const pane = document.querySelector('.workspace'), toolbar = document.querySelector('.view-toolbar');
    pane.scrollTop = 100; const a = toolbar.getBoundingClientRect().top;
    pane.scrollTop = 200; const b = toolbar.getBoundingClientRect().top;
    return { a, b, position: getComputedStyle(toolbar).position };
  });
  expect(sticky.position).toBe('sticky'); expect(Math.abs(sticky.a - sticky.b)).toBeLessThan(1);
});

test('calculation status is icon-labelled next to the results heading', async ({ page }) => {
  await page.goto('/'); const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' }); c.numerics.maxSteps = 10; await loadSettings(page, c);
  await page.locator('.steps button[data-step="6"]').click();
  await expect(page.locator('.result-heading #runStateBadge')).toContainText('未計算');
  await expect(page.locator('#runStateBadge svg')).toBeVisible();
  await expect(page.locator('[data-path="numerics.rotationMode"]')).toHaveValue('latitude');
  await expect(page.locator('#settingsForm .rotation-formula')).toBeHidden();
  await page.locator('.calculation-group[data-group="コリオリ力"]>summary').click();
  await page.locator('[data-path="numerics.rotationPlane"]').selectOption('f');
  await expect(page.locator('.rotation-values')).toContainText('0.0000e+0');
  await expect(page.locator('#computation')).toBeHidden();
  await expect(page.locator('.main-scene-tools [data-view="3d"]')).toBeVisible();
  await expect(page.locator('.main-scene-tools #vectorToggle')).toBeVisible();
  await expect(page.locator('.result-heading #resultLevelMode')).toBeVisible();
  await expect(page.locator('.section-tools #sectionPinSeriesToggle')).toBeVisible();
  await expect(page.locator('.result-heading #compactRunMetrics')).toBeVisible();
  await page.locator('#resultLayerNumber').fill('2');
  await expect(page.locator('#resultLayerRange')).toHaveValue('2');
  await expect(page.locator('#layerSelect')).toHaveValue(String(c.grid.nz - 2));
  await expect(page.locator('#resultLayerDepth')).toContainText('海面下');
  await page.locator('#calculateButton').click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了', { timeout: 30000 });
  await expect(page.locator('#runStateBadge')).toHaveAttribute('data-state', 'completed');
  await page.screenshot({ path: 'test-results/results-state-badge.png' });
});
