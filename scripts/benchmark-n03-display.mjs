import {readFile} from 'node:fs/promises';
import {loadN03Land} from '../src/n03-land.js';
import {landPolygonGroups} from '../src/land-display-mask.js';
import {loadN03DisplayTiles} from '../src/n03-display-tiles.js';
import {landOverlayTriangles} from '../src/land-vector-overlay.js';

for(const [region,bounds] of [
  ['Aomori Bay',{west:140.72,east:140.76,south:40.825,north:40.85}],
  ['Hiroshima',{west:132.2,east:132.7,south:34.1,north:34.5}],
  ['Tsugaru Strait',{west:139,east:142,south:40,north:42}],
]){
  const result={region};
  for(const mode of ['original','prepared']){
    let bytes=0,files=0;
    const fetcher=async url=>{
      const b=await readFile(url);bytes+=b.length;files++;
      return {ok:true,json:async()=>JSON.parse(b),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)};
    };
    const start=performance.now();
    const groups=mode==='original'?landPolygonGroups(await loadN03Land(bounds,fetcher)):(await loadN03DisplayTiles(bounds,fetcher)).groups;
    const loaded=performance.now();
    const triangles=landOverlayTriangles(groups,bounds);
    result[mode]={files,bytes,vertices:groups.reduce((n,g)=>n+g.outer.length+g.holes.flat().length,0),triangles:triangles.length/6,
      loadMs:Math.round(loaded-start),geometryMs:Math.round(performance.now()-loaded),totalMs:Math.round(performance.now()-start)};
  }
  console.log(JSON.stringify(result));
}
