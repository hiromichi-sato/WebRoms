import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomScale, zoomOffset } from '../src/view-navigation.js';
test('all flat views share reversible zoom and permit a view smaller than the domain',()=>{
  assert.equal(zoomScale(1,-1),.8); assert.equal(zoomScale(.8,1),1);
  let scale=1; for(let i=0;i<100;i++) scale=zoomScale(scale,1); assert.equal(scale,32);
  for(let i=0;i<100;i++) scale=zoomScale(scale,-1); assert.equal(scale,.25);
});
test('zoom retains the world coordinate under the cursor',()=>{
  const anchor=120,origin=250,offset=30,ratio=1.25;
  assert.equal((anchor-origin-zoomOffset(offset,anchor,origin,ratio))/ratio,anchor-origin-offset);
});
