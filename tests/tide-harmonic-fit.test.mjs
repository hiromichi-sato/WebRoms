import test from 'node:test';
import assert from 'node:assert/strict';
import { fitTideHarmonics } from '../src/tide-harmonic-fit.js';
import { TIDE_SPEEDS } from '../src/japan-tides.js';
const epoch = '2026-01-01T00:00:00Z';
const samples = step => Array.from({ length: 720 / step + 1 }, (_, i) => {
  const h = i * step;
  return { utc: Date.parse(epoch) + h * 3600000, cm: 500 + .1 * h + Object.values(TIDE_SPEEDS).reduce((sum, speed, j) => sum + (j + 1) * 10 * Math.cos((speed * h - 30 * j) * Math.PI / 180), 0) };
});
test('recovers harmonics without datum or trend', () => {
  const fit = fitTideHarmonics(samples(1), epoch);
  Object.values(fit.harmonics).forEach((h, i) => { assert.ok(Math.abs(h.amplitudeCm - (i + 1) * 10) < 1e-8); assert.ok(Math.abs(Math.sin((h.lagDegrees - i * 30) * Math.PI / 180)) < 1e-8); });
  assert.ok(fit.rmseCm < 1e-8);
});
test('rejects ambiguous phase and short series', () => {
  assert.throws(() => fitTideHarmonics(samples(6), epoch), /観測間隔/);
  assert.throws(() => fitTideHarmonics(samples(1).slice(0, 48), epoch), /1か月/);
});
