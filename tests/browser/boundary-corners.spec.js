import {test,expect,loadSettings,readSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';

test('boundary section uses matched corner values while JSON retains inputs',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');const c=fixture();Object.assign(c.grid,{nx:12,ny:12,preset:'uniform'});
  for(const [side,temp] of Object.entries({west:10,south:30,east:20,north:20})){
    const b=c.boundary[side];b.mode='specified';b.fromInitial=false;b.layers.forEach(l=>l.temp=temp);
  }
  await loadSettings(page,c);
  await page.evaluate(async()=>{
    const {OceanView}=await import('/src/view.js'),set=OceanView.prototype.setCompanion;
    OceanView.prototype.setCompanion=function(mode,options,...args){if(mode==='boundary')window.displayBoundary=structuredClone(options.boundary);return set.call(this,mode,options,...args);};
  });
  await page.locator('[data-step="3"]').click();
  expect(await page.evaluate(()=>window.displayBoundary.painted.temp[0][0])).toBe(20);
  await page.locator('[data-boundary-side="south"]').click();
  expect(await page.evaluate(()=>window.displayBoundary.painted.temp[0][0])).toBe(20);
  const saved=await readSettings(page);expect(saved.boundary.west.layers[0].temp).toBe(10);expect(saved.boundary.south.layers[0].temp).toBe(30);
  expect(errors).toEqual([]);
});
