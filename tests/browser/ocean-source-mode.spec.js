import { test, expect, loadSettings } from './app-fixture.js';
import { fixture } from '../runtime-helper.mjs';

test('external forcing inputs stay hidden until explicitly selected',async({page})=>{
  await page.goto('/');const config=fixture();
  config.ocean={tideMode:'auto',seaLevelEnabled:true};
  await loadSettings(page,config);await page.locator('[data-step="3"]').click();
  await expect(page.locator('#tideSourceMode')).toHaveValue('bundled');
  await expect(page.locator('#seaLevelSourceMode')).toHaveValue('bundled');
  for(const id of ['tideImport','tideRequest','seaLevelImport','seaLevelKind','seaLevelNetcdf','seaLevelShape'])await expect(page.locator('#'+id)).toBeHidden();
  await page.locator('#tideSourceMode').selectOption('external');
  await expect(page.locator('#tideImport')).toBeVisible();await expect(page.locator('#tideRequest')).toBeVisible();
  await expect(page.locator('#seaLevelImport')).toBeHidden();
  await page.locator('#seaLevelSourceMode').selectOption('external');
  for(const id of ['seaLevelImport','seaLevelKind','seaLevelNetcdf','seaLevelShape'])await expect(page.locator('#'+id)).toBeVisible();
  await page.locator('[data-step="2"]').click();await page.locator('[data-step="3"]').click();
  await expect(page.locator('#tideSourceMode')).toHaveValue('external');
  await expect(page.locator('#seaLevelSourceMode')).toHaveValue('external');
});
