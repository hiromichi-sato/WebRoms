import test from 'node:test';
import assert from 'node:assert/strict';
import { quartileRange, rangeLabels } from '../src/contour-settings.js';

test('quartiles exclude nonfinite values, retain full extent for manual sliders and interpolate ranks', () => {
  const range = quartileRange([0, 1, 2, 3, 1000, NaN, Infinity]);
  assert.deepEqual(range, { min: 1, max: 3, dataMin: 0, dataMax: 1000 });
  assert.deepEqual(quartileRange([1, 2, 3, 4]), { min: 1.75, max: 3.25, dataMin: 1, dataMax: 4 });
});
test('uniform and empty fields have finite nonzero color intervals', () => {
  for (const values of [[], [NaN], [0, 0], [-20, -20], [20]]) {
    const r = quartileRange(values); assert.ok(Number.isFinite(r.min) && Number.isFinite(r.max) && r.min < r.max);
    if (values.length && Number.isFinite(values[0])) assert.equal(r.min, values[0]);
  }
});
test('narrow quartile ranges retain distinguishable endpoint labels', () => {
  for (const [min, max] of [[23.22221, 23.22223], [20, 20.00002], [0, 1e-12], [1e-9, 1.0001e-9]]) {
    const labels = rangeLabels(min, max); assert.notEqual(labels[0], labels[1]);
  }
});
