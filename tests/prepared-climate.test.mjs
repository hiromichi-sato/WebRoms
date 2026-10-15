import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { preparedClimate } from '../src/prepared-climate.js';
import { applyGlobalClimate, sampleGlobalClimate } from '../src/climatology.js';
import { defaults, buildFields } from '../src/model.js';
import { clipCoastSegment } from '../src/coastline-overlay.js';
import { climateVariables } from '../src/global-climatology.js';
const bounds={west:140,east:142,south:40,north:42};
const fileFetch=async url=>{const b=await readFile(url);return{ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
test('NPZD loads only needed climate fields and never interpolates silica or phosphate',async()=>{
  const config=defaults();config.ecosystem.enabled=true;config.ecosystem.model='npzd';
  const variables=climateVariables(config),progress=[];
  assert.deepEqual(variables,['temperature','salinity','nitrate']);
  const profile=await preparedClimate(bounds,'summer',{fetcher:async url=>{
    assert.ok(!/silicate|phosphate/.test(String(url)));return fileFetch(url);
  },variables,progress:text=>progress.push(text)});
  assert.deepEqual(Object.keys(profile.fields),variables);
  assert.ok(progress.every(text=>!/silicate|phosphate/.test(text)));
  assert.ok(Object.values(sampleGlobalClimate(profile,5)).every(Number.isFinite));
  config.ecosystem.model='nemuro';assert.ok(climateVariables(config).includes('silicate'));
  config.ecosystem.enabled=false;assert.deepEqual(climateVariables(config),['temperature','salinity']);
});
test('prepared atlas retains NOAA periods and horizontal profiles, offline',async()=>{
  const profile=await preparedClimate(bounds,'summer',{fetcher:fileFetch});
  assert.equal(profile.physicalPeriod,'2015-2022');assert.equal(profile.nutrientPeriod,'1965-2022');
  assert.equal(profile.spatial.temperature.gridDegrees,.25);assert.equal(profile.spatial.nitrate.gridDegrees,1);
  const west=sampleGlobalClimate(profile,5,{lon:140,lat:41}),east=sampleGlobalClimate(profile,5,{lon:142,lat:41});
  assert.notEqual(west.temperature,east.temperature);
  assert.ok(Object.values(west).every(Number.isFinite));
  const config=defaults();Object.assign(config.grid,{nx:8,ny:8,preset:'open',geoBounds:bounds});
  const next=applyGlobalClimate(config,profile,'summer');
  assert.notEqual(next.initial.painted.temp[0][0],next.initial.painted.temp[0][7]);
  assert.ok(buildFields(JSON.parse(JSON.stringify(next))).temp.every(Number.isFinite));
});
test('display coastline clipping preserves real segments and discards exterior lines',()=>{
  assert.deepEqual(clipCoastSegment([139,41],[143,41],bounds),[[140,41],[142,41]]);
  assert.equal(clipCoastSegment([139,39],[143,39],bounds),null);
});

test('a narrow source-free basin receives finite climate values with saved provenance',()=>{
  const config=defaults();Object.assign(config.grid,{nx:8,ny:8,preset:'open',geoBounds:bounds,edits:Object.fromEntries(Array.from({length:64},(_,p)=>[p,p===27||p===28?50:0]))});
  const rows=[[40,140,10,8],[42,142,20,18]],profile={season:'annual',bounds,depthsM:[0,100],fields:{temperature:{values:[15,13]},salinity:{values:[34,34]}},spatial:{temperature:{rows},salinity:{rows:[[40,140,33,34],[42,142,35,34]]}}};
  const next=applyGlobalClimate(config,profile,'annual');
  assert.equal(next.climatology.globalProfile.coastalExtrapolation.cellsByVariable.temperature,2);
  for(const layer of next.initial.painted.temp)for(const p of [27,28])assert.ok(Number.isFinite(layer[p]));
});
