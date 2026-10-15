import { coastalProfileNeighbors } from './coastal-climate.js';
import { frontBarriers } from './climate-fronts.js';
const base=new URL('../assets/climatology/woa23/',import.meta.url);
let manifestPromise;
export async function preparedClimate(bounds,season,{fetcher=fetch,progress=()=>{},variables=['temperature','salinity','nitrate','phosphate','silicate']}={}) {
  if(bounds.west<120||bounds.east>155||bounds.south<20||bounds.north>50)return null;
  manifestPromise??=fetcher(new URL('index.json',base)).then(async response=>response.ok?response.json():null);
  const manifest=await manifestPromise;
  if(!manifest)return null;
  const period=season==='annual'?0:season==='summer'?15:13,fields={},spatial={},sources=[];
  for(const variable of variables) {
    const subsets={};
    for(const selected of [...new Set([0,period])]) {
      const file=manifest.files.find(file=>file.variable===variable&&file.period===selected);
      progress(`保存済みNOAA気候値を補間中：${variable}`);
      const response=await fetcher(new URL(file.file,base));
      if(!response.ok)throw new Error('保存済みNOAAデータを読み込めません: '+file.file);
      const bytes=await response.arrayBuffer();
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      if(hash!==file.sha256)throw new Error('保存済みNOAAデータの整合性を確認できません。');
      const data=JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
      subsets[selected]=data.rows.filter(([lat,lon])=>lat>=bounds.south-2*file.spacing&&lat<=bounds.north+2*file.spacing&&lon>=bounds.west-2*file.spacing&&lon<=bounds.east+2*file.spacing);
      sources.push({url:file.sourceUrl,sha256:file.sourceSha256,localSha256:file.sha256,periodYears:file.periodYears,gridDegrees:file.spacing});
    }
    const seasonal=new Map(subsets[period].map(row=>[`${row[0]},${row[1]}`,row]));
    const rows=subsets[0].map(annual=>{
      const chosen=seasonal.get(`${annual[0]},${annual[1]}`);
      return annual.map((value,k)=>k<2?value:chosen?.[k]??value);
    });
    if(!rows.length)throw new Error('保存済みNOAAに周辺の水深プロファイルがありません。');
    const within=rows.filter(([lat,lon])=>lat>=bounds.south&&lat<=bounds.north&&lon>=bounds.west&&lon<=bounds.east);
    const reference=within.length?within:rows;
    const values=manifest.depthsM.map((_,k)=>{
      let sum=0,weight=0;for(const row of reference)if(row[k+2]!==null){const w=Math.cos(row[0]*Math.PI/180);sum+=row[k+2]*w;weight+=w;}
      return weight?sum/weight:null;
    });
    fields[variable]={values,approximated:values.map(()=>!within.length),nearestDistanceDegrees:values.map(()=>null)};
    spatial[variable]={rows,gridDegrees:manifest.files.find(file=>file.variable===variable).spacing};
  }
  return {id:`global-${season}`,region:'global',season,bounds:{...bounds},depthsM:manifest.depthsM,fields,spatial,sources,
    product:manifest.product,physicalPeriod:manifest.physicalPeriod,nutrientPeriod:manifest.nutrientPeriod,
    spatialSampling:'Original NOAA horizontal grid; local inverse-distance interpolation of four nearby valid profiles; seasonal gaps use annual values; vertical endpoint extrapolation'};
}

const horizontalCache=new WeakMap();
export function spatialProfiles(profile,variable,position,coast,depth=0) {
  const data=profile.spatial?.[variable];if(!data)return null;
  if(coast&&Number.isInteger(position?.cell)) {
    coast.neighbors??=new Map();
    if(!coast.neighbors.has(variable))coast.neighbors.set(variable,coastalProfileNeighbors(data.rows,coast.grid,coast.mask,profile.bounds,new Map(),{extrapolate:true}));
    const base=coast.neighbors.get(variable);
    profile.coastalExtrapolation??={method:'Nearest surrounding profiles projected to source-free wet basins; water-only interpolation inside each basin. Not bay observations.',cellsByVariable:{}};
    profile.coastalExtrapolation.cellsByVariable[variable]??=base.filter(list=>list.some(entry=>entry.extrapolated)).length;
    const level=profile.depthsM.reduce((best,value,i)=>Math.abs(value-depth)<Math.abs(profile.depthsM[best]-depth)?i:best,0),key=`${variable}:${level}`;
    if(!coast.neighbors.has(key)) {
      const {barriers,lines}=frontBarriers(data.rows,level,coast.grid,coast.mask,profile.bounds,base);
      coast.frontLines??=new Map();coast.frontLines.set(key,lines);
      coast.neighbors.set(key,barriers.size?coastalProfileNeighbors(data.rows,coast.grid,coast.mask,profile.bounds,barriers,{extrapolate:true}):base);
    }
    const nearby=coast.neighbors.get(key)[position.cell];
    if(!nearby?.length)throw new Error('海岸線で分離された水域にNOAAの参照値がありません。初期場NetCDFまたは手動設定を使用してください。');
    return nearby;
  }
  const lon=position?.lon??(profile.bounds.west+profile.bounds.east)/2,lat=position?.lat??(profile.bounds.south+profile.bounds.north)/2;
  let cache=horizontalCache.get(profile);if(!cache){cache=new Map();horizontalCache.set(profile,cache);}
  const key=`${variable}:${lon}:${lat}`;
  if(!cache.has(key)) {
    const factor=Math.cos(lat*Math.PI/180),nearest=[];
    for(const row of data.rows) {
      const distance=((row[1]-lon)*factor)**2+(row[0]-lat)**2;
      if(nearest.length<4||distance<nearest.at(-1).distance){nearest.push({row,distance});nearest.sort((a,b)=>a.distance-b.distance);if(nearest.length>4)nearest.pop();}
    }
    cache.set(key,nearest);
  }
  return cache.get(key);
}
