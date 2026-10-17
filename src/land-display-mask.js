import { n03Classifier } from './n03-land.js';
const datasets=new Map();
function loadDisplayData(bounds,source) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./land-display-worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(data.progress)return;
      worker.terminate();
      if(data.error)reject(new Error(data.error));else resolve(data);
    };
    worker.onerror=event=>{worker.terminate();reject(new Error(event.message||'N03陸域の表示処理に失敗しました。'));};
    worker.postMessage({bounds,source});
  });
}
export function prepareLandDisplay(bounds) {
  const key=JSON.stringify(bounds);
  if(!datasets.has(key)){
    let source;
    for(const entry of datasets.values()){
      const b=entry.bounds;
      if(entry.result&&b.west<=bounds.west&&b.east>=bounds.east&&b.south<=bounds.south&&b.north>=bounds.north){
        if(!source||(b.east-b.west)*(b.north-b.south)<(source.bounds.east-source.bounds.west)*(source.bounds.north-source.bounds.south))source={...entry.result,bounds:b};
      }
    }
    if(datasets.size>=4)datasets.delete(datasets.keys().next().value);
    const entry={bounds:{...bounds}};
    entry.promise=loadDisplayData(bounds,source).then(data=>{entry.result=data;return data;}).catch(error=>{if(datasets.get(key)===entry)datasets.delete(key);throw error;});
    datasets.set(key,entry);
  }
  return datasets.get(key).promise;
}
const inside=(p,ring)=>{
  let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
  }return hit;
};
export function landPolygonGroups(dataset) {
  const groups=[];
  for(const polygon of dataset?.polygons??[]) {
    const rings=polygon.rings.filter(r=>r.length>=4).map(r=>r.slice(0,r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1]?-1:undefined));
    const areas=rings.map(r=>Math.abs(r.reduce((sum,p,i)=>{const q=r[(i+1)%r.length];return sum+p[0]*q[1]-q[0]*p[1];},0)));
    const parents=rings.map((ring,i)=>{
      let parent=-1;for(let j=0;j<rings.length;j++)if(areas[j]>areas[i]&&(parent<0||areas[j]<areas[parent])&&inside(ring[0],rings[j]))parent=j;
      return parent;
    });
    const depth=i=>parents[i]<0?0:1+depth(parents[i]);
    rings.forEach((outer,i)=>{if(depth(i)%2===0)groups.push({outer,holes:rings.filter((_,j)=>parents[j]===i)});});
  }
  return groups;
}
export function clipLandTriangle(triangle,bounds) {
  let points=triangle;
  for(const [axis,value,sign] of [[0,bounds.west,1],[0,bounds.east,-1],[1,bounds.south,1],[1,bounds.north,-1]]) {
    const next=[];
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],ina=sign*(a[axis]-value)>=0,inb=sign*(b[axis]-value)>=0;
      if(ina)next.push(a);
      if(ina!==inb){const t=(value-a[axis])/(b[axis]-a[axis]);next.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    }points=next;
  }
  return points;
}
export function rasterLandMask(dataset,bounds,nx,ny) {
  const classify=n03Classifier(dataset);
  return Uint8Array.from({length:nx*ny},(_,p)=>classify?.(bounds.west+p%nx/(nx-1)*(bounds.east-bounds.west),bounds.south+Math.floor(p/nx)/(ny-1)*(bounds.north-bounds.south))===true?1:0);
}
export function updateLandDisplayMask(view,bounds,enabled,redraw,onError=()=>{},fields=view.fields) {
  const key=JSON.stringify(bounds);
  view.showN03Land=enabled;
  if(!enabled||!bounds){view.landDisplayKey=null;view.landDisplayMask=null;view.landDisplayPolygons=null;view.landDisplayTriangles=null;view.onLandDisplayStatus?.(false);return;}
  if(view.landDisplayKey===key)return;
  view.landDisplayKey=key;view.landDisplayMask=null;view.landDisplayPolygons=null;view.landDisplayTriangles=null;view.landDisplayBounds=bounds;
  const prepared=datasets.get(key)?.result;
  if(prepared){view.landDisplayTriangles=prepared.triangles;view.onLandDisplayStatus?.(false);return;}
  view.onLandDisplayStatus?.(true);
  prepareLandDisplay(bounds).then(data=>{if(view.landDisplayKey!==key||!view.showN03Land)return;view.landDisplayTriangles=data.triangles;view.onLandDisplayStatus?.(false);redraw();}).catch(error=>{if(view.landDisplayKey===key){view.landDisplayKey=null;view.onLandDisplayStatus?.(false);onError(error.message);}});
}
