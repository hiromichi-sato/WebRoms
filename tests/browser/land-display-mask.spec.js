import {test,expect,loadSettings,readSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';
test('N03 display mask toggles on map and 3D without changing terrain',async({page})=>{
  await page.goto('/');const config=fixture();
  Object.assign(config.grid,{nx:16,ny:16,preset:'uniform',geoBounds:{west:140.72,east:140.76,south:40.825,north:40.85},geoSource:'test'});
  await loadSettings(page,config);const before=await readSettings(page);
  await expect(page.locator('#n03LandColor')).toHaveValue('#ffdead');
  await page.locator('#n03LandToggle').check();
  await page.locator('#n03LandColor').fill('#f01234');
  await expect(page.locator('#n03LandColor')).toHaveValue('#f01234');
  await expect.poll(()=>page.locator('#threeView').getAttribute('data-n03-land-cells')).toMatch(/^[1-9]/);
  await page.locator('[data-view="map"]').click();
  await expect.poll(()=>page.locator('#mapCanvas').getAttribute('data-n03-land-cells')).toMatch(/^[1-9]/);
  expect(await page.locator('#mapCanvas').evaluate(canvas=>{
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]===240&&pixels[i+1]===18&&pixels[i+2]===52)count++;
    return count;
  })).toBeGreaterThan(0);
  await page.locator('#n03LandToggle').uncheck();
  await expect(page.locator('#threeView')).toHaveAttribute('data-n03-land-cells','0');
  expect((await readSettings(page)).grid).toEqual(before.grid);
});
