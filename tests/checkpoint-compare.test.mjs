import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCheckpoint} from '../src/checkpoint-compare.js';
test('checkpoint heights allow one centimetre but preserve other checks',()=>{
  const before={zeta:[0],z_r:[-10],temp:[20],biology:{N:[2]}};
  assert.doesNotThrow(()=>checkCheckpoint(before,{...before,zeta:[.009],z_r:[-10.009]}));
  assert.throws(()=>checkCheckpoint(before,{...before,zeta:[.011]}),/許容差 0.01 m/);
  assert.throws(()=>checkCheckpoint(before,{...before,temp:[20.001]}),/temp/);
  assert.throws(()=>checkCheckpoint(before,{...before,zeta:[NaN]}),/zeta/);
});
