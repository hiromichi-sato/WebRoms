import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { ensureOcean, prepareForcing } from '../src/ocean-boundary.js';
import { particleForcing } from '../src/particle-tide.js';
import { TIDAL_DAY } from '../src/tide-analysis.js';

test('particle tides preserve replay prefix and repeat exactly with continuous seams', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'uniform', geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  ensureOcean(c).tideMode = 'auto';
  const f = buildFields(c), start = 7200, original = prepareForcing(c, f), { forcing, metadata } = particleForcing(c, f, start, 3 * TIDAL_DAY);
  assert.equal(metadata.start, start); assert.equal(metadata.period, TIDAL_DAY);
  for (const t of [0, 3600, start]) assert.equal(forcing.value(0, t), original.value(0, t));
  assert.equal(forcing.value(0, 100), original.value(0, 0) * (1 - 100 / 1800) + original.value(0, 1800) * 100 / 1800);
  for (const phase of [0, 1800, 12000, TIDAL_DAY - .001]) assert.ok(Math.abs(forcing.value(0, start + phase) - forcing.value(0, start + phase + TIDAL_DAY)) < 1e-12);
  assert.ok(Math.abs(forcing.value(0, start + TIDAL_DAY - .001) - forcing.value(0, start + TIDAL_DAY + .001)) < 1e-6);
  assert.ok(forcing.times.every((t, i) => !i || t > forcing.times[i - 1]));
});
test('no forcing remains absent, and insufficient source coverage is rejected', () => {
  const c = defaults(), f = buildFields(c); ensureOcean(c).tideMode = 'off';
  assert.equal(particleForcing(c, f, 100, 86400).forcing, null);
  c.grid.geoBounds = { west: 135, east: 136, south: 34, north: 35 }; c.ocean.tideMode = 'auto'; c.ocean.predictionDays = 1;
  assert.throws(() => particleForcing(c, f, 100, 86400), /１周期/);
});
