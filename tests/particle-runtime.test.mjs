import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NetCDFReader } from 'netcdfjs';
import { fixture, runCase } from './runtime-helper.mjs';
import { snapshot } from '../src/runtime-state.js';
import { writeInputs } from '../src/roms-input.js';
import { particlePlan, PARTICLE_DEFAULTS, seedParticles, particleSnapshot, initialParticleRecord, particleNetcdf } from '../src/particle-experiment.js';

test('actual ROMS FLOATS starts after the ocean RUN, moves, reseeds and exports trajectories', async () => {
  const c = fixture(); c.numerics.calculateDiffusion = true;
  c.wind = { pattern: 'uniform', speed: 8, direction: 90, climate: 'annual', reference: 'japan', edits: {} };
  c.particles = { ...PARTICLE_DEFAULTS, cell: 27, count: 9, depth: 2, hours: .1, interval: 30, mode: 'depth' };
  const create = (await import('../runtime/gls/physical/roms.js')).default, logs = [];
  const runtime = await create({ print: s => logs.push(s), printErr: s => logs.push(s) });
  assert.equal(runtime._webroms_floats_version?.(), 1);
  runtime.FS.writeFile('varinfo.dat', await readFile(new URL('../runtime/varinfo.dat', import.meta.url)));
  const f = writeInputs(runtime, c, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'), 10000);
  assert.equal(runtime._webroms_init(), 0, logs.slice(-20).join('\n'));
  try {
    for (let i = 0; i < 60; i++) assert.equal(runtime._webroms_step(), 0);
    const start = runtime._webroms_time(), plan = particlePlan(c, f, 60);
    seedParticles(runtime, plan);
    const records = [initialParticleRecord(plan, start)];
    for (let i = 0; i < plan.steps; i++) { assert.equal(runtime._webroms_step(), 0); records.push({ time: runtime._webroms_time(), positions: particleSnapshot(runtime, plan.count) }); }
    const last = records.at(-1).positions;
    assert.equal(records[1].positions[3], 1, 'release activates on the first additional step');
    assert.equal(last[3], 1); assert(last.every(Number.isFinite));
    assert(Math.abs(last[0] - plan.xyz[0]) > 1e-7, 'wind-driven current advects standard FLOATS');
    assert(Math.abs(last[2] - 2) < 1e-5, `constant depth: ${last[2]}`);
    assert.equal(runtime._webroms_time(), start + plan.steps * c.numerics.dt);
    const bytes = particleNetcdf(runtime, c, plan, records), nc = new NetCDFReader(bytes);
    assert.equal(nc.dimensions.find(d => d.name === 'trajectory').size, 9);
    assert.equal(nc.getDataVariable('ocean_time')[0], start);
    assert.equal(nc.getDataVariable('status').at(-1), 1);
    c.particles = { ...c.particles, sources: [
      { id: 'a', cell: 27, count: 2, depth: 2, color: '#ff0000' },
      { id: 'b', cell: 36, count: 3, depth: 5, color: '#00ff00' }
    ] };
    const multi = particlePlan(c, f, 100);
    seedParticles(runtime, multi);
    for (let i = 0; i < 5; i++) assert.equal(runtime._webroms_step(), 0);
    const multiRecords = [initialParticleRecord(multi, runtime._webroms_time() - 50), { time: runtime._webroms_time(), positions: particleSnapshot(runtime, multi.count) }];
    const multiNc = new NetCDFReader(particleNetcdf(runtime, c, multi, multiRecords));
    assert.deepEqual(multiNc.getDataVariable('release_site_index'), [1, 1, 2, 2, 2]);
    assert.deepEqual(multiNc.getDataVariable('release_cell'), [27, 36]);
    assert.deepEqual(multiNc.getDataVariable('release_depth'), [2, 5]);
    const multiLast = multiRecords.at(-1).positions;
    runtime._webroms_floats_pause();
    assert.equal(runtime._webroms_step(), 0);
    assert.deepEqual(particleSnapshot(runtime, multi.count), multiLast);
    delete c.particles.sources; c.particles.count = 1; c.particles.mode = '3d'; seedParticles(runtime, particlePlan(c, f, 100));
    for (let i = 0; i < 5; i++) assert.equal(runtime._webroms_step(), 0);
    const next = particleSnapshot(runtime, 1); assert.equal(next[3], 1); assert(next.every(Number.isFinite));
  } finally { runtime._webroms_finalize(); }
});

for (const mixing of [false, true]) for (const model of ['physical', 'npzd', 'nemuro']) {
  test(`${model} ${mixing ? 'GLS' : 'fixed'} standard FLOATS leaves the coupled ocean unchanged`, async () => {
    const c = fixture(model === 'physical' ? 'uniform' : model); c.numerics.calculateDiffusion = mixing;
    c.particles = { ...PARTICLE_DEFAULTS, cell: 27, count: 1, depth: 10, mode: '3d', hours: c.numerics.dt * 10 / 3600, interval: c.numerics.dt };
    const path = mixing ? `gls/${model}/roms.js` : model === 'physical' ? 'roms.js' : `${model}/roms.js`;
    const create = (await import(`../runtime/${path}`)).default, logs = [];
    const runtime = await create({ print: s => logs.push(s), printErr: s => logs.push(s) });
    assert.equal(runtime._webroms_floats_version?.(), 1);
    runtime.FS.writeFile('varinfo.dat', await readFile(new URL('../runtime/varinfo.dat', import.meta.url)));
    const f = writeInputs(runtime, c, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'), 1000);
    assert.equal(runtime._webroms_init(), 0, logs.slice(-20).join('\n'));
    try {
      for (let i = 0; i < 5; i++) assert.equal(runtime._webroms_step(), 0);
      seedParticles(runtime, particlePlan(c, f, 5));
      for (let i = 0; i < 10; i++) assert.equal(runtime._webroms_step(), 0);
      const particle = particleSnapshot(runtime, 1); assert.equal(particle[3], 1); assert(particle.every(Number.isFinite));
      const tracked = snapshot(runtime, c), plain = await runCase(c, 15);
      assert.deepEqual(tracked, plain.state, 'passive tracking must not modify hydrodynamics or biology');
      const bytes = particleNetcdf(runtime, { ...c, grid: { ...c.grid, geoBounds: { west: 130, east: 131, south: 30, north: 31 } } }, particlePlan(c, f), [{ time: runtime._webroms_time(), positions: particle }]);
      const nc = new NetCDFReader(bytes); assert(nc.getDataVariable('longitude')[0] >= 130);
    } finally { runtime._webroms_finalize(); }
  });
}
