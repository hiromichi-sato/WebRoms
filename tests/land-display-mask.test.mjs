import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterLandMask,updateLandDisplayMask,landPolygonGroups,clipLandTriangle } from '../src/land-display-mask.js';
import { landOverlayTriangles } from '../src/land-vector-overlay.js';

test('overlay clips once, preserves holes, and reuses triangles across redraws',()=>{
  const polygons=[{outer:[[-10,-10],[10,-10],[10,10],[-10,10]],holes:[[[.25,.25],[.25,.75],[.75,.75],[.75,.25]]]},
    {outer:[[20,20],[21,20],[21,21],[20,21]],holes:[]}];
  const bounds={west:0,east:1,south:0,north:1};
  const a=landOverlayTriangles(polygons,bounds);
  assert.strictEqual(landOverlayTriangles(polygons,{...bounds}),a);
  assert.ok(a.length>0);assert.ok(a.every(v=>v>=0&&v<=1));
  let area=0;
  for(let i=0;i<a.length;i+=6)area+=Math.abs((a[i+2]-a[i])*(a[i+5]-a[i+1])-(a[i+4]-a[i])*(a[i+3]-a[i+1]))/2;
  assert.ok(Math.abs(area-.75)<1e-6);
  assert.notStrictEqual(landOverlayTriangles(polygons,{...bounds,east:2}),a);
  assert.equal(landOverlayTriangles([polygons[1]],bounds).length,0);
});
test('display mask uses N03 land without mutating model mask',()=>{
  const bounds={west:0,east:2,south:0,north:2},dataset={polygons:[{box:[0,0,1,2],rings:[[[0,0],[1,0],[1,2],[0,2],[0,0]]]}]};
  const mask=rasterLandMask(dataset,bounds,5,5);
  assert.equal(mask[0],1);assert.equal(mask[4],0);
  assert.deepEqual(rasterLandMask(null,bounds,5,5),new Uint8Array(25));
  const view={landDisplayMask:mask,fields:{mask:new Uint8Array(25).fill(1)}};
  updateLandDisplayMask(view,bounds,false,()=>{});
  assert.equal(view.landDisplayMask,null);assert.equal(view.showN03Land,false);
  assert.ok(view.fields.mask.every(v=>v===1));
});
test('vector mask preserves subcell boundaries, islands and holes',()=>{
  const outer=[[0,0],[2,0],[2,2],[0,2],[0,0]],hole=[[.3,.3],[.7,.3],[.7,.7],[.3,.7],[.3,.3]],island=[[.4,.4],[.6,.4],[.6,.6],[.4,.6],[.4,.4]];
  const groups=landPolygonGroups({polygons:[{rings:[hole,island,outer]}]});
  assert.equal(groups.length,2);assert.equal(groups.find(g=>g.outer.length===4&&g.outer[0][0]===0).holes.length,1);
  const clipped=clipLandTriangle([[-1,0],[2,0],[0,3]],{west:0,east:1,south:0,north:1});
  assert.ok(clipped.length>=3);assert.ok(clipped.every(([x,y])=>x>=0&&x<=1&&y>=0&&y<=1));
});
