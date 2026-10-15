import test from 'node:test';
import assert from 'node:assert/strict';
import { planEtopo, parseEtopoRegion, coversEtopo, resolveEtopo, etopoProxyPath } from '../src/etopo-region.js';
import { etopoProxyUrl } from '../scripts/etopo-proxy.mjs';

function document(r) {
  const rows = [];
  for (let j = 0; j < r.height; j++) for (let i = 0; i < r.width; i++) rows.push([-90+(r.y0+j*r.stride+.5)/240,(r.x0+i*r.stride+.5)/240,i%2 ? 15 : -50]);
  return { table: { columnNames: ['latitude','longitude','z'], rows } };
}
test('global region plans are bounded and cover both hemispheres, Greenwich and poles', () => {
  for (const b of [{west:-123,east:-122,south:37,north:38},{west:151,east:152,south:-34,north:-33},{west:-1,east:1,south:50,north:51},{west:0,east:180,south:-90,north:90},{west:-180,east:0,south:80,north:90}]) {
    const requests = planEtopo(b), tiles = requests.map(r=>parseEtopoRegion(document(r),r));
    assert.ok(requests.reduce((sum,r)=>sum+r.width*r.height,0)<=400000);
    for (const x of [b.west,(b.west+b.east)/2,b.east]) for (const y of [b.south,b.north]) assert.ok(tiles.some(t=>coversEtopo(t,x,y)),`${x},${y}`);
    for (const r of requests) assert.match(etopoProxyUrl(etopoProxyPath(r)),/^https:\/\/oceanwatch\.pifsc\.noaa\.gov\//);
  }
});
test('regional data validates coordinates, duplicates and missing values', () => {
  const r = planEtopo({west:10,east:10.01,south:20,north:20.01})[0], doc = document(r);
  assert.equal(parseEtopoRegion(doc,r).elevation.length,r.width*r.height);
  assert.throws(()=>parseEtopoRegion({table:{...doc.table,rows:doc.table.rows.slice(1)}},r),/不完全/);
  doc.table.rows[1]=doc.table.rows[0]; assert.throws(()=>parseEtopoRegion(doc,r),/格子座標/);
});
test('download resolves an uncovered region and does not invent land when offline', async () => {
  const grid = { nx:16,ny:16,geoBounds:{west:10,east:10.1,south:80,north:80.1} }, requests=planEtopo(grid.geoBounds);
  let calls=0;
  const resolved=await resolveEtopo(grid,{fetcher:async path=>{ assert.equal(path,etopoProxyPath(requests[calls])); return {ok:true,text:async()=>JSON.stringify(document(requests[calls++]))}; }});
  assert.equal(Object.keys(resolved.tiles).length,1);
  await assert.rejects(resolveEtopo(grid,{fetcher:async()=>{throw new Error('offline');}}),/陸海判定を生成できません/);
});
test('proxy cannot fetch arbitrary hosts or oversized requests', () => {
  for (const path of ['/__webroms_etopo?url=http://localhost','/__webroms_etopo?y0=0&y1=43199&x0=0&x1=86399&stride=1','/__webroms_etopo?y0=0&y1=5&x0=0&x1=5&stride=0']) assert.throws(()=>etopoProxyUrl(path));
});
