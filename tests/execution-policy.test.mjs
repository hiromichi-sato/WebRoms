import test from 'node:test';
import assert from 'node:assert/strict';
import { executionPolicy } from '../src/execution-policy.js';

const environment = (overrides = {}) => ({ crossOriginIsolated: true, SharedArrayBuffer, navigator: { hardwareConcurrency: 8 }, ...overrides });
function config(mode = '4', model = 'physical', gls = false) {
  return { grid: { nx: 16, ny: 16 }, numerics: { executionMode: mode, calculateDiffusion: gls }, ecosystem: { enabled: model !== 'physical', model } };
}

test('legacy JSON without executionMode explicitly retains serial execution', () => {
  const c = config(); delete c.numerics.executionMode;
  assert.deepEqual(executionPolicy(c, environment()), executionPolicy(config('serial'), environment()));
});

for (const mode of ['auto', '2', '4']) test(`isolated physical runtime selects OpenMP for ${mode}`, () => {
  const result = executionPolicy(config(mode), environment());
  assert.equal(result.requested, mode);
  assert.equal(result.threads, mode === '2' ? 2 : 4);
  assert.equal(result.artifact, 'openmp/physical/roms.wasm');
  assert.equal(result.module, 'openmp/physical/roms.js');
  assert.ok(result.reason);
});

for (const overrides of [{ crossOriginIsolated: false }, { SharedArrayBuffer: undefined }]) {
  for (const mode of ['auto', '2', '4']) test(`unavailable shared memory falls back: ${mode}, ${Object.keys(overrides)}`, () => {
    const result = executionPolicy(config(mode), environment(overrides));
    assert.equal(result.requested, mode);
    assert.equal(result.threads, 1);
    assert.equal(result.artifact, 'roms.wasm');
    assert.ok(result.reason);
  });
}

for (const model of ['physical', 'npzd', 'nemuro']) for (const gls of [false, true]) {
  for (const mode of ['2', '4']) test(`explicit OpenMP artifact: ${model}, GLS=${gls}, threads=${mode}`, () => {
    const result = executionPolicy(config(mode, model, gls), environment());
    const artifact = `openmp/${gls ? 'gls/' : ''}${model}/roms.wasm`;
    assert.equal(result.requested, mode);
    assert.equal(result.threads, Number(mode));
    assert.equal(result.artifact, artifact);
    assert.equal(result.module, artifact.replace(/\.wasm$/, '.js'));
    assert.ok(result.reason);
  });
  test(`explicit serial artifact: ${model}, GLS=${gls}`, () => {
    const result = executionPolicy(config('serial', model, gls), environment());
    const artifact = gls ? `gls/${model}/roms.wasm` : model === 'physical' ? 'roms.wasm' : `${model}/roms.wasm`;
    assert.equal(result.threads, 1);
    assert.equal(result.artifact, artifact);
    assert.equal(result.module, artifact.replace(/\.wasm$/, '.js'));
  });
}

test('auto respects CPU availability while explicit thread requests remain explicit', () => {
  for (const navigator of [{ hardwareConcurrency: 2 }, {}]) {
    assert.equal(executionPolicy(config('auto'), environment({ navigator })).threads, 1);
    assert.equal(executionPolicy(config('2'), environment({ navigator })).threads, 2);
    assert.equal(executionPolicy(config('4'), environment({ navigator })).threads, 4);
  }
});

test('small grids fall back on either axis', () => {
  for (const grid of [{ nx: 8, ny: 16 }, { nx: 16, ny: 8 }]) {
    assert.equal(executionPolicy({ ...config(), grid }, environment()).threads, 1);
  }
});

test('invalid execution modes are rejected without mutating the input', () => {
  for (const mode of ['8', '', 4, false]) assert.throws(() => executionPolicy(config(mode), environment()));
  const c = config(), before = structuredClone(c);
  executionPolicy(c, environment());
  assert.deepEqual(c, before);
});
