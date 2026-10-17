import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNumericalField, reproducibilityDefaults, kernelIdentity } from '../src/numerical-comparison.js';
import { defaults } from '../src/model.js';
import { readFileSync } from 'node:fs';

test('one percent measures error against a declared scale, never statistical confidence', () => {
  const result = compareNumericalField([20, 21], [20.01, 21.01], { scale: 2 });
  assert.equal(result.passed, true); assert.equal(result.limit, .02);
  assert.equal(result.statisticalConfidence, null);
  assert.equal(compareNumericalField([20], [20.1], { scale: 2 }).passed, false);
  assert.equal(compareNumericalField([0], [.009], { scale: 1 }).passed, true);
  assert.equal(compareNumericalField([0], [.011], { scale: 1 }).passed, false);
});
test('missing sea values and local spikes fail; explicitly masked land is excluded', () => {
  assert.equal(compareNumericalField([0, 0], [0, NaN], { scale: 1 }).passed, false);
  assert.equal(compareNumericalField([0, 0], [0, NaN], { scale: 1, mask: [1, 0] }).passed, true);
  assert.equal(compareNumericalField([0], [0], { scale: 1, mask: [0] }).passed, false);
  assert.equal(compareNumericalField(Array(100).fill(0), [.1, ...Array(99).fill(0)], { scale: 1 }).passed, false);
  assert.throws(() => compareNumericalField([1], [1], { scale: 0 }), /代表スケール/);
  assert.throws(() => compareNumericalField([1], [], { scale: 1 }), /サイズ/);
});
test('portable JSON records policy and identifies each existing kernel without changing physics', () => {
  const config = defaults(), before = structuredClone(config);
  const manifest = JSON.parse(readFileSync(new URL('../runtime/manifest.json', import.meta.url)));
  for (const model of ['physical', 'npzd', 'nemuro']) for (const mixing of [false, true]) {
    config.ecosystem.enabled = model !== 'physical'; config.ecosystem.model = model;
    config.numerics.calculateDiffusion = mixing;
    const identity = kernelIdentity(config, manifest);
    assert.match(identity.sha256, /^[a-f0-9]{64}$/);
    assert.equal(identity.sha256, manifest.sha256[identity.artifact]);
  }
  assert.equal(JSON.parse(JSON.stringify(before)).reproducibility.comparison.relativeTolerance, .01);
  const a = reproducibilityDefaults(), b = reproducibilityDefaults(); a.comparison.relativeTolerance = .2;
  assert.equal(b.comparison.relativeTolerance, .01);
});
