import { test, expect, loadSettings } from './app-fixture.js';
import { defaults } from '../../src/model.js';

for (const width of [1280, 390]) {
  test(`stage changes reset scroll and forcing options follow checkboxes (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open' });
    await page.goto('/'); await loadSettings(page, c);
    await page.locator('[data-step="2"]').click();
    await page.evaluate(() => { document.querySelector('.settings').scrollTop = 100000; window.scrollTo(0, document.body.scrollHeight); });
    await page.locator('#nextButton').click();
    await expect(page.locator('body')).toHaveAttribute('data-step', '3');
    expect(await page.evaluate(() => [window.scrollY, document.querySelector('.settings').scrollTop, document.querySelector('#settingsForm').scrollTop])).toEqual([0, 0, 0]);
    await expect(page.locator('#tideEnabled')).not.toBeChecked();
    await expect(page.locator('#tideOptions')).toBeHidden();
    await expect(page.locator('#seaLevelOptions')).toBeHidden();
    await page.locator('#tideEnabled').check(); await expect(page.locator('#tideOptions')).toBeVisible();
    await expect(page.locator('#seaLevelOptions')).toBeHidden();
    await page.locator('#tideEnabled').uncheck(); await expect(page.locator('#tideOptions')).toBeHidden();
    await page.locator('#seaLevelEnabled').check(); await expect(page.locator('#seaLevelOptions')).toBeVisible();
    await expect(page.locator('#tideOptions')).toBeHidden();
    await page.locator('#seaLevelEnabled').uncheck(); await expect(page.locator('#seaLevelOptions')).toBeHidden();
    await page.locator('#previousButton').click();
    expect(await page.evaluate(() => [window.scrollY, document.querySelector('.settings').scrollTop])).toEqual([0, 0]);
  });
}
