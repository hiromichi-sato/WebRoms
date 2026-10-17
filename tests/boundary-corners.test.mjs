import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFields} from '../src/model.js';
import {resolvedBoundaries} from '../src/boundary-initial.js';
import {smoothTidalCorners} from '../src/boundary-corners.js';
import {fixture} from './runtime-helper.mjs';
import {readFile} from 'node:fs/promises';
import createRoms from '../runtime/roms.js';
import {NetCDFReader} from 'netcdfjs';
import {writeInputs} from '../src/roms-input.js';
import {ensureOcean,boundaryPoints,gridSignature,prepareForcing} from '../src/ocean-boundary.js';
import {tideContext} from '../src/tide-analysis.js';

function setup(model='npzd'){
  const c=fixture(model);Object.assign(c.grid,{nx:12,ny:10});
  for(const [side,value] of Object.entries({west:10,east:20,south:30,north:40})){
    const b=c.boundary[side];b.mode='specified';b.fromInitial=false;b.zeta=value/100;b.ubar=value/100;b.vbar=-value/100;
    b.layers.forEach(l=>{for(const key of Object.keys(l))l[key]=['u','v'].includes(key)?value/100:value;});
  }
  return c;
}
for(const model of ['npzd','nemuro'])test(`all four corners match for rho/u/v and biology without mutating ${model} inputs`,()=>{
  const c=setup(model),f=buildFields(c),before=structuredClone(c),r=resolvedBoundaries(c,f);
  for(const key of ['zeta','ubar','vbar','temp','salt','u','v',...Object.keys(f.biology)]){
    const nx=f.nx-(['u','ubar'].includes(key)?1:0),ny=f.ny-(['v','vbar'].includes(key)?1:0);
    for(let k=0;k<(['zeta','ubar','vbar'].includes(key)?1:f.nz);k++){
      const at=(side,q)=>r[side].painted[key][k][q];
      assert.equal(at('west',0),at('south',0));assert.equal(at('east',0),at('south',nx-1));
      assert.equal(at('west',ny-1),at('north',0));assert.equal(at('east',ny-1),at('north',nx-1));
    }
  }
  assert.equal(r.west.painted.temp[0][0],20);
  assert.ok(r.west.painted.temp[0][1]>r.west.painted.temp[0][2]);
  assert.equal(r.west.painted.temp[0][3]??r.west.layers[0].temp,10);
  assert.deepEqual(c,before);assert.deepEqual(resolvedBoundaries(c,f),r);
});
test('closed, periodic and dry corners do not mix boundary data',()=>{
  for(const mode of ['closed','periodic']){
    const c=setup();c.boundary.south.mode=mode;
    if(mode==='periodic')c.boundary.north.mode='periodic';
    assert.equal(resolvedBoundaries(c,buildFields(c)).west.painted.temp?.[0]?.[0],undefined);
  }
  const c=setup(),f=buildFields(c);f.mask[0]=0;f.maskU[0]=0;f.maskV[0]=0;
  assert.equal(resolvedBoundaries(c,f).west.painted.temp?.[0]?.[0],undefined);
});
test('tidal blending preserves phase cancellation, uniform waves and the far edge',()=>{
  const c=setup(),f=buildFields(c),omega=2*Math.PI/3600;
  const raw=(p,t)=>Math.cos(omega*t+(p===f.nx||p===1?Math.PI:0));
  const value=smoothTidalCorners(c.boundary,f,raw);
  for(const t of [0,200,900,1700])assert.ok(Math.abs(value(0,t))<1e-12);
  assert.equal(value(4,200),raw(4,200));
  const uniform=smoothTidalCorners(c.boundary,f,(_,t)=>Math.sin(omega*t));
  for(const p of [0,1,2,f.nx,f.nx*2])assert.ok(Math.abs(uniform(p,200)-Math.sin(omega*200))<1e-12);
  c.boundary.south.mode='closed';assert.equal(smoothTidalCorners(c.boundary,f,raw)(0,200),raw(0,200));
});

test('NetCDF corners match at every tide time and use the same tide as the chart',async()=>{
  const c=setup();c.ecosystem.enabled=false;
  c.grid.geoBounds={west:140,east:141,south:40,north:41};
  c.numerics.maxSteps=1;c.numerics.dt=10;
  ensureOcean(c);c.ocean.tideMode='auto';c.ocean.seaLevelEnabled=true;
  const f=buildFields(c);
  c.ocean.tides={format:'webroms-tides-v1',unit:'m',kind:'ocean-tide',source:'test',gridSignature:gridSignature(c),epoch:c.ocean.startUtc,times:[0,1800,3600],
    points:boundaryPoints(c,f).map(p=>({...p,height:[p.cell%2?.1:-.1,0,p.cell%2?-.1:.1]}))};
  const forcing=prepareForcing(c,f),chart=tideContext(c,f),before=structuredClone(c);
  for(const p of c.ocean.tides.points)for(const t of [0,900,1800,3600])assert.equal(forcing.value(p.cell,t),chart.value(p.cell,t));
  const runtime=await createRoms({print(){},printErr(){}});
  writeInputs(runtime,c,await readFile(new URL('../runtime/roms-template.in',import.meta.url),'utf8'));
  const nc=new NetCDFReader(runtime.FS.readFile('roms_bry.nc'));
  const west=nc.getDataVariable('zeta_west'),south=nc.getDataVariable('zeta_south'),east=nc.getDataVariable('zeta_east'),north=nc.getDataVariable('zeta_north');
  for(let t=0;t<forcing.times.length;t++){
    assert.equal(west[t*f.ny],south[t*f.nx]);assert.equal(east[t*f.ny],south[t*f.nx+f.nx-1]);
    assert.equal(west[t*f.ny+f.ny-1],north[t*f.nx]);assert.equal(east[t*f.ny+f.ny-1],north[t*f.nx+f.nx-1]);
  }
  assert.deepEqual(c,before);
});
