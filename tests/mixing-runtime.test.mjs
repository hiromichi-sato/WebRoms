import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, runCase } from './runtime-helper.mjs';
import { defaults, resizeLayers } from '../src/model.js';
import { readFile } from 'node:fs/promises';
import { snapshot } from '../src/runtime-state.js';
import { writeInputs } from '../src/roms-input.js';
import { RecentSeries } from '../src/recent-series.js';

test('display snapshot reads native interface coefficients and keeps their history', async () => {
  const c = fixture('diffusion'); c.numerics.calculateDiffusion = true; c.numerics.windX = .05;
  const { default: createRoms } = await import('../runtime/gls/physical/roms.js');
  const runtime = await createRoms({ print() {}, printErr() {} });
  runtime.FS.writeFile('varinfo.dat', await readFile(new URL('../runtime/varinfo.dat', import.meta.url)));
  const base = writeInputs(runtime, c, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'));
  assert.equal(runtime._webroms_init(), 0);
  try {
    const initial = snapshot(runtime, c, { mixing: true });
    const recent = new RecentSeries(initial, 10); recent.add(0, initial);
    for (let i = 0; i < 100; i++) assert.equal(runtime._webroms_step(), 0);
    const result = snapshot(runtime, c, { mixing: true }), size = 64, count = size * 4;
    const pointer = runtime._malloc(count * 8);
    try {
      assert.equal(runtime._webroms_copy_mixing(0, pointer), count);
      const faces = runtime.HEAPF64.subarray(pointer / 8, pointer / 8 + count);
      for (let i = 0; i < 192; i++) assert.equal(result.verticalDiffusivity[i], (faces[i] + faces[i + size]) / 2);
    } finally { runtime._free(pointer); }
    const series = recent.query(base, result, 1000, { cell: 27, field: 'diagKv', layer: 1, depth: null }, c);
    assert.ok(Math.abs(series.samples[0].value - initial.verticalDiffusivity[91]) < 1e-10);
    assert.equal(series.samples[1].value, result.verticalDiffusivity[91]);
    assert.notEqual(series.samples[0].value, series.samples[1].value);
    assert.equal(snapshot(runtime, c).verticalDiffusivity, undefined);
    c.numerics.calculateDiffusion = false; c.numerics.verticalDiffusion = .006;
    assert.ok(snapshot(runtime, c, { mixing: true }).verticalDiffusivity.every(v => v === .006));
  } finally { runtime._webroms_finalize(); }
});

test('new projects calculate vertical mixing; reference fixtures retain fixed mixing', () => {
  assert.equal(defaults().numerics.calculateDiffusion, true);
  assert.equal(fixture().numerics.calculateDiffusion, false);
});

for (const model of ['physical', 'npzd', 'nemuro']) {
  test(`${model}: GLS computes finite, nonuniform vertical coefficients`, async () => {
    const c = fixture(model === 'physical' ? 'diffusion' : model);
    resizeLayers(c, 8);
    Object.assign(c.numerics, { calculateDiffusion: true, windX: 0.05, dt: 10 });
    c.initial.distribution = 'stratified';
    const result = await runCase(c, 100);
    for (const values of Object.values(result.mixing)) {
      assert.equal(values.length, 8 * 8 * 9);
      assert.ok(values.every(v => Number.isFinite(v) && v >= 0));
      assert.ok(Math.max(...values) > 0.0001);
      assert.ok(Math.max(...values) > Math.min(...values));
    }
    for (const values of [result.state.temp, result.state.salt, result.state.u, ...Object.values(result.state.biology ?? {})]) assert.ok(values.every(Number.isFinite));
    const fixed = structuredClone(c); fixed.numerics.calculateDiffusion = false;
    const other = await runCase(fixed, 100);
    assert.ok(result.state.temp.some((v, i) => Math.abs(v - other.state.temp[i]) > 1e-8));
  });
}

for (const [nz, mode] of [[2, 'closed'], [15, 'specified'], [8, 'periodic']]) {
  test(`GLS supports ${nz} layers and ${mode} boundaries`, async () => {
    const c = fixture(); resizeLayers(c, nz);
    for (const b of Object.values(c.boundary)) { b.mode = mode; b.fromInitial = true; }
    Object.assign(c.numerics, { calculateDiffusion: true, windX: 0.02 });
    const r = await runCase(c, 30);
    assert.ok(r.state.temp.every(Number.isFinite));
    assert.ok(r.mixing.temp.every(v => Number.isFinite(v) && v >= 0));
  });
}
