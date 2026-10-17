import {test,expect,loadSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';

test('F11 and fullscreen-like resizes do not change workflow or start a run',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(let step=0;step<8;step++) {
    await page.locator(`.steps [data-step="${step}"]`).click();
    const title=await page.locator('#stepTitle').textContent();
    const viewMode=await page.locator('[data-view][aria-pressed="true"]').getAttribute('data-view');
    const input=page.locator('#settingsForm input[type="number"]:visible').first();
    if(await input.count())await input.focus();
    await page.keyboard.press('F11');
    await page.setViewportSize({width:1180,height:740});
    await expect(page.locator('#stepTitle')).toHaveText(title);
    await expect(page.locator(`[data-view="${viewMode}"]`)).toHaveAttribute('aria-pressed','true');
    await page.setViewportSize({width:1440,height:1000});
    await page.keyboard.press('F11');
    await expect(page.locator('#stepTitle')).toHaveText(title);
    await expect(page.locator('#convergence')).not.toHaveText('計算中');
    await page.waitForTimeout(450);
  }
  expect(errors).toEqual([]);
});

test('F11 transition rejects accidental navigation from terrain to calculation',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());
  await page.keyboard.down('F11');
  await page.locator('[data-view="map"]').dispatchEvent('click');
  await expect(page.locator('[data-view="3d"]')).toHaveAttribute('aria-pressed','true');
  await page.locator('.steps [data-step="6"]').dispatchEvent('click');
  await expect(page.locator('#stepTitle')).toHaveText('海底地形');
  await page.keyboard.up('F11');await page.waitForTimeout(450);
  await page.locator('.steps [data-step="6"]').click();
  await expect(page.locator('#stepTitle')).toHaveText('定常計算');
});

test('cancelling crop restores 3D or map according to the original view',async({page})=>{
  await page.goto('/');await loadSettings(page,fixture());
  for(const mode of ['3d','map']) {
    await page.locator(`[data-view="${mode}"]`).click();
    await page.locator('#cropTerrain').click();
    await expect(page.locator('#interpolationStatus')).toBeHidden();
    await expect(page.locator('[data-view="map"]')).toHaveAttribute('aria-pressed','true');
    await page.locator('#cancelTerrainCrop').click();
    await expect(page.locator('#interpolationStatus')).toBeHidden();
    await expect(page.locator(`[data-view="${mode}"]`)).toHaveAttribute('aria-pressed','true');
  }
});
