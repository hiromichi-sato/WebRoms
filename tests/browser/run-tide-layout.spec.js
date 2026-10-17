import { test, expect, loadSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

function tideConfig() {
  const config = fixture(); config.grid.geoBounds = { west: 135, east: 136, south: 34, north: 35 };
  for (const boundary of Object.values(config.boundary)) boundary.mode = 'specified';
  config.ocean = { tideMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45 };
  return config;
}

test('full-period tide graph sits below the section and panes resize across steps', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 }); await page.goto('/');
  const config = tideConfig(); config.numerics.dt = 60; config.numerics.maxSteps = 43200;
  await loadSettings(page, config); await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('#tideInfo')).toHaveCount(0);
  const panel = page.locator('#runTidePanel'), chart = panel.locator('.run-tide-chart');
  await expect(panel).toBeVisible(); await expect(panel.locator('polyline')).toHaveCount(4);
  await expect(chart).toHaveAttribute('data-end', '2592000');
  await expect.poll(() => chart.evaluate(el => Math.abs(el.viewBox.baseVal.width - el.clientWidth))).toBeLessThan(2);
  const chartWidth = (await chart.boundingBox()).width;
  expect((await panel.locator('polyline').first().boundingBox()).width).toBeGreaterThan(chartWidth * .8);
  expect(new Set(await panel.locator('polyline').evaluateAll(lines => lines.map(line => line.getAttribute('stroke-dasharray')))).size).toBe(4);
  const section = await page.locator('.secondary-scene').boundingBox();
  expect((await panel.boundingBox()).y).toBeGreaterThanOrEqual(section.y + section.height);
  const column = await page.locator('#companionColumn').boundingBox();
  expect(section.height).toBeCloseTo(column.height / 2, 0);
  const heightHandle = page.locator('#sectionHeightResizer');
  const heightBounds = await heightHandle.boundingBox();
  await page.mouse.move(heightBounds.x + 35, heightBounds.y + 5); await page.mouse.down();
  await page.mouse.move(heightBounds.x + 35, heightBounds.y + 65, { steps: 5 }); await page.mouse.up();
  expect((await page.locator('.secondary-scene').boundingBox()).height).toBeGreaterThan(section.height + 40);
  await heightHandle.dblclick();
  expect((await page.locator('.secondary-scene').boundingBox()).height).toBeCloseTo(column.height / 2, 0);
  await panel.getByRole('button', { name: '境界潮位を拡大', exact: true }).click();
  await expect(chart).toHaveAttribute('data-start', '648000');
  await panel.getByRole('button', { name: '境界潮位を全期間表示', exact: true }).click();
  await expect(chart).toHaveAttribute('data-start', '0');
  const settings = page.locator('.settings'), old = await settings.boundingBox();
  let handle = await page.locator('#settingsResizer').boundingBox();
  await page.mouse.move(handle.x + 5, handle.y + 30); await page.mouse.down();
  await page.mouse.move(handle.x + 85, handle.y + 30, { steps: 5 }); await page.mouse.up();
  expect((await settings.boundingBox()).width).toBeGreaterThan(old.width + 60);
  const viewport = page.locator('#viewport'), initialWidth = (await viewport.boundingBox()).width;
  handle = await page.locator('#sceneResizer').boundingBox();
  await page.mouse.move(handle.x + 5, handle.y + 30); await page.mouse.down();
  await page.mouse.move(handle.x - 65, handle.y + 30, { steps: 5 }); await page.mouse.up();
  expect((await viewport.boundingBox()).width).toBeLessThan(initialWidth - 40);
  const adjustedWidth = (await settings.boundingBox()).width;
  for (let step = 0; step < 8; step++) {
    await page.locator(`.steps [data-step="${step}"]`).click();
    await expect(page.locator('#settingsResizer')).toBeVisible();
    expect((await settings.boundingBox()).width).toBeCloseTo(adjustedWidth, 0);
  }
  await page.locator('.steps [data-step="6"]').click();
  await page.locator('#sceneResizer').dblclick(); await page.locator('#settingsResizer').dblclick();
  await page.screenshot({ path: 'test-results/run-tide-resizable-desktop.png', fullPage: true });
});

for (const width of [1280, 390]) test(`without tides the section fills its column at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  await loadSettings(page, fixture());
  for (const step of [0, 2, 3, 6]) {
    await page.locator(`.steps [data-step="${step}"]`).click();
    await expect(page.locator('#runTidePanel')).toBeHidden();
    await expect(page.locator('#sectionHeightResizer')).toBeHidden();
    const column = await page.locator('#companionColumn').boundingBox();
    const section = await page.locator('.secondary-scene').boundingBox();
    expect(section.height).toBeCloseTo(column.height, 0);
    const canvas = page.locator('#sectionCanvas');
    await expect.poll(() => canvas.evaluate(el => el.height)).toBeGreaterThan(100);
  }
  await page.screenshot({ path: `test-results/section-full-height-${width}.png`, fullPage: true });
});

test('current-time marker follows calculation, stop and completion on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const config = tideConfig(); config.numerics.maxSteps = 100000;
  await loadSettings(page, config); await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('#settingsResizer')).toBeHidden();
  const marker = page.locator('.run-tide-time-marker');
  await expect(marker).toHaveAttribute('data-time', '0');
  await page.locator('#calculateButton').click();
  await expect.poll(async () => Number(await marker.getAttribute('data-time'))).toBeGreaterThan(0);
  await expect(marker).toContainText('計算中');
  await page.locator('#calculateButton').click();
  await expect(page.locator('#resumeCalculation')).toBeEnabled();
  await expect(marker).toContainText('停止中');
  const stopped = Number(await marker.getAttribute('data-time')); expect(stopped).toBeGreaterThan(0);
  await page.locator('#runTidePanel').screenshot({ path: 'test-results/run-tide-marker-mobile.png' });
  // Recalculation uses a short, newly specified period and finishes at its end.
  await page.locator('[data-path="numerics.maxSteps"]').fill('20');
  await page.locator('[data-path="numerics.maxSteps"]').dispatchEvent('change');
  await page.locator('#recalculateButton').click();
  await page.locator('#runConfirmDialog').getByRole('button', { name: '再計算する', exact: true }).click();
  await expect(page.locator('#runStateBadge')).toContainText('計算完了');
  await expect(marker).toHaveAttribute('data-time', String(config.numerics.dt * 20));
  await expect(marker).toContainText('計算終了');
  await expect(page.locator('.run-tide-chart')).toHaveAttribute('data-end', String(config.numerics.dt * 20));
});
