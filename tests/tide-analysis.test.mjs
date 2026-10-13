import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { ensureOcean, boundaryPoints, gridSignature } from '../src/ocean-boundary.js';
import { analyzeBoundaryTides } from '../src/tide-analysis.js';
import { runPeriod } from '../src/run-period.js';

function fixture() {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, preset: 'uniform', geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  ensureOcean(config).tideMode = 'auto';
  return { config, fields: buildFields(config) };
}
test('four boundary means retain opposing phases and omit closed boundaries', () => {
  const { config, fields } = fixture(), times = Array.from({ length: 49 }, (_, i) => i * 1800);
  config.ocean.tides = { gridSignature: gridSignature(config), epoch: config.ocean.startUtc, source: 'test', times,
    points: boundaryPoints(config, fields).map(p => ({ ...p, height: times.map(t => (p.cell % 8 === 0 ? 1 : p.cell % 8 === 7 ? -1 : 0) * Math.sin(t / 43200 * Math.PI * 2)) })) };
  const result = analyzeBoundaryTides(config, fields, 86400);
  assert.deepEqual(result.series.map(s => s.side), ['west', 'east', 'south', 'north']);
  assert.ok(result.series[0].values[6] > .9);
  assert.ok(result.series[1].values[6] < -.9);
  assert.ok(Math.abs(result.mean[6]) < 1e-12);
  config.boundary.west.mode = 'closed';
  assert.deepEqual(analyzeBoundaryTides(config, fields, 86400).series.map(s => s.side), ['east', 'south', 'north']);
});
test('dummy prediction distinguishes spring/neap and discloses its source', () => {
  const { config, fields } = fixture(), result = analyzeBoundaryTides(config, fields, 30 * 86400);
  assert.equal(result.series.length, 4);
  assert.ok(result.varied);
  assert.match(result.source, /ダミー/);
  assert.match(result.summary, /大潮相当あり/);
  assert.match(result.summary, /小潮相当あり/);
});
test('duration exposes days, hours and UTC calendar end', () => {
  const { config } = fixture(); config.numerics.dt = 60; config.numerics.maxSteps = 43200;
  const period = runPeriod(config);
  assert.equal(period.days, 30); assert.equal(period.hours, 720); assert.equal(period.endDate, '2026-01-31');
});
