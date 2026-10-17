import * as THREE from '../vendor/three/three.module.js';
import { clipLandTriangle } from './land-display-mask.js';
import {prepareGpuMapOverlay,drawGpuMapOverlay} from './map-vector-overlay.js';
const geometryCache=new WeakMap();
const worldCache=new WeakMap();

// Keep clipped geographic triangles across scene rebuilds and time steps.
export function landOverlayTriangles(polygons,bounds) {
  if(polygons instanceof Float32Array)return polygons;
  if(!polygons||!bounds)return new Float32Array();
  const key=JSON.stringify(bounds);
  let entries=geometryCache.get(polygons);
  if(!entries){entries=new Map();geometryCache.set(polygons,entries);}
  if(entries.has(key))return entries.get(key);
  const positions=[];
  for(const {outer,holes} of polygons) {
    if(outer.every(p=>p[0]<bounds.west)||outer.every(p=>p[0]>bounds.east)||outer.every(p=>p[1]<bounds.south)||outer.every(p=>p[1]>bounds.north))continue;
    const points=[...outer,...holes.flat()];
    const triangles=THREE.ShapeUtils.triangulateShape(outer.map(p=>new THREE.Vector2(...p)),holes.map(r=>r.map(p=>new THREE.Vector2(...p))));
    for(const triangle of triangles) {
      const vertices=triangle.map(i=>points[i]);
      if(vertices.every(p=>p[0]<bounds.west)||vertices.every(p=>p[0]>bounds.east)||vertices.every(p=>p[1]<bounds.south)||vertices.every(p=>p[1]>bounds.north))continue;
      const clipped=clipLandTriangle(vertices,bounds);
      for(let i=1;i<clipped.length-1;i++)for(const [lon,lat] of [clipped[0],clipped[i],clipped[i+1]])positions.push((lon-bounds.west)/(bounds.east-bounds.west),(lat-bounds.south)/(bounds.north-bounds.south));
    }
  }
  const result=new Float32Array(positions);
  if(entries.size>=4)entries.delete(entries.keys().next().value);
  entries.set(key,result);return result;
}

export function buildLandOverlay3d(view) {
  view.landOverlayMesh=null;
  const f=view.fields,bounds=view.landDisplayBounds;
  let positions=new Float32Array();
  if(view.showN03Land&&bounds) {
    const triangles=landOverlayTriangles(view.landDisplayTriangles??view.landDisplayPolygons,bounds);
    const extent=Math.max(f.nx*f.dx,f.ny*f.dy),width=10*f.nx*f.dx/extent,height=10*f.ny*f.dy/extent;
    const key=JSON.stringify([f.nx,f.ny,width,height]);
    let cached=worldCache.get(triangles);
    if(cached?.key===key)positions=cached.positions;
    else {
      positions=new Float32Array(triangles.length/2*3);
      for(let i=0;i<triangles.length;i+=2) {
        const u=(triangles[i]*(f.nx-1)+.5)/f.nx,v=(triangles[i+1]*(f.ny-1)+.5)/f.ny;
        const p=i/2*3;positions[p]=(u-.5)*width;positions[p+1]=.09;positions[p+2]=(.5-v)*height;
      }
      worldCache.set(triangles,{key,positions});
    }
  }
  if(positions.length) {
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material=new THREE.MeshBasicMaterial({color:view.landDisplayColor??'#ffdead',side:THREE.DoubleSide,depthTest:false,depthWrite:false});
    // Transparent queue renders after opaque arrows and terrain, regardless of depth.
    material.transparent=true;material.opacity=1;
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=100000;view.group.add(mesh);view.landOverlayMesh=mesh;
  }
  view.container.dataset.n03LandCells=String(positions.length/9);
}

export function drawLandOverlay2d(view) {
  const f=view.fields,b=view.landDisplayBounds,r=view.rect,ctx=view.canvas.getContext('2d');
  const source=view.landDisplayTriangles??view.landDisplayPolygons;
  const active=view.mode==='map'&&view.showN03Land&&b&&r&&source?.length;
  view.canvas.dataset.n03LandCells=String(active?source.length:0);
  if(drawGpuMapOverlay(view))return;
  if(!active)return;
  view.canvas.dataset.mapOverlayBackend='canvas';
  const dpr=devicePixelRatio,x0=r.x*dpr,y0=r.y*dpr,rw=r.width*dpr,rh=r.height*dpr;
  ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.beginPath();ctx.rect(x0+.5/f.nx*rw,y0+.5/f.ny*rh,(f.nx-1)/f.nx*rw,(f.ny-1)/f.ny*rh);ctx.clip();ctx.fillStyle=view.landDisplayColor??'#ffdead';
  const triangles=landOverlayTriangles(source,b);
  if(view.landPathSource!==triangles) {
    const path=new Path2D();
    for(let i=0;i<triangles.length;i+=6){path.moveTo(triangles[i],triangles[i+1]);path.lineTo(triangles[i+2],triangles[i+3]);path.lineTo(triangles[i+4],triangles[i+5]);path.closePath();}
    view.landPathSource=triangles;view.landPath=path;
  }
  ctx.translate(x0+.5/f.nx*rw,y0+(1-.5/f.ny)*rh);ctx.scale((f.nx-1)/f.nx*rw,-(f.ny-1)/f.ny*rh);ctx.fill(view.landPath);ctx.restore();
}

export function installLandVectorOverlay(view) {
  const rebuild=view.rebuild.bind(view),draw=view.draw.bind(view);
  view.rebuild=()=>{rebuild();buildLandOverlay3d(view);};
  view.draw=()=>{prepareGpuMapOverlay(view);draw();if(view.fields)drawLandOverlay2d(view);};
}
