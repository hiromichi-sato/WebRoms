import {test,expect} from '@playwright/test';

test('3D terrain remains pickable under coastline and N03 overlays',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const [{OceanView},{defaults,buildFields},THREE,{installLandVectorOverlay}]=await Promise.all([import('/src/view.js'),import('/src/model.js'),import('/vendor/three/three.module.js'),import('/src/land-vector-overlay.js')]);
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:99999';document.body.append(host);
    const canvas=document.createElement('canvas');host.append(canvas);
    const config=defaults();Object.assign(config.grid,{nx:8,ny:8,preset:'uniform',minDepth:50,maxDepth:50,edits:{27:0}});
    const fields=buildFields(config),picks=[],view=new OceanView(host,canvas,p=>picks.push(p));installLandVectorOverlay(view);
    view.set(fields,'h',0,'3d',4,false);view.resize();
    const events=[27,28].map(p=>{
      const point=new THREE.Vector3((p%8+.5)*10/8-5,fields.mask[p]?-2.2:.04,5-(Math.floor(p/8)+.5)*10/8).project(view.camera),r=view.renderer.domElement.getBoundingClientRect();
      return {clientX:r.left+(point.x+1)*r.width/2,clientY:r.top+(1-point.y)*r.height/2,button:0,buttons:1};
    });
    const before=events.map(e=>view.hitAt3d(e)?.p);
    view.coastlineBounds={west:0,east:1,south:0,north:1};view.coastlineSegments=[[[0,0],[1,1]]];
    view.landDisplayBounds=view.coastlineBounds;view.showN03Land=true;view.landDisplayPolygons=[{outer:[[0,0],[1,0],[1,1],[0,1]],holes:[]}];
    view.rebuild();view.draw();
    const after=events.map(e=>view.hitAt3d(e)?.p);events.forEach(e=>view.paint3d(e));
    host.remove();return {before,after,picks};
  });
  expect(result.before.every(Number.isInteger)).toBe(true);
  expect(result.after).toEqual(result.before);expect(result.picks).toEqual(result.before);
});
