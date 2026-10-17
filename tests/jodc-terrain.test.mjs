import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJegg500,jeggTerrain} from '../src/jodc-terrain.js';
import {importTerrain} from '../src/shape-io.js';
import {terrainFileStatus} from '../src/terrain-file-status.js';
import {defaults} from '../src/model.js';
import {zipSync,strToU8} from '../vendor/fflate.js';
const fixed=(flag,lat,lon,depth)=>`${flag}${lat.toFixed(5).padStart(10)}${lon.toFixed(5).padStart(10)}${String(depth).padStart(6)}`;
const text=[fixed(0,34,135,10),fixed(1,34,135.1,20),fixed(0,34.1,135,30),fixed(1,34.1,135.1,40)].join('\r\n');
const grid={...defaults().grid,nx:8,ny:8};
test('official fixed-width and delimited J-EGG500 formats preserve flags, coordinates and wet shallow data',()=>{
  const parsed=parseJegg500(text);assert.equal(parsed.measured,2);assert.equal(parsed.interpolated,2);
  assert.deepEqual(parsed.features[0].geometry.coordinates,[135,34]);
  assert.equal(parseJegg500('flag,latitude,longitude,depth\n0,34,135,0').features[0].depth,0);
  assert.throws(()=>parseJegg500('2 34 135 30'),/種別/);
  assert.throws(()=>parseJegg500('0,34,135,'),/4項目/);
  const terrain=jeggTerrain([{name:'jegg.dat',text}],grid);
  assert.deepEqual(terrain.geoBounds,{west:135,east:135.1,south:34,north:34.1});
  assert.ok(Object.values(terrain.edits).every(v=>Number.isFinite(v)&&v>0));
  assert.equal(terrain.jodcSource.sourceInterpolatedPoints,2);
});
test('terrain importer accepts J-EGG500 text and ZIP and rejects mixed inputs',async()=>{
  const bytes=strToU8(text),file={name:'jegg.dat',size:bytes.length,arrayBuffer:async()=>bytes.buffer};
  const terrain=await importTerrain([file],grid);assert.match(terrain.geoSource,/JODC/);
  const zip=zipSync({'data/jegg.dat':bytes,'README.txt':strToU8('description')});
  const zipped=await importTerrain([{name:'jegg.zip',size:zip.length,arrayBuffer:async()=>zip.buffer}],grid);
  assert.deepEqual(zipped.edits,terrain.edits);
  assert.equal(terrainFileStatus([file])[0].state,'ready');
  assert.equal(terrainFileStatus([file,{name:'terrain.nc'}])[0].state,'missing');
});

test('multiple JDOSS archives and text files merge and preserve every selected filename',async()=>{
  const bytes=strToU8(text),zip=zipSync({'same.dat':bytes});
  const file=name=>({name,size:zip.length,arrayBuffer:async()=>zip.buffer});
  const merged=await importTerrain([file('north.zip'),file('south.zip')],grid);
  assert.deepEqual(merged.jodcSource.selectedFiles,['north.zip','south.zip']);
  assert.deepEqual(merged.jodcSource.files,['north.zip/same.dat','south.zip/same.dat']);
  assert.equal(merged.jodcSource.measuredOrContourPoints,4);
  assert.equal(terrainFileStatus([file('north.zip'),file('south.zip')])[0].state,'ready');
  assert.equal(terrainFileStatus([file('north.zip'),{name:'east.dat'}])[0].state,'ready');
});
