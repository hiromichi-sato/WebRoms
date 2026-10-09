import { test, expect } from '@playwright/test';

async function drag(page, canvas) {
  await canvas.scrollIntoViewIfNeeded();
  const r = await canvas.boundingBox();
  await page.mouse.move(r.x + r.width * 0.45, r.y + r.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * 0.3, r.y + r.height * 0.4, { steps: 12 });
  await page.mouse.up();
}
const pixels = canvas => canvas.evaluate(c => c.toDataURL());

test('all ocean stages pan without editing, including map, sections and wind', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('#panView').click();
  await expect(page.locator('#panView')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#panView svg')).toBeVisible();
  for (const step of [0, 2, 3, 4, 6]) {
    await page.locator(`.steps [data-step="${step}"]`).click();
    if (step !== 3) await page.locator('[data-view="3d"]').click();
    await page.locator('#zoomIn').click();
    const canvas = page.locator('#threeView canvas');
    const before = await pixels(canvas);
    const config = await page.evaluate(() => localStorage.getItem('webroms.project.v1'));
    await drag(page, canvas);
    expect(await pixels(canvas)).not.toBe(before);
    expect(await page.evaluate(() => localStorage.getItem('webroms.project.v1'))).toBe(config);
    await page.locator('#homeView').click();
  }
  await page.locator('.steps [data-step="2"]').click();
  await page.locator('#panView').click();
  for (const mode of ['map', 'section']) {
    await page.locator(`[data-view="${mode}"]`).click();
    await page.locator('#zoomIn').click();
    const canvas = page.locator('#mapCanvas'), before = await pixels(canvas);
    await drag(page, canvas); expect(await pixels(canvas)).not.toBe(before);
    await page.locator('#homeView').click();
  }
  await page.locator('#sectionZoomIn').click();
  const section = page.locator('#sectionCanvas'), beforeSection = await pixels(section);
  await drag(page, section); expect((await pixels(section)) !== beforeSection).toBe(true);
  await page.locator('.steps [data-step="5"]').click();
  await page.locator('#windZoomIn').click();
  const wind = page.locator('#windCanvas'), beforeWind = await pixels(wind);
  await drag(page, wind); expect(await pixels(wind)).not.toBe(beforeWind);
  await page.screenshot({ path: 'test-results/navigation-wind.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.steps [data-step="0"]').click();
  await page.locator('[data-view="3d"]').click();
  await page.locator('#panView').click();
  await page.locator('#zoomIn').click();
  const mobile = page.locator('#threeView canvas'), beforeMobile = await pixels(mobile);
  await drag(page, mobile); expect(await pixels(mobile)).not.toBe(beforeMobile);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/navigation-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
