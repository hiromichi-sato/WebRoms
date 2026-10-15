function signature(grid) {
  const text=JSON.stringify([grid.nx,grid.ny,grid.dx,grid.dy,grid.minDepth,grid.maxDepth,grid.edits]);let hash=2166136261;
  for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16);
}
function referenceOf(grid,fields) {
  const edits=fields?Object.fromEntries(Array.from({length:grid.nx*grid.ny},(_,p)=>[p,fields.mask[p]?fields.h[p]:0])):grid.edits;
  return structuredClone({nx:grid.nx,ny:grid.ny,spanX:grid.dx*(grid.nx-1),spanY:grid.dy*(grid.ny-1),geoBounds:grid.geoBounds,edits,coastline:grid.coastline,contourInterpolation:grid.contourInterpolation});
}
function referenceState(grid,fields) {
  const state=grid.terrainResampling,stored=state?.reference??grid.domainCrop?.reference;
  if(stored&&(state?.currentSignature??grid.domainCrop?.currentSignature)===signature(grid))return {...state,reference:stored,window:state?.window??{x0:0,x1:1,y0:0,y1:1}};
  return {reference:referenceOf(grid,fields),window:{x0:0,x1:1,y0:0,y1:1},...(stored?{originalReference:state?.originalReference??stored}: {})};
}
function remapCoastline(source,indices,edits,nx,ny) {
  const provenance=indices.map(p=>source.provenance[p]);
  const subset=object=>Object.fromEntries(indices.flatMap((p,q)=>Object.hasOwn(object??{},p)?[[q,object[p]]]:[]));
  return {...source,nx,ny,provenance,baseDepths:subset(source.baseDepths),etopoSources:subset(source.etopoSources),restoredCells:0,
    ...(source.landPolygons?.cellMask ? {landPolygons:{...source.landPolygons,
      cellMask:indices.map(p=>source.landPolygons.cellMask[p]),
      appliedCells:indices.filter(p=>source.landPolygons.cellMask[p]>=0).length}} : {}),
    ...(source.reconstruction ? {reconstruction:{...source.reconstruction,
      observedDepths:subset(source.reconstruction.observedDepths),predictedDepths:subset(source.reconstruction.predictedDepths),
      inferredLandCells:provenance.filter(v=>v==='inferred-land').length,
      extrapolatedWaterCells:provenance.filter(v=>v==='coastal-extrapolation').length}} : {}),
    landCells:Object.values(edits).filter(v=>!v).length,etopoCells:provenance.filter(v=>v==='etopo').length,neighborCells:provenance.filter(v=>v==='neighbor').length,fallbackCells:provenance.filter(v=>v==='assumed').length};
}
function axisWeights(index,target,source,start=0,end=1) {
  const first=start*(source-1),last=end*(source-1),step=(last-first)/(target-1),value=first+index*step;
  const x=Math.abs(value-Math.round(value))<1e-10?Math.round(value):value;
  if(step<=1+1e-10){const lo=Math.floor(x),fraction=x-lo;return [[lo,1-fraction],...(fraction?[[lo+1,fraction]]:[])];}
  const radius=step/2,lo=Math.max(first-.5,x-radius),hi=Math.min(last+.5,x+radius),out=[];
  for(let i=Math.max(0,Math.floor(lo-.5));i<=Math.min(source-1,Math.ceil(hi+.5));i++){
    const weight=Math.min(hi,i+.5)-Math.max(lo,i-.5);if(weight>0)out.push([i,weight]);
  }
  return out;
}
function remapConstraints(source,window,nx,ny) {
  const observed=source.contourInterpolation?.observedDepths??source.coastline?.reconstruction?.observedDepths??source.edits;
  const sums={},counts={};
  for(const [cell,depth] of Object.entries(observed??{})) {
    if(!Number.isFinite(depth)||depth<0||observed===source.edits&&depth===0)continue;
    const p=Number(cell),x=p%source.nx/(source.nx-1),y=Math.floor(p/source.nx)/(source.ny-1);
    if(x<window.x0-1e-10||x>window.x1+1e-10||y<window.y0-1e-10||y>window.y1+1e-10)continue;
    const i=Math.round((x-window.x0)/(window.x1-window.x0)*(nx-1)),j=Math.round((y-window.y0)/(window.y1-window.y0)*(ny-1)),q=j*nx+i;
    sums[q]=(sums[q]??0)+depth;counts[q]=(counts[q]??0)+1;
  }
  return Object.fromEntries(Object.entries(sums).map(([p,sum])=>[p,sum/counts[p]]));
}

