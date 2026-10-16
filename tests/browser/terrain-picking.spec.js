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
    const initialPicks=[...picks];
    view.sectionPoint=()=>({inside:true,near:true,row:4});view.editTool='dig';view.setEditing(true);
    view.renderer.domElement.setPointerCapture=()=>{};
    view.renderer.domElement.dispatchEvent(new PointerEvent('pointerdown',{...events[0],pointerId:1,bubbles:true}));
    const editNearSectionLine=picks.length===initialPicks.length+1&&!view.sectionDragging;
    view.set(fields,'h',0,'map',4,false);view.setEditing(true);canvas.setPointerCapture=()=>{};
    const r=canvas.getBoundingClientRect(),rect=view.rect;
    const count=picks.length;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+rect.x+rect.width*.5,clientY:r.top+rect.y+rect.height*.5,button:0,buttons:1,pointerId:2,bubbles:true}));
    const mapEditNearSectionLine=picks.length===count+1&&!view.sectionDragging;
    canvas.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:2}));const released=picks.at(-1)===null;
    host.remove();return {before,after,picks:initialPicks,editNearSectionLine,mapEditNearSectionLine,released};
  });
  expect(result.before.every(Number.isInteger)).toBe(true);
  expect(result.after).toEqual(result.before);expect(result.picks).toEqual(result.before);
  expect(result.editNearSectionLine).toBe(true);expect(result.mapEditNearSectionLine).toBe(true);expect(result.released).toBe(true);
});
