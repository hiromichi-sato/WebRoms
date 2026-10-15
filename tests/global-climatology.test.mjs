import test from 'node:test';
import assert from 'node:assert/strict';
import { regionalWoaCsv, fetchGlobalClimate, climateBounds } from '../src/global-climatology.js';
import { applyGlobalClimate, sampleGlobalClimate, regionalClimate } from '../src/climatology.js';
import { defaults, buildFields } from '../src/model.js';
import { gzipSync } from 'node:zlib';

const bounds={west:20,east:25,south:-35,north:-30};
const csv='#WOA23 synthetic test\n# DEPTHS (M):0,100\n-32.5,22.5,10,8\n-31.5,23.5,20,12\n40,140,99,99\n';
test('arbitrary geographic region uses local NOAA cells, not named preset means',()=>{
  const result=regionalWoaCsv(csv,bounds,[0,100]);
  assert.ok(result.values[0]>14&&result.values[0]<16);
  assert.deepEqual(result.approximated,[false,false]);
  const outside=regionalWoaCsv(csv,{west:10,east:11,south:-40,north:-39},[0,100]);
  assert.deepEqual(outside.values,[10,8]); assert.deepEqual(outside.approximated,[true,true]);
  assert.throws(()=>regionalWoaCsv('error',bounds,[0]));
});
test('0-360 preset coordinates and the date line select correct NOAA cells',()=>{
  const config=defaults();config.grid.preset='california';
  assert.ok(climateBounds(config).west<0);
  const crossing='#WOA23 test\n# DEPTHS (M):0\n10,179.5,10\n10,-179.5,20\n10,0.5,99\n';
  const result=regionalWoaCsv(crossing,{west:170,east:190,south:0,north:20},[0]);
  assert.ok(Math.abs(result.values[0]-15)<1e-12);
});
test('southern summer downloads DJF and carries source hashes; errors never invent data',async()=>{
  const urls=[];
  const profile=await fetchGlobalClimate(bounds,'summer',{fetcher:async url=>{urls.push(url);return new Response(gzipSync(csv));}});
  assert.equal(urls.length,20); assert.ok(urls.some(u=>u.includes('t12an01'))); assert.ok(urls.some(u=>u.includes('t01an01'))); assert.ok(!urls.some(u=>u.includes('t06an01')));
  assert.equal(profile.sources[0].sha256.length,64);
  await assert.rejects(fetchGlobalClimate(bounds,'annual',{fetcher:async()=>new Response('',{status:503})}));
});
test('global profiles apply to imported terrain, survive JSON and supply biology',()=>{
  const config=defaults(); Object.assign(config.grid,{preset:'open',geoBounds:bounds});
  config.ecosystem.enabled=true;config.ecosystem.distribution='climatology';
  const fields=Object.fromEntries(['temperature','salinity','nitrate','phosphate','silicate'].map((key,i)=>[key,{values:[20+i,10+i],approximated:[false,false]}]));
  const profile={id:'global-summer',region:'global',season:'summer',bounds,depthsM:[0,500],fields,sources:[]};
  const original=JSON.stringify(config), next=applyGlobalClimate(config,profile,'summer');
  assert.equal(JSON.stringify(config),original);
  assert.equal(regionalClimate(next,'summer').region,'global');
  assert.ok(Math.abs(sampleGlobalClimate(profile,0).nitrate-22*1.025)<1e-12);
  const restored=JSON.parse(JSON.stringify(next));
  assert.ok(buildFields(restored).temp.every(Number.isFinite));
  assert.throws(()=>applyGlobalClimate(config,profile,'winter'));
});
