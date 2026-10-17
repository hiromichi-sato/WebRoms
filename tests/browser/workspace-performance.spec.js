import {test,expect,loadSettings} from './app-fixture.js';
import {fixture} from '../runtime-helper.mjs';

test('03 through 06 avoid duplicate or hidden ocean scene updates',async({page})=>{
  await page.goto('/');const config=fixture('uniform');
  Object.assign(config.grid,{nx:16,ny:16,preset:'uniform'});
  await loadSettings(page,config);
  await page.evaluate(async()=>{
    const {OceanView}=await import('/src/view.js');
    window.sceneUpdates=[];
    const set=OceanView.prototype.set,rivers=OceanView.prototype.setRivers;
    OceanView.prototype.set=function(...args){window.sceneUpdates.push('set');return set.apply(this,args);};
    OceanView.prototype.setRivers=function(...args){window.sceneUpdates.push(args[1]?.defer?'deferred-rivers':'immediate-rivers');return rivers.apply(this,args);};
  });
  for(const step of [2,3,4,5]){
    await page.evaluate(()=>{window.sceneUpdates=[];});
    await page.locator(`.steps [data-step="${step}"]`).click();
    const updates=await page.evaluate(()=>window.sceneUpdates);
    expect(updates.filter(x=>x==='immediate-rivers')).toHaveLength(0);
    expect(updates.filter(x=>x==='set')).toHaveLength(step===5?0:1);
  }
  await expect(page.locator('#windCanvas')).toBeVisible();
});
