import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadN03Land, n03Classifier, needsEtopo } from '../src/n03-land.js';
import { coastlineTerrain } from '../src/coastline-terrain.js';
const ring = (w,e,s,n) => [[w,s],[e,s],[e,n],[w,n],[w,s]];

test('union removes administrative seams, preserves holes, and limits coverage',()=>{
  const classify = n03Classifier({polygons:[
    {box:[0,0,1,2],rings:[ring(0,1,0,2)]},
    {box:[1,0,2,2],rings:[ring(1,2,0,2),ring(1.2,1.8,.2,.8)]}
  ]});
  assert.equal(classify(1,1),true);
  assert.equal(classify(1.5,.5),false);
  assert.equal(classify(2.01,1),false);
  assert.equal(classify(3,1),null);
});

const fileFetch = async url => {
  const bytes=await readFile(url);
  return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
};
test('loads only intersecting N03 tiles and classifies Tsugaru land/water',async()=>{
  const bounds={west:139,east:142,south:40,north:42}, requested=[];
  const dataset=await loadN03Land(bounds,async url=>{requested.push(String(url));return fileFetch(url);});
  assert.equal(dataset.metadata.license,'CC-BY-4.0');
  assert.ok(requested.length>1&&requested.length<49);
  const classify=n03Classifier(dataset);
  assert.equal(classify(140.74,41.77),true,'Hakodate');
  assert.notEqual(classify(140.5,41.5),true,'Tsugaru Strait; offshore falls back to ETOPO');
  assert.equal(classify(140.75,40.9),false,'Aomori Bay');
  assert.equal(classify(140.74,40.82),true,'Aomori city');
  assert.equal(await loadN03Land({west:-20,east:0,south:0,north:10},()=>assert.fail('unexpected fetch')),null);
});

test('authoritative land overrides depth constraints; wet measurements remain fixed',()=>{
  const nx=8,ny=8,bounds={west:140,east:140.07,south:41,north:41.07};
  const n03={metadata:{license:'CC-BY-4.0'},polygons:[{box:[139,40,140.025,42],rings:[ring(139,140.025,40,42)]}]};
  const grid={nx,ny,dx:1000,dy:1000,minDepth:1,maxDepth:100,geoBounds:bounds,contourInterpolation:{observedDepths:{25:20,29:80},interpolatedDepths:Object.fromEntries(Array.from({length:64},(_,p)=>[p,50]))}};
  const fields={h:new Float64Array(64).fill(50),mask:new Uint8Array(64).fill(1)};
  const result=coastlineTerrain(grid,fields,null,{maskSource:'etopo',n03,regionalTiles:{test:{bounds,width:8,height:8,elevation:new Array(64).fill(-50)}}});
  assert.equal(result.edits[25],0);
  assert.equal(result.edits[29],80);
  assert.ok(result.edits[27]>0&&result.edits[27]<50);
  assert.equal(result.coastline.landPolygons.excludedDepthConstraints,1);
  assert.ok(result.coastline.landPolygons.coastalInterpolatedCells>0);
  assert.ok(Object.values(result.edits).every(Number.isFinite));
});

test('ETOPO is unnecessary when N03 and supplied depths suffice; only real gaps request it',()=>{
  const grid={nx:8,ny:8,geoBounds:{west:140,east:140.02,south:41,north:41.02}};
  const n03={polygons:[{box:[140,41,140.01,41.02],rings:[ring(140,140.01,41,41.02)]}]};
  const fields={h:new Float64Array(64).fill(50),mask:new Uint8Array(64).fill(1)};
  const options={maskSource:'etopo',etopo:true};
  assert.equal(needsEtopo(grid,fields,options,n03),false);
  fields.h[7]=0;
  assert.equal(needsEtopo(grid,fields,options,n03),true);
  fields.h[7]=50;fields.h[0]=0;
  assert.equal(needsEtopo(grid,fields,options,n03),false,'missing depths on land need no ETOPO');
  assert.equal(needsEtopo(grid,fields,options,null),true,'unknown land mask needs fallback');
});
