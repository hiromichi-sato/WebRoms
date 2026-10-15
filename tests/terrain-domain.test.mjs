import test from 'node:test';
import assert from 'node:assert/strict';
import { cropTerrainGrid, resizeTerrainGrid, finalizeTerrainRebuild } from '../src/terrain-domain.js';

test('resizing rebuilt terrain does not mutate metadata when the retained source has no coastline',()=>{
  const original={nx:16,ny:16,dx:1000,dy:1000,minDepth:50,maxDepth:50,geoBounds:{west:140,east:141,south:40,north:41},edits:Object.fromEntries(Array.from({length:256},(_,p)=>[p,50]))};
  const rebuilt=resizeTerrainGrid(original,32,16);
  rebuilt.coastline={baseDepths:{0:50},provenance:Array(512).fill('input')};
  finalizeTerrainRebuild(rebuilt);
  const before=structuredClone(rebuilt);
  resizeTerrainGrid(rebuilt,32,32);
  assert.deepEqual(rebuilt,before);
});


test('rectangle crop copies exact cells and preserves spacing and geographical coordinates',()=>{
  const grid={nx:20,ny:16,nz:5,dx:1000,dy:1500,minDepth:1,maxDepth:500};
  const fields={h:Float64Array.from({length:320},(_,p)=>p+1),mask:new Uint8Array(320).fill(1)};fields.mask[3*20+4]=0;
  const result=cropTerrainGrid(grid,fields,{i0:4,i1:15,j0:3,j1:12},{west:130,east:149,south:30,north:45});
  assert.equal(result.nx,12);assert.equal(result.ny,10);assert.equal(result.dx,1000);assert.equal(result.dy,1500);
  assert.equal(result.edits[0],0);assert.equal(result.edits[1],66);assert.deepEqual(result.geoBounds,{west:134,east:145,south:33,north:42});
  assert.equal(cropTerrainGrid(grid,fields,{i0:4,i1:15,j0:3,j1:12}).geoBounds,null);
  assert.throws(()=>cropTerrainGrid(grid,fields,{i0:0,i1:5,j0:0,j1:12}));
});

test('imported terrain survives grid count changes and coarse-to-fine roundtrips via JSON',()=>{
  const grid={nx:32,ny:24,dx:1000,dy:1500,minDepth:100,maxDepth:1000,geoSource:'Imported',geoBounds:{west:139,east:142,south:40,north:42},edits:Object.fromEntries(Array.from({length:768},(_,p)=>[p,p%32<4?0:p+100]))};
  const coarse=resizeTerrainGrid(grid,16,12);assert.equal(Object.keys(coarse.edits).length,192);assert.deepEqual(coarse.geoBounds,grid.geoBounds);
  assert.ok(Math.abs(coarse.dx*15-grid.dx*31)<1e-9);
  const restored=resizeTerrainGrid(JSON.parse(JSON.stringify(coarse)),32,24);
  assert.deepEqual(restored.edits,grid.edits);assert.equal(restored.dx,grid.dx);
  const changed=resizeTerrainGrid(grid,16,12);changed.edits[90]=987;
  const next=resizeTerrainGrid(changed,32,24);assert.equal(next.terrainResampling.reference.edits[90],987);
  assert.throws(()=>resizeTerrainGrid(grid,4,12));
});

test('cropping a coarse grid retains the original complete terrain and composes a calculation window',()=>{
  const original={nx:48,ny:32,dx:2000,dy:2000,minDepth:100,maxDepth:500,geoBounds:{west:139,east:142,south:40,north:42},edits:Object.fromEntries(Array.from({length:48*32},(_,p)=>[p,100+(p%7)*10]))};
  const coarse=resizeTerrainGrid(original,24,16);
  const fields={h:Float64Array.from(Object.values(coarse.edits)),mask:new Uint8Array(24*16).fill(1)};
  const cropped=cropTerrainGrid(coarse,fields,{i0:4,i1:19,j0:4,j1:11},coarse.geoBounds);
  assert.deepEqual(cropped.terrainResampling.reference.edits,original.edits);
  assert.equal(cropped.terrainResampling.reference.nx,48);
  assert.deepEqual(cropped.terrainResampling.window,{x0:4/23,x1:19/23,y0:4/15,y1:11/15});
  const finer=resizeTerrainGrid(JSON.parse(JSON.stringify(cropped)),64,40);
  assert.deepEqual(finer.geoBounds,cropped.geoBounds);
  assert.deepEqual(finer.terrainResampling.reference.edits,original.edits);
  assert.ok(Math.abs(finer.dx*63-cropped.dx*15)<1e-8);
  assert.ok(Object.values(finer.edits).every(Number.isFinite));
  const nestedFields={h:Float64Array.from(Object.values(cropped.edits)),mask:new Uint8Array(cropped.nx*cropped.ny).fill(1)};
  const nested=cropTerrainGrid(cropped,nestedFields,{i0:4,i1:11,j0:0,j1:7},cropped.geoBounds);
  assert.deepEqual(nested.terrainResampling.reference.edits,original.edits);
  assert.ok(Math.abs(nested.terrainResampling.window.x0-8/23)<1e-12);
  cropped.edits[0]+=1;
  const edited=resizeTerrainGrid(cropped,32,24);
  assert.deepEqual(edited.terrainResampling.originalReference.edits,original.edits);
});

test('refinement maps original constraints once and retains sub-land depths for sea reconstruction',()=>{
  const edits=Object.fromEntries(Array.from({length:256},(_,p)=>[p,p%16<5?0:100+p%16]));
  const grid={nx:16,ny:16,dx:1000,dy:1000,minDepth:100,maxDepth:200,geoBounds:{west:140,east:141,south:40,north:41},edits,
    contourInterpolation:{observedDepths:{136:50,137:60}},
    coastline:{provenance:Array(256).fill('input'),baseDepths:Object.fromEntries(Array.from({length:256},(_,p)=>[p,100+p%16]))}};
  const refined=resizeTerrainGrid(grid,32,32);
  assert.equal(Object.keys(refined.contourInterpolation.observedDepths).length,2);
  assert.equal(refined.edits[0],0);assert.equal(refined.coastline.baseDepths[0],100);
  const reference=structuredClone(refined.terrainResampling.reference);
  refined.edits[0]=75;finalizeTerrainRebuild(refined);
  const again=resizeTerrainGrid(JSON.parse(JSON.stringify(refined)),48,48);
  assert.deepEqual(again.terrainResampling.reference,reference);
  assert.equal(Object.keys(again.contourInterpolation.observedDepths).length,2);
});
