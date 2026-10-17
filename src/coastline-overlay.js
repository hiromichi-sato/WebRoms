import {prepareLandDisplay} from './land-display-mask.js';
const base=new URL('../assets/coastlines/n03-2026/',import.meta.url);
export function coastSegmentsForGroups(groups,bounds) {
  const segments=[];
  for(const {outer,tileBounds:b} of groups)for(let i=0;i<outer.length;i++){
    const a=outer[i],c=outer[(i+1)%outer.length];
    // Tile-cut edges are not coastlines. Municipal borders were dissolved offline.
    if(b&&[[0,b.west],[0,b.east],[1,b.south],[1,b.north]].some(([axis,edge])=>Math.abs(a[axis]-edge)<1e-8&&Math.abs(c[axis]-edge)<1e-8))continue;
    const segment=clipCoastSegment(a,c,bounds);if(segment)segments.push(segment);
  }
  return segments;
}
export function clipCoastSegment(a,b,bounds) {
  const dx=b[0]-a[0],dy=b[1]-a[1];let lo=0,hi=1;
  for(const [p,q] of [[-dx,a[0]-bounds.west],[dx,bounds.east-a[0]],[-dy,a[1]-bounds.south],[dy,bounds.north-a[1]]]) {
    if(!p){if(q<0)return null;continue;}
    const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }
  return [[a[0]+lo*dx,a[1]+lo*dy],[a[0]+hi*dx,a[1]+hi*dy]];
}
export async function loadCoastlineOverlay(bounds,fetcher=fetch) {
  if(!bounds||bounds.west<120||bounds.east>155||bounds.south<20||bounds.north>50)return [];
  const response=await fetcher(new URL('index.json',base));if(!response.ok)throw new Error('N03海岸線の索引を読み込めません。');
  const manifest=await response.json(),segments=[];
  for(const tile of manifest.tiles.filter(({bounds:b})=>b.east>=bounds.west&&b.west<=bounds.east&&b.north>=bounds.south&&b.south<=bounds.north)) {
    if(!tile.coastlineFile)continue;
    const response=await fetcher(new URL(tile.coastlineFile,base));if(!response.ok)throw new Error('N03海岸線を読み込めません。');
    const bytes=await response.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==tile.coastlineSha256)throw new Error('N03海岸線の整合性を確認できません。');
    const text=tile.coastlineFile.endsWith('.gz')?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():new TextDecoder().decode(bytes);
    const {paths}=JSON.parse(text);
    for(const path of paths)for(let i=1;i<path.length;i++){const segment=clipCoastSegment(path[i-1],path[i],bounds);if(segment)segments.push(segment);}
  }
  return segments;
}
export function updateCoastlineOverlay(view,bounds,redraw,onError=()=>{}) {
  const key=JSON.stringify(bounds??null);
  if(view.coastlineKey===key)return;
  view.coastlineKey=key;view.coastlineSegments=[];view.coastlineBounds=bounds;
  view.coastlineLoading=Boolean(bounds);view.onLandDisplayStatus?.(false);
  if(!bounds)return;
  prepareLandDisplay(bounds).then(data=>{if(view.coastlineKey!==key)return;view.coastlineSegments=data.segments;view.coastlineLoading=false;view.onLandDisplayStatus?.(false);redraw();}).catch(error=>{if(view.coastlineKey===key){view.coastlineLoading=false;view.onLandDisplayStatus?.(false);onError(error.message);}});
}
