import test from 'node:test';
import assert from 'node:assert/strict';
import { plotSeries } from '../src/series-sampling.js';
const data = { interval: 1800, samples: Array.from({ length: 25 }, (_, i) => ({ time: i * 1800, value: i / 2 })) };
test('default one-hour display retains endpoints and samples without increasing storage', () => {
  const p = plotSeries(data); assert.equal(p.interval, 3600); assert.equal(p.samples.length, 13); assert.equal(p.averaged, false);
  assert.equal(p.samples.at(-1).value, 12); assert.equal(data.samples.length, 25);
});
test('long intervals use a time-weighted mean, with partial ending bins', () => {
  const p = plotSeries({ ...data, samples: data.samples.slice(0, 12) }, 10800);
  assert.equal(p.averaged, true); assert.equal(p.samples[1].value, 1.5); assert.equal(p.samples[2].value, 4.25);
  assert.equal(p.samples[2].from, 10800);
  assert.equal(plotSeries(data, 10800, false).samples[1].value, 3);
  const irregular = plotSeries({ interval: 200, samples: [{ time: 0, value: 0 }, { time: 100, value: 10 }, { time: 300, value: 10 }] }, 10800);
  assert.equal(irregular.samples.at(-1).value, 2500 / 300);
});
test('NaN and missing spans do not become zero or get bridged by smoothing', () => {
  const missing = structuredClone(data); missing.samples[2].value = null;
  const p = plotSeries(missing, 10800); assert.equal(p.samples.find(s => s.time === 10800).value, null);
  assert.equal(plotSeries(missing, 10800, false).samples.find(s => s.time === 3600).value, null);
});
test('requested resolution cannot invent finer retained data, and short runs remain visible', () => {
  const p = plotSeries({ interval: 10800, samples: [{ time: 0, value: 0 }, { time: 10800, value: 2 }] });
  assert.equal(p.interval, 10800); assert.equal(p.samples.length, 2);
  assert.equal(plotSeries({ interval: 1800, samples: [{ time: 0, value: 1 }, { time: 10, value: 2 }] }).samples.length, 2);
});
