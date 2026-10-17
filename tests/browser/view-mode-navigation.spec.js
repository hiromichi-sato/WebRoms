import {test,expect,loadSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';

for(const width of [1440,390])test(`map button does not jump to step 07 at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});await page.goto('/');await loadSettings(page,fixture());
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const step of [0,2,3,4,6,7]) {
    await page.locator(`.steps [data-step="${step}"]`).click();
    const title=await page.locator('#stepTitle').textContent();
    for(const mode of ['map','3d','map']) {
      await page.locator(`[data-view="${mode}"]`).click();
      await expect(page.locator('#stepTitle')).toHaveText(title);
      await expect(page.locator(`[data-view="${mode}"]`)).toHaveAttribute('aria-pressed','true');
      await expect(page.locator(mode==='map'?'#mapCanvas':'#threeView')).toBeVisible();
      await expect(page.locator('#convergence')).not.toHaveText('計算中');
    }
  }
  expect(errors).toEqual([]);
});
