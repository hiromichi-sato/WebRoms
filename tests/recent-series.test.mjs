import test from 'node:test';
import assert from 'node:assert/strict';
import { RecentSeries, RECENT_SECONDS } from '../src/recent-series.js';

const base = { nx: 2, ny: 2, nz: 2, mask: new Uint8Array([1, 1, 1, 0]) };
const state = n => ({ h: new Float64Array(4).fill(10), zeta: new Float64Array(4), temp: Float64Array.from([n, n, n, n, n + 10, n + 10, n + 10, n + 10]), z_r: Float64Array.from([-7.5, -7.5, -7.5, -7.5, -2.5, -2.5, -2.5, -2.5]), biology: { NO3: new Float64Array(8).fill(3) } });
test('rolling history is bounded, excludes old samples and includes the current endpoint', () => {
  const r = new RecentSeries(state(0), 1);
  for (let t = 0; t <= 3 * RECENT_SECONDS; t += 1800) if (r.due(t)) r.add(t, state(t / 3600));
  assert(r.records.length <= r.capacity); assert(r.records.every(s => s.time >= 2 * RECENT_SECONDS));
  const q = r.query(base, state(999), 3 * RECENT_SECONDS + 1, { cell: 0, field: 'temp', layer: 1, depth: null });
  assert.equal(q.samples.at(-1).value, 1009); assert(q.samples.every(s => s.time >= 2 * RECENT_SECONDS + 1));
  assert(r.records[0].state.temp instanceof Float32Array);
});
test('depth and biology sampling, missing depth and invalid pins are explicit', () => {
  const r = new RecentSeries(state(0), 1); r.add(0, state(0));
  const query = { cell: 0, field: 'temp', layer: 0, depth: 5 };
  assert.equal(r.query(base, state(0), 1, query).samples[0].value, 5);
  assert.equal(r.query(base, state(0), 1, { ...query, depth: 11 }).samples[0].value, null);
  assert.equal(r.query(base, state(0), 1, { ...query, field: 'NO3' }).samples[0].value, 3);
  assert.throws(() => r.query(base, state(0), 1, { ...query, cell: 3 }), /海/);
  const small = new RecentSeries(state(0), 1, r.bytesPerRecord * 5);
  assert.equal(small.capacity, 5); assert(small.interval > 1800);
  for (let i = 0; i < 12; i++) small.add(i * small.interval, state(i));
  assert(small.records.length * small.bytesPerRecord <= small.capacity * small.bytesPerRecord);
});
