import { createReadStream, createWriteStream } from 'node:fs';
import { writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip, gzipSync } from 'node:zlib';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { CLIMATOLOGY_DATA } from '../src/data/climatology-woa23.js';

const root=new URL('../',import.meta.url), raw=new URL('data/noaa/woa23/source/',root), out=new URL('assets/climatology/woa23/',root);
await mkdir(raw,{recursive:true});await mkdir(out,{recursive:true});
const bounds={west:120,east:155,south:20,north:50}, files=[];
for(const [variable,code] of Object.entries({temperature:'t',salinity:'s',nitrate:'n',phosphate:'p',silicate:'i'})) {
  const physical=['temperature','salinity'].includes(variable), span=physical?'B5C2':'all', spacing=physical?.25:1;
  for(const period of [0,13,15]) {
    const name=`woa23_${span}_${code}${String(period).padStart(2,'0')}an${physical?'04':'01'}.csv.gz`;
    const url=`https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DATA/${variable}/csv/${span}/${physical?'0.25':'1.00'}/${name}`;
    const path=new URL(name,raw);
    try { await stat(path); } catch(error) {
      if(error.code!=='ENOENT')throw error;
      console.log('Downloading '+name);
      const response=await fetch(url,{signal:AbortSignal.timeout(600000)});
      if(!response.ok)throw new Error(`${response.status}: ${url}`);
      await pipeline(Readable.fromWeb(response.body),createWriteStream(new URL(name+'.partial',raw)));
      await rename(new URL(name+'.partial',raw),path);
    }
    const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
    const sourceSha256=hash.digest('hex'), rows=[];
    let lineNumber=0,indices;
    const lines=createInterface({input:createReadStream(path).pipe(createGunzip()),crlfDelay:Infinity});
    for await(const line of lines) {
      if(lineNumber++===0){if(!line.startsWith('#WOA23'))throw new Error('Invalid WOA response');continue;}
      if(lineNumber===2){const levels=line.split(':')[1].split(',').map(Number);indices=CLIMATOLOGY_DATA.depthsM.map(depth=>levels.indexOf(depth));continue;}
      const first=line.indexOf(','),second=line.indexOf(',',first+1),lat=Number(line.slice(0,first)),lon=Number(line.slice(first+1,second));
      if(lat<bounds.south||lat>bounds.north||lon<bounds.west||lon>bounds.east)continue;
      const tokens=line.split(',');
      const values=indices.map(index=>{const token=index<0?'':tokens[index+2]?.trim();const value=token?Number(token):null;return Number.isFinite(value)&&value>-999&&Math.abs(value)<1e20?value:null;});
      if(values.some(value=>value!==null))rows.push([lat,lon,...values]);
    }
    if(!rows.length)throw new Error('No valid regional data: '+name);
    const file=`${variable}-${period}.json.gz`, bytes=gzipSync(JSON.stringify({rows}));
    await writeFile(new URL(file,out),bytes);
    files.push({variable,period,spacing,file,rows:rows.length,sourceUrl:url,sourceSha256,sha256:createHash('sha256').update(bytes).digest('hex'),periodYears:physical?'2015-2022':'1965-2022'});
    console.log(`Prepared ${file}: ${rows.length} spatial profiles`);
  }
}
await writeFile(new URL('index.json',out),JSON.stringify({product:'NOAA WOA23 objectively analyzed climatology',bounds,depthsM:CLIMATOLOGY_DATA.depthsM,
  sourcePage:CLIMATOLOGY_DATA.sourcePage,physicalPeriod:'2015-2022',nutrientPeriod:'1965-2022',physicalSpacing:.25,nutrientSpacing:1,
  processing:'Original horizontal grid retained within Japan and surrounding seas; selected standard depths; seasonal gaps use annual values; no horizontal regional averaging',files},null,2));
console.log('WOA spatial atlas ready');
