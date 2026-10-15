import test from 'node:test';
import assert from 'node:assert/strict';
import { histogramFront,frontBarriers } from '../src/climate-fronts.js';
import { coastalProfileNeighbors } from '../src/coastal-climate.js';

test('histogram detection rejects sparse and uniform evidence and lowers sparse confidence',()=>{
  assert.equal(histogramFront([1,1,1,10,10,10]),null);
  assert.equal(histogramFront(Array(20).fill(3)),null);
  assert.equal(histogramFront(Array.from({length:20},(_,i)=>i)),null);
  const small=histogramFront([1,1,1,1,10,10,10,10]);
  const full=histogramFront([...Array(10).fill(1),...Array(10).fill(10)]);
  assert.ok(full.threshold>1&&full.threshold<10);
  assert.ok(small.confidence<full.confidence);
});

test('candidate front lines penalize crossing but preserve exact source values',()=>{
  const grid={nx:17,ny:17,dx:1,dy:1},mask=new Uint8Array(289).fill(1),bounds={west:0,east:4,south:0,north:4};
  const rows=Array.from({length:25},(_,p)=>[Math.floor(p/5),p%5,p%5<2?2:20,8]);
  const base=coastalProfileNeighbors(rows,grid,mask,bounds);
  const {barriers,lines}=frontBarriers(rows,0,grid,mask,bounds,base);
  assert.ok(lines.length>0);assert.ok([...barriers.values()].every(v=>v>1&&v<=10));
  const filtered=coastalProfileNeighbors(rows,grid,mask,bounds,barriers);
  const p=8*17+5;
  const weight=list=>list.reduce((sum,v)=>sum+v.row[2]/v.distance,0)/list.reduce((sum,v)=>sum+1/v.distance,0);
  assert.ok(weight(filtered[p])<weight(base[p]));
  assert.equal(filtered[8*17+4][0].distance,0);
  assert.equal(frontBarriers(rows,1,grid,mask,bounds,base).lines.length,0);
});
