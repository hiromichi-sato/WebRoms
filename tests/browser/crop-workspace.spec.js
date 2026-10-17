import {test,expect,loadSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';

for(const width of [1440,390])test(`crop workspace separates large toolbar and map at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.goto('/');
  const c=fixture('uniform');Object.assign(c.grid,{nx:32,ny:24});await loadSettings(page,c);
  await page.locator('#cropTerrain').click();
  const overlay=page.locator('#terrainCropOverlay'),tools=page.locator('.terrain-crop-actions');
  await expect(overlay).toBeVisible();
  const map=await overlay.boundingBox(),bar=await tools.boundingBox();
  expect(map.width).toBeGreaterThan(width*.9);expect(map.height).toBeGreaterThan(500);
  expect(bar.y+bar.height).toBeLessThanOrEqual(map.y+2);
  expect(bar.x).toBeGreaterThanOrEqual(0);expect(bar.x+bar.width).toBeLessThanOrEqual(width);
  await page.screenshot({path:testInfo.outputPath('crop-workspace.png')});
  await page.locator('#cancelTerrainCrop').click();
  await expect(page.locator('#viewport')).not.toHaveClass(/terrain-crop-expanded/);
  await expect(overlay).toBeHidden();
});

test('cropping prepared N03 display does not reload tiles',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {prepareLandDisplay}=await import('/src/land-display-mask.js');
    const bounds={west:140.72,east:140.76,south:40.825,north:40.85};
    await prepareLandDisplay(bounds);
    const cropped=await prepareLandDisplay({west:140.73,east:140.75,south:40.83,north:40.845});
    return {reused:cropped.reused,bytes:cropped.bytes,length:cropped.triangles.length};
  });
  expect(result).toMatchObject({reused:true,bytes:0});expect(result.length).toBeGreaterThan(0);
});
