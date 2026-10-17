import {test,expect,loadSettings,readSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';

test('coastline preparation also prepares land; toggles reuse the same worker result',async({page})=>{
  await page.route('**/assets/coastlines/n03-2026/display/index.json',async route=>{
    await new Promise(resolve=>setTimeout(resolve,800));await route.continue();
  });
  await page.goto('/');const c=fixture();
  Object.assign(c.grid,{nx:16,ny:16,preset:'uniform',geoBounds:{west:140.72,east:140.76,south:40.825,north:40.85},geoSource:'test'});
  const worker=page.waitForEvent('worker',{predicate:w=>w.url().endsWith('/land-display-worker.js')});
  await loadSettings(page,c);await worker;
  await page.locator('#n03LandToggle').check();
  await expect(page.locator('#n03LandStatus')).toBeVisible();
  await page.locator('#n03LandToggle').uncheck();
  await expect(page.locator('#n03LandStatus')).toBeHidden();
  await expect.poll(()=>page.locator('#threeView').getAttribute('data-coastline-segments')).toMatch(/^[1-9]/);
  await expect(page.locator('#threeView')).toHaveAttribute('data-n03-land-cells','0');
  let newWorkers=0,newRequests=0;page.on('worker',()=>newWorkers++);page.on('request',request=>{if(request.url().includes('/coastlines/'))newRequests++;});
  await page.locator('#n03LandToggle').check();
  await expect.poll(()=>page.locator('#threeView').getAttribute('data-n03-land-cells')).toMatch(/^[1-9]/);
  await expect(page.locator('#n03LandStatus')).toBeHidden();
  expect(newWorkers).toBe(0);
  expect(newRequests).toBe(0);
});
for(const width of [1280,390])test(`N03 display mask toggles on map and 3D without changing terrain at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
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
  await expect(page.locator('#mapCanvas')).toHaveAttribute('data-map-overlay-backend','webgl');
  expect(await page.locator('.map-vector-overlay').evaluate(source=>{
    const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]===240&&pixels[i+1]===18&&pixels[i+2]===52)count++;
    return count;
  })).toBeGreaterThan(0);
  await page.screenshot({path:testInfo.outputPath('n03-gpu-map.png'),fullPage:true});
  await page.locator('#n03LandToggle').uncheck();
  await expect(page.locator('#threeView')).toHaveAttribute('data-n03-land-cells','0');
  expect((await readSettings(page)).grid).toEqual(before.grid);
});
