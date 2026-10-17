import test from 'node:test';
import assert from 'node:assert/strict';
import {subsetLandDisplay} from '../src/land-display-subset.js';

test('cropped display reuses prepared geometry and retains source arrays',()=>{
  const triangles=new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1]);
  const source={triangles,bounds:{west:0,east:2,south:0,north:2},segments:[[[0,0],[2,2]]],tiles:['test']};
  const result=subsetLandDisplay(source,{west:.5,east:1.5,south:.5,north:1.5});
  assert.equal(result.reused,true);assert.equal(result.bytes,0);assert.deepEqual(result.segments,[[[.5,.5],[1.5,1.5]]]);
  assert.ok(result.triangles.every(v=>v>=0&&v<=1));
  let area=0;const a=result.triangles;
  for(let i=0;i<a.length;i+=6)area+=Math.abs((a[i+2]-a[i])*(a[i+5]-a[i+1])-(a[i+4]-a[i])*(a[i+3]-a[i+1]))/2;
  assert.ok(Math.abs(area-1)<1e-6);assert.equal(triangles.length,12);
});
