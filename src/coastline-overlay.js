const base=new URL('../assets/coastlines/n03-2026/',import.meta.url),cache=new Map();
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
  if(!bounds)return;
  if(!cache.has(key))cache.set(key,loadCoastlineOverlay(bounds).catch(error=>{cache.delete(key);throw error;}));
  cache.get(key).then(segments=>{if(view.coastlineKey!==key)return;view.coastlineSegments=segments;redraw();}).catch(error=>{if(view.coastlineKey===key)onError(error.message);});
}
