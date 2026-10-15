import * as THREE from 'three';
import { clipLandTriangle } from './land-display-mask.js';

export function buildLandOverlay3d(view) {
  const f=view.fields,positions=[],bounds=view.landDisplayBounds;
  if(view.showN03Land&&bounds)for(const {outer,holes} of view.landDisplayPolygons??[]) {
    const points=[...outer,...holes.flat()];
    const triangles=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(...p)),holes.map(r=>r.map(p=>new THREE.Vector2(...p))));
    const extent=Math.max(f.nx*f.dx,f.ny*f.dy),width=10*f.nx*f.dx/extent,height=10*f.ny*f.dy/extent;
    for(const triangle of triangles) {
      const clipped=clipLandTriangle(triangle.map(i=>points[i]),bounds);
      for(let i=1;i<clipped.length-1;i++)for(const [lon,lat] of [clipped[0],clipped[i],clipped[i+1]]) {
        const u=((lon-bounds.west)/(bounds.east-bounds.west)*(f.nx-1)+.5)/f.nx,v=((lat-bounds.south)/(bounds.north-bounds.south)*(f.ny-1)+.5)/f.ny;
        positions.push((u-.5)*width,.09,(.5-v)*height);
      }
    }
  }
  if(positions.length) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const material=new THREE.MeshBasicMaterial({color:view.landDisplayColor??'#ffdead',side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    // Transparent queue renders after opaque arrows and terrain, regardless of depth.
    material.transparent=true;material.opacity=1;
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=100000;view.group.add(mesh);
  }
  view.container.dataset.n03LandCells=String(positions.length/9);
}

export function drawLandOverlay2d(view) {
  const f=view.fields,b=view.landDisplayBounds,r=view.rect,ctx=view.canvas.getContext('2d');
  const active=view.mode==='map'&&view.showN03Land&&b&&r&&view.landDisplayPolygons?.length;
  view.canvas.dataset.n03LandCells=String(active?view.landDisplayPolygons.length:0);
  if(!active)return;
  const dpr=devicePixelRatio,x0=r.x*dpr,y0=r.y*dpr,rw=r.width*dpr,rh=r.height*dpr;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(x0+.5/f.nx*rw,y0+.5/f.ny*rh,(f.nx-1)/f.nx*rw,(f.ny-1)/f.ny*rh);ctx.clip();ctx.fillStyle=view.landDisplayColor??'#ffdead';
  for(const {outer,holes} of view.landDisplayPolygons) {
    ctx.beginPath();
    for(const ring of [outer,...holes]) {
      ring.forEach(([lon,lat],i)=>{const x=x0+((lon-b.west)/(b.east-b.west)*(f.nx-1)+.5)/f.nx*rw,y=y0+(1-((lat-b.south)/(b.north-b.south)*(f.ny-1)+.5)/f.ny)*rh;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();
    }ctx.fill('evenodd');
  }ctx.restore();
}

export function installLandVectorOverlay(view) {
  const rebuild=view.rebuild.bind(view),draw=view.draw.bind(view);
  view.rebuild=()=>{rebuild();buildLandOverlay3d(view);};
  view.draw=()=>{draw();if(view.fields)drawLandOverlay2d(view);};
}
