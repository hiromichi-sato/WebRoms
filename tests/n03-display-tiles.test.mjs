import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadN03DisplayTiles,n03DisplayTileIds} from '../src/n03-display-tiles.js';
import {n03Classifier,loadN03Land} from '../src/n03-land.js';
import {landOverlayTriangles} from '../src/land-vector-overlay.js';
import {coastSegmentsForGroups} from '../src/coastline-overlay.js';

test('shared coast geometry omits tile seams and clips real coast to the domain',()=>{
  const tileBounds={west:0,east:1,south:0,north:1};
  const segments=coastSegmentsForGroups([{outer:[[0,0],[.7,0],[.7,1],[0,1]],tileBounds}],{west:.2,east:.8,south:.2,north:.8});
  assert.deepEqual(segments,[[[.7,.2],[.7,.8]]]);
});

test('geographic bounds directly select the enclosed quarter-degree IDs',()=>{
  assert.deepEqual(n03DisplayTileIds({west:140.72,east:140.76,south:40.825,north:40.85}),['562_163','563_163']);
  assert.deepEqual(n03DisplayTileIds({west:132,east:132.5,south:34,north:34.5}),['528_136','529_136','528_137','529_137']);
  assert.deepEqual(n03DisplayTileIds({west:-20,east:-10,south:30,north:40}),[]);
  assert.deepEqual(n03DisplayTileIds({west:140,east:140,south:30,north:40}),[]);
});
const fileFetch=async url=>{const b=await readFile(url);return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};};
for(const bounds of [{west:140.72,east:140.76,south:40.825,north:40.85},{west:132.2,east:132.7,south:34.1,north:34.5}]){
  test('display loader reads only relevant IDs and preserves land/sea: '+bounds.west,async()=>{
    const requested=[];
    const result=await loadN03DisplayTiles(bounds,async u=>{requested.push(String(u));return fileFetch(u);});
    assert.ok(result.tiles.length>0);
    assert.equal(requested.length,result.tiles.length+1);
    assert.ok(requested.every(p=>p.includes('/display/')));
    assert.ok(result.tiles.every(id=>n03DisplayTileIds(bounds).includes(id)));
    const triangles=landOverlayTriangles(result.groups,bounds);
    assert.ok(triangles.length>0&&triangles.every(v=>v>=0&&v<=1));
    const classify=n03Classifier(await loadN03Land(bounds,fileFetch));
    const hit=(x,y)=>{
      for(let i=0;i<triangles.length;i+=6){
        if(Math.abs((triangles[i+2]-triangles[i])*(triangles[i+5]-triangles[i+1])-(triangles[i+4]-triangles[i])*(triangles[i+3]-triangles[i+1]))<1e-12)continue;
        const sign=(ax,ay,bx,by)=>(x-bx)*(ay-by)-(ax-bx)*(y-by);
        const a=sign(triangles[i],triangles[i+1],triangles[i+2],triangles[i+3]),b=sign(triangles[i+2],triangles[i+3],triangles[i+4],triangles[i+5]),c=sign(triangles[i+4],triangles[i+5],triangles[i],triangles[i+1]);
        if(!((a<0||b<0||c<0)&&(a>0||b>0||c>0)))return true;
      }return false;
    };
    for(let j=0;j<13;j++)for(let i=0;i<13;i++){
      const u=(i+.37)/13,v=(j+.41)/13,expected=classify(bounds.west+u*(bounds.east-bounds.west),bounds.south+v*(bounds.north-bounds.south));
      if(expected!==null)assert.equal(hit(u,v),expected,`land/sea ${i},${j}`);
    }
  });
}
