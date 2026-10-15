import test from 'node:test';
import assert from 'node:assert/strict';
import { coastalProfileNeighbors } from '../src/coastal-climate.js';

test('climate sources cannot cross a land barrier',()=>{
  const grid={nx:5,ny:5,dx:1000,dy:1000},mask=new Uint8Array(25).fill(1);
  for(let y=0;y<5;y++)mask[y*5+2]=0;
  const rows=[[2,0,2],[2,4,20]],bounds={west:0,east:4,south:0,north:4};
  const neighbors=coastalProfileNeighbors(rows,grid,mask,bounds);
  assert.deepEqual(neighbors[11].map(v=>v.source),[0]);
  assert.deepEqual(neighbors[13].map(v=>v.source),[1]);
  assert.deepEqual(neighbors[12],[]);
  mask[2]=1;
  const connected=coastalProfileNeighbors(rows,grid,mask,bounds);
  assert.equal(connected[11].length,2);
  assert.ok(connected[11].find(v=>v.source===1).distance>3000**2);
});

test('isolated water without source is not silently filled across land',()=>{
  const grid={nx:3,ny:3,dx:1,dy:1},mask=Uint8Array.from([1,0,1,1,0,1,1,0,1]);
  const result=coastalProfileNeighbors([[0,0,5]],grid,mask,{west:0,east:2,south:0,north:2});
  assert.equal(result[0][0].distance,0);
  assert.deepEqual(result[2],[]);
});

test('coastal fallback supplies a source-free narrow basin and marks extrapolation',()=>{
  const grid={nx:5,ny:5,dx:1000,dy:1000},mask=new Uint8Array(25);mask[11]=mask[12]=mask[13]=1;
  const rows=[[0,0,5],[4,4,15]],bounds={west:0,east:4,south:0,north:4};
  const result=coastalProfileNeighbors(rows,grid,mask,bounds,new Map(),{extrapolate:true});
  for(const p of [11,12,13]){assert.equal(result[p].length,2);assert.ok(result[p].every(v=>v.extrapolated&&Number.isFinite(v.distance)));}
  assert.deepEqual(result[0],[]);
});
