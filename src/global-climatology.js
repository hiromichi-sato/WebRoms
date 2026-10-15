import { CLIMATOLOGY_DATA } from './data/climatology-woa23.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';
import { preparedClimate } from './prepared-climate.js';

export function climateBounds(config) {
  const bounds=config.grid.geoBounds ?? TERRAIN_PRESETS[config.grid.preset]?.bounds;
  if(!bounds) return null;
  const west=((bounds.west+180)%360+360)%360-180;
  return {...bounds,west,east:west+(bounds.east-bounds.west)};
}
export function validateClimateBounds(bounds) {
  const { west, east, south, north } = bounds ?? {};
  if (![west,east,south,north].every(Number.isFinite) || west < -180 || west >= 180 || east-west > 360 || south < -90 || north > 90 || east <= west || north <= south) throw new Error('有効な緯度経度付きの地形を指定してください。');
  return bounds;
}

// NOAA CSV contains only numeric, unquoted columns. Missing deep values are omitted.
export function regionalWoaCsv(text, bounds, depths) {
  validateClimateBounds(bounds);
  const lines = text.trim().split(/\r?\n/);
  if (!lines[0]?.startsWith('#WOA23') || !lines[1]?.includes('DEPTHS (M):')) throw new Error('NOAA WOA23の応答形式が不正です。');
  const levels = lines[1].split(':')[1].split(',').map(Number);
  if (!levels.length || levels.some((v,i)=>!Number.isFinite(v)||v<0||(i&&v<=levels[i-1]))) throw new Error('NOAAの深度情報が不正です。');
  const indices = depths.map(d=>levels.indexOf(d)), sums = depths.map(()=>0), weights = depths.map(()=>0);
  const nearest = depths.map(()=>({distance:Infinity,value:null}));
  const centerLat = (bounds.south+bounds.north)/2, centerLon=(bounds.west+bounds.east)/2;
  for (const line of lines.slice(2)) {
    if (!line.trim()) continue;
    const row=line.split(','), lat=Number(row[0]), lon=Number(row[1]);
    if (!row[0]?.trim() || !row[1]?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat)>90 || Math.abs(lon)>180) throw new Error('NOAAの座標が不正です。');
    const unwrapped=((lon-bounds.west)%360+360)%360+bounds.west;
    const within=unwrapped<=bounds.east&&lat>=bounds.south&&lat<=bounds.north;
    const delta=Math.abs(((lon-centerLon+540)%360)-180), distance=(lat-centerLat)**2+(delta*Math.cos(centerLat*Math.PI/180))**2;
    indices.forEach((index,k)=>{
      if(index<0) return;
      const token=row[index+2]?.trim(); if(!token) return;
      const value=Number(token);
      if(!Number.isFinite(value)) throw new Error('NOAAの値が不正です。');
      if(value<=-999||Math.abs(value)>=1e20) return;
      if(distance<nearest[k].distance) nearest[k]={distance,value};
      if(within) { const w=Math.cos(lat*Math.PI/180); sums[k]+=value*w; weights[k]+=w; }
    });
  }
  return {values:sums.map((sum,k)=>weights[k]?sum/weights[k]:nearest[k].value), approximated:weights.map((w,k)=>!w&&nearest[k].value!==null), nearestDistanceDegrees:nearest.map(n=>Number.isFinite(n.distance)?Math.sqrt(n.distance):null)};
}

export async function fetchGlobalClimate(bounds, season='annual', {fetcher=fetch,progress=()=>{},variables=Object.keys(CLIMATOLOGY_DATA.variables)}={}) {
  validateClimateBounds(bounds);
  if(!['annual','summer','winter'].includes(season)) throw new Error('気候値の季節が不正です。');
  const prepared=await preparedClimate(bounds,season,{fetcher,progress,variables});
  if(prepared)return prepared;
  const south=(bounds.south+bounds.north)/2<0;
  const months=season==='annual'?[0]:((season==='summer')!==south?[6,7,8]:[12,1,2]);
  const depths=CLIMATOLOGY_DATA.depthsM, fields={},sources=[];
  for(const [variable,meta] of Object.entries(CLIMATOLOGY_DATA.variables)) {
    if(!variables.includes(variable))continue;
    const periods=[...new Set([0,...months])], results={};
    for(const period of periods) {
      progress(`NOAA全球気候値を取得中：${variable}・${period===0?'年平均':'季節平均'}`);
      const filename=`woa23_${meta.span}_${meta.code}${String(period).padStart(2,'0')}an01.csv.gz`;
      const url=`https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DATA/${variable}/csv/${meta.span}/1.00/${filename}`;
      const response=await fetcher(url,{signal:AbortSignal.timeout(90000),cache:'no-store'});
      if(!response.ok) throw new Error(`NOAA取得失敗（HTTP ${response.status}）。元の初期条件を保持します。`);
      const reader=response.body.getReader(),chunks=[]; let length=0;
      while(true) { const {done,value}=await reader.read(); if(done) break; length+=value.length; if(length>32000000) {await reader.cancel();throw new Error('NOAA応答が容量上限を超えました。');} chunks.push(value); }
      const bytes=new Uint8Array(length); let offset=0; for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const text=await new Response(stream).text(); if(text.length>100000000) throw new Error('NOAA展開データが容量上限を超えました。');
      results[period]=regionalWoaCsv(text,bounds,depths); sources.push({url,sha256:digest});
    }
    const limit=['temperature','salinity'].includes(variable)?1500:500;
    const selected=depths.map(d=>d>limit?[0]:months);
    fields[variable]={values:depths.map((d,k)=>{
      const values=selected[k].map(m=>results[m].values[k]);
      return values.every(v=>v!==null)?values.reduce((a,b)=>a+b,0)/values.length:results[0].values[k];
    }), approximated:depths.map((d,k)=>selected[k].some(m=>results[m].approximated[k]||results[m].values[k]===null)), nearestDistanceDegrees:depths.map((d,k)=>Math.max(...selected[k].map(m=>results[m].nearestDistanceDegrees[k]??0)))};
    if(fields[variable].values.every(v=>v===null)) throw new Error(`NOAAの${variable}に参照できる値がありません。`);
  }
  return {id:`global-${season}`,region:'global',season,depthsM:depths,fields,bounds:{...bounds},sources,product:CLIMATOLOGY_DATA.product};
}

export function climateVariables(config) {
  return ['temperature','salinity',...(config.ecosystem?.enabled?['nitrate',...(config.ecosystem.model==='nemuro'?['silicate']:[])]:[])];
}

export function acquireGlobalClimate(config,season) {
  const bounds=validateClimateBounds(climateBounds(config));
  const existing=config.climatology?.globalProfile;
  const variables=climateVariables(config);
  if(existing?.season===season&&JSON.stringify(existing.bounds)===JSON.stringify(bounds)&&variables.every(variable=>existing.fields?.[variable])) return Promise.resolve(existing);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./global-climate-worker.js',import.meta.url),{type:'module'});
    const finish=()=>{clearTimeout(timer);worker.terminate();};
    const timer=setTimeout(()=>{finish();reject(new Error('NOAA取得がタイムアウトしました。元の初期条件は変更していません。'));},900000);
    worker.onmessage=({data})=>{if(data.progress){const status=document.querySelector('#interpolationStatus strong');if(status)status.textContent=data.progress;return;}finish();data.error?reject(new Error(data.error)):resolve(data.profile);};
    worker.onerror=()=>{finish();reject(new Error('NOAA全球気候値を取得できませんでした。'));};
    worker.postMessage({bounds,season,variables});
  });
}