export function finalizeTerrainRebuild(grid) {
  if(grid.terrainResampling)grid.terrainResampling.currentSignature=signature(grid);
  return grid;
}
export function resizeTerrainGrid(grid,nx,ny) {
  if(![nx,ny].every(n=>Number.isInteger(n)&&n>=8&&n<=100))throw new Error('格子数は8～100の整数で指定してください。');
  const state=referenceState(grid),source=state.reference,window=state.window;
  const dx=(source.spanX??grid.dx*(grid.nx-1))*(window.x1-window.x0)/(nx-1),dy=(source.spanY??grid.dy*(grid.ny-1))*(window.y1-window.y0)/(ny-1);
  if(Math.min(dx,dy)<10||Math.max(dx,dy)>2500000)throw new Error('変更後の格子間隔は10～2,500,000 mにしてください。');
  const edits={},baseDepths={},indices=[],xs=Array.from({length:nx},(_,i)=>axisWeights(i,nx,source.nx,window.x0,window.x1)),ys=Array.from({length:ny},(_,j)=>axisWeights(j,ny,source.ny,window.y0,window.y1));
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const p=j*nx+i,q=Math.round((window.y0+j/(ny-1)*(window.y1-window.y0))*(source.ny-1))*source.nx+Math.round((window.x0+i/(nx-1)*(window.x1-window.x0))*(source.nx-1));indices.push(q);
    let baseSum=0,baseWeight=0;
    for(const [y,wy]of ys[j])for(const[x,wx]of xs[i]){const h=source.coastline?.baseDepths?.[y*source.nx+x]??source.edits[y*source.nx+x];if(h>0){baseSum+=h*wx*wy;baseWeight+=wx*wy;}}
    baseDepths[p]=baseWeight?baseSum/baseWeight:0;
    if(!(source.edits[q]>0)){edits[p]=0;continue;}
    let sum=0,weight=0;
    for(const [y,wy]of ys[j])for(const[x,wx]of xs[i]){const h=source.edits[y*source.nx+x];if(h>0){sum+=h*wx*wy;weight+=wx*wy;}}
    edits[p]=weight?sum/weight:source.edits[q];
  }
  const wet=Object.values(edits).filter(v=>v>0);if(!wet.length)throw new Error('格子変更後に海セルがありません。');
  const result={...grid,nx,ny,dx,dy,edits,minDepth:Math.min(...wet),maxDepth:Math.max(...wet),terrainResampling:{...state,method:'retained source terrain with calculation window; nearest land mask; area-weighted wet coarsening; bilinear wet refinement'}};
  delete result.contourInterpolation;
  delete result.coastline;
  if(source.coastline)result.coastline=remapCoastline(source.coastline,indices,edits,nx,ny);
  if(grid.geoBounds) {
    result.contourInterpolation={sourceGeometry:'retained-grid-constraints',observedDepths:remapConstraints(source,window,nx,ny),interpolatedDepths:baseDepths,
      method:'Resampled retained source depths; original grid constraints mapped once to nearest target cells, not invented observations'};
    if(result.coastline)result.coastline.baseDepths=baseDepths;
  }
  result.terrainResampling.currentSignature=signature(result);
  return result;
}

export function cropTerrainGrid(grid, fields, selection, bounds = null) {
  const { i0, i1, j0, j1 } = selection;
  if (![i0,i1,j0,j1].every(Number.isInteger) || i0<0 || j0<0 || i1>=grid.nx || j1>=grid.ny || i1-i0+1<8 || j1-j0+1<8) throw new Error('残す範囲は縦・横とも8マス以上で指定してください。');
  if(i0===0&&j0===0&&i1===grid.nx-1&&j1===grid.ny-1) throw new Error('全領域が選択されています。残す範囲を狭く指定してください。');
  const nx=i1-i0+1, ny=j1-j0+1, edits={};
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const p=(j+j0)*grid.nx+i+i0;edits[j*nx+i]=fields.mask[p]?fields.h[p]:0;
  }
  const wet=Object.values(edits).filter(v=>v>0);
  if(!wet.length)throw new Error('選択範囲に海セルがありません。');
  const result={...grid,nx,ny,preset:'open',edits,minDepth:Math.min(...wet),maxDepth:Math.max(...wet),geoBounds:bounds?{
    west:bounds.west+i0/(grid.nx-1)*(bounds.east-bounds.west),east:bounds.west+i1/(grid.nx-1)*(bounds.east-bounds.west),
    south:bounds.south+j0/(grid.ny-1)*(bounds.north-bounds.south),north:bounds.south+j1/(grid.ny-1)*(bounds.north-bounds.south)
  }:null,domainCrop:{sourceNx:grid.nx,sourceNy:grid.ny,...selection}};
  for(const key of ['coastline','contourInterpolation','coastlinePendingReason','domainSourceBounds','importedUncoveredCells','terrainResampling'])delete result[key];
  if(grid.coastline){
    const source=grid.coastline, indices=Array.from({length:nx*ny},(_,p)=>(Math.floor(p/nx)+j0)*grid.nx+p%nx+i0);
    result.coastline=remapCoastline(source,indices,edits,nx,ny);
  }
  const state=referenceState(grid,fields),window=state.window;
  result.terrainResampling={...state,window:{
    x0:window.x0+i0/(grid.nx-1)*(window.x1-window.x0),x1:window.x0+i1/(grid.nx-1)*(window.x1-window.x0),
    y0:window.y0+j0/(grid.ny-1)*(window.y1-window.y0),y1:window.y0+j1/(grid.ny-1)*(window.y1-window.y0)
  },currentSignature:signature(result)};
  if(bounds&&!state.reference.geoBounds)result.terrainResampling.reference={...state.reference,geoBounds:{...bounds}};
  const cropped=resizeTerrainGrid(result,nx,ny);
  cropped.dx=grid.dx;cropped.dy=grid.dy;cropped.terrainResampling.currentSignature=signature(cropped);
  return cropped;
}
