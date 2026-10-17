import {test,expect} from './app-fixture.js';

test('2D GPU overlay shares 3D buffers and preserves holes, zoom and pan alignment',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const [{OceanView},{defaults,buildFields},{installLandVectorOverlay}]=await Promise.all([import('/src/view.js'),import('/src/model.js'),import('/src/land-vector-overlay.js')]);
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:800px;height:600px;z-index:9999';
    const container=document.createElement('div'),canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';host.append(container,canvas);document.body.append(host);
    const view=new OceanView(container,canvas,()=>{});installLandVectorOverlay(view);
    const c=defaults();Object.assign(c.grid,{nx:16,ny:16,preset:'uniform'});
    const bounds={west:0,east:1,south:0,north:1};
    view.landDisplayBounds=bounds;view.showN03Land=true;view.landDisplayColor='#f01234';
    view.landDisplayPolygons=[{outer:[[.1,.1],[.9,.1],[.9,.9],[.1,.9]],holes:[[[.4,.4],[.4,.6],[.6,.6],[.6,.4]]]}];
    view.coastlineBounds=bounds;view.coastlineSegments=[[[0,0],[0,1]]];
    view.set(buildFields(c),'h',0,'map',0);view.resize();
    const sample=(lon,lat)=>{
      const source=view.mapVectorRenderer.domElement,scratch=document.createElement('canvas');scratch.width=source.width;scratch.height=source.height;
      const ctx=scratch.getContext('2d');ctx.drawImage(source,0,0);
      const r=view.rect,dpr=view.mapVectorRenderer.getPixelRatio();
      const x=(r.x+(lon*15+.5)/16*r.width)*dpr,y=(r.y+(1-(lat*15+.5)/16)*r.height)*dpr;
      return [...ctx.getImageData(Math.floor(x),Math.floor(y),1,1).data];
    };
    const shared=view.mapVectorScene.children.every(child=>child.geometry===(child.isMesh?view.landOverlayMesh:view.coastlineMesh).geometry);
    const before={land:sample(.25,.5),hole:sample(.5,.5),sea:sample(.05,.5)};
    const renderer=view.mapVectorRenderer;
    const colors=view.mapCellColors;
    view.zoom(1);view.mapPanX=37;view.mapPanY=-19;view.draw();
    const after={land:sample(.25,.5),hole:sample(.5,.5),sea:sample(.05,.5)};
    view.mode='3d';view.draw();const hidden=renderer.domElement.hidden;
    view.mode='map';view.draw();const reused=renderer===view.mapVectorRenderer;
    const passive=renderer.domElement.style.pointerEvents;
    return {shared,before,after,hidden,reused,passive,reusedColors:colors===view.mapCellColors,backend:canvas.dataset.mapOverlayBackend};
  });
  expect(result.shared).toBe(true);expect(result.backend).toBe('webgl');
  expect(result.before.land).toEqual([240,18,52,255]);expect(result.before.hole[3]).toBe(0);expect(result.before.sea[3]).toBe(0);
  expect(result.after).toEqual(result.before);expect(result.hidden).toBe(true);expect(result.reused).toBe(true);expect(result.passive).toBe('none');
  expect(result.reusedColors).toBe(true);
});
