import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/model.js';
import { nonfiniteResultError, snapshot, fieldSizes } from '../src/runtime-state.js';

function config() {
  const c=defaults();Object.assign(c.grid,{nx:4,ny:3,nz:2,geoBounds:{west:140,east:143,south:40,north:42}});return c;
}
test('SSH error identifies grid, coordinates, time and invalid count',()=>{
  const c=config(),v=new Float64Array(12);v[6]=NaN;v[11]=Infinity;
  const m=nonfiniteResultError('zeta',v,c,{step:123,time:3600}).message;
  for(const text of ['海面高度（zeta）','i=3, j=2','経度142.00000°・緯度41.00000°','ステップ123','3600.0秒','2格子点','NaN','Infinity','発生源とは限りません'])assert.ok(m.includes(text),text);
  assert.ok(!m.includes('層目'));
});
test('staggered velocity reports half-cell location and layer from surface',()=>{
  const c=config(),u=new Float64Array(18);u[10]=NaN;
  const m=nonfiniteResultError('u',u,c).message;
  for(const text of ['東西流速（u）','i=2, j=1','海面から1層目','経度141.50000°','U格子'])assert.ok(m.includes(text),text);
  const v=new Float64Array(16);v[4]=NaN;
  assert.match(nonfiniteResultError('v',v,c).message,/緯度41.50000°/);
});
test('diagnostics limit examples and work without geographic coordinates',()=>{
  const c=config();delete c.grid.geoBounds;
  const m=nonfiniteResultError('temp',new Float64Array(24).fill(NaN),c).message;
  assert.match(m,/24格子点/);assert.match(m,/最初の5点/);assert.equal((m.match(/：NaN/g)||[]).length,5);assert.ok(!m.includes('経度'));
});
test('snapshot releases scratch memory when diagnostics stop a nonfinite field',()=>{
  const c=config();let freed=false;
  const sizes=Object.values(fieldSizes(c.grid,c.ecosystem.enabled,c.ecosystem.model));
  const r={HEAPF64:new Float64Array(256),_malloc:()=>8,_free:()=>{freed=true;},_webroms_time:()=>60,
    _webroms_copy:(id)=>{r.HEAPF64.fill(1);if(id===1)r.HEAPF64[7]=NaN;return sizes[id];}};
  assert.throws(()=>snapshot(r,c,{step:6}),/海面高度（zeta）/);assert.equal(freed,true);
});
