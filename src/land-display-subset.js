import {clipLandTriangle} from './land-display-mask.js';
import {clipCoastSegment} from './coastline-overlay.js';

export function subsetLandDisplay(source,bounds) {
  const previous=source.bounds,positions=[];
  const point=i=>[previous.west+source.triangles[i]*(previous.east-previous.west),previous.south+source.triangles[i+1]*(previous.north-previous.south)];
  for(let i=0;i<source.triangles.length;i+=6){
    const triangle=[point(i),point(i+2),point(i+4)];
    if(triangle.every(p=>p[0]<bounds.west)||triangle.every(p=>p[0]>bounds.east)||triangle.every(p=>p[1]<bounds.south)||triangle.every(p=>p[1]>bounds.north))continue;
    const clipped=clipLandTriangle(triangle,bounds);
    for(let k=1;k<clipped.length-1;k++)for(const [lon,lat] of [clipped[0],clipped[k],clipped[k+1]])positions.push((lon-bounds.west)/(bounds.east-bounds.west),(lat-bounds.south)/(bounds.north-bounds.south));
  }
  const segments=source.segments.flatMap(([a,b])=>{const segment=clipCoastSegment(a,b,bounds);return segment?[segment]:[];});
  return {triangles:new Float32Array(positions),segments,tiles:source.tiles,bytes:0,reused:true};
}
