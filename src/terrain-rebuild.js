import { buildCoastline } from './terrain-builder.js';
import { finalizeTerrainRebuild } from './terrain-domain.js';

export async function rebuildTerrainGrid(grid,progress=()=>{},signal) {
  if(!grid.geoBounds)return grid;
  progress('海岸線・陸海・水深を再補完中…');
  const h=Float64Array.from({length:grid.nx*grid.ny},(_,p)=>grid.edits[p]??0),mask=Uint8Array.from(h,value=>value>0?1:0);
  for(const [cell,depth] of Object.entries(grid.contourInterpolation?.observedDepths??{})) {
    if(Number.isFinite(depth)&&depth>=0){h[cell]=Math.max(1,depth);mask[cell]=1;}
  }
  const rebuilt=await buildCoastline(grid,{h,mask},null,{maskSource:'etopo',etopo:true,source:'N03 land polygons / ETOPO fallback; rebuilt after calculation-grid change'},progress,signal);
  rebuilt.coastline.rebuiltAfterGridChange=true;
  return finalizeTerrainRebuild(rebuilt);
}
