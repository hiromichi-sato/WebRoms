import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './runtime-helper.mjs';
import { buildFields } from '../src/model.js';
import { particlePlan, particleSettings, initialParticleRecord, PARTICLE_DEFAULTS } from '../src/particle-experiment.js';
import { visibleParticles } from '../src/particle-view.js';

test('particle plans validate wet interior releases, duration, sampling and bounded output size', () => {
  const c = fixture(); c.particles = { ...PARTICLE_DEFAULTS, cell: 27, count: 16, hours: 1, interval: 61 };
  const f = buildFields(c), plan = particlePlan(c, f, 100);
  assert.equal(plan.actualInterval, 70); assert.equal(plan.steps, 360);
  assert.equal(plan.xyz.length, 48);
  for (let i = 0; i < 16; i++) { assert(Math.abs(plan.xyz[i * 3] - 3) <= .3); assert(Math.abs(plan.xyz[i * 3 + 1] - 3) <= .3); }
  assert.equal(initialParticleRecord(plan, 100).positions.length, 64);
  for (const patch of [{ cell: 0 }, { count: 513 }, { depth: 40 }, { hours: 0 }, { interval: 1 }, { mode: 'fish' }]) {
    assert.throws(() => particlePlan({ ...c, particles: { ...c.particles, ...patch } }, f));
  }
  const tide = { ...c, ocean: { tideMode: 'idealized', predictionDays: .001 } };
  tide.grid.geoBounds = { west: 130, east: 131, south: 30, north: 31 };
  for (const b of Object.values(tide.boundary)) b.mode = 'specified';
  assert.throws(() => particlePlan(tide, f), /潮汐/);
});

test('legacy JSON receives independent defaults without altering its ocean configuration', () => {
  const c = fixture(), before = structuredClone(c), settings = particleSettings(c);
  assert.equal(settings.cell, null); settings.count = 100;
  assert.equal(particleSettings(c).count, 25); assert.deepEqual(c, before);
});

test('multiple releases preserve source identity and reject combined particle limits', () => {
  const c = fixture();
  c.particles = { hours: .1, interval: 20, sources: [
    { id: 'west', cell: 27, count: 2, depth: 2, color: '#ff0000' },
    { id: 'east', cell: 36, count: 3, depth: 5, color: '#00ff00' }
  ] };
  const f = buildFields(c), plan = particlePlan(c, f);
  assert.equal(plan.count, 5); assert.deepEqual([...plan.sourceIndex], [1, 1, 2, 2, 2]);
  assert.equal(plan.xyz[6], 4); assert.equal(plan.xyz[8], 5);
  c.particles.sources[1].count = 512; assert.throws(() => particlePlan(c, f), /合計/);
  c.particles.sources[1].count = 3; c.particles.sources[1].id = 'west'; assert.throws(() => particlePlan(c, f), /識別ID/);
});

test('display contains only current particles, with origin colors and no historical positions', () => {
  const view = { particles: {
    sources: [{ color: '#ff0000' }, { color: '#00ff00' }], sourceIndex: [1, 2],
    records: [{ positions: new Float64Array([1, 1, 2, 1, 2, 2, 5, 1]) }, { positions: new Float64Array([3, 3, 4, 1, 4, 4, 6, 2]) }]
  } };
  const particles = visibleParticles(view);
  assert.equal(particles.length, 1); assert.deepEqual([...particles[0].position], [3, 3, 4, 1]); assert.equal(particles[0].color, '#ff0000');
  view.particles.records.at(-1).positions[7] = 1;
  assert.equal(visibleParticles(view)[1].color, '#00ff00');
});
