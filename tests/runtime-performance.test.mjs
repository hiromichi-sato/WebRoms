import test from 'node:test';
import assert from 'node:assert/strict';
import { RunPacing, stateTransfers } from '../src/runtime-performance.js';
import { snapshot, fieldSizes } from '../src/runtime-state.js';

test('display pacing is wall-clock based and observes backpressure', () => {
  const p = new RunPacing(0);
  assert.equal(p.displayDue(0, false), true); p.displayed(0);
  assert.equal(p.displayDue(249, false), false); assert.equal(p.displayDue(250, true), false);
  assert.equal(p.displayDue(250, false), true);
  assert.equal(p.yieldDue(49), false); assert.equal(p.yieldDue(50), true);
  p.yielded(60); assert.equal(p.yieldDue(109), false);
});

test('snapshot uses one scratch allocation, preserves export doubles and isolates transferred displays', () => {
  const config = { grid: { nx: 3, ny: 3, nz: 2 }, ecosystem: { enabled: false }, numerics: { calculateDiffusion: false, verticalDiffusion: .001 } };
  const sizes = Object.values(fieldSizes(config.grid)), heap = new Float64Array(1000);
  let allocations = 0, frees = 0;
  const runtime = { HEAPF64: heap, _malloc: () => { allocations++; return 8; }, _free: () => { frees++; },
    _webroms_copy: (id, pointer) => { heap.fill(1.123456789, pointer / 8, pointer / 8 + sizes[id]); return sizes[id]; } };
  const full = snapshot(runtime, config), display = snapshot(runtime, config, { mixing: true, precision: 32, omitStatic: true });
  assert.equal(allocations, 2); assert.equal(frees, 2);
  assert.ok(full.temp instanceof Float64Array); assert.equal(full.temp[0], 1.123456789);
  assert.ok(display.temp instanceof Float32Array); assert.equal(display.h, undefined);
  assert.ok(display.verticalDiffusivity instanceof Float32Array);
  const moved = structuredClone(display, { transfer: stateTransfers(display) });
  assert.equal(display.temp.byteLength, 0); assert.ok(moved.temp.length > 0);
  assert.equal(heap.byteLength, 8000); assert.ok(full.temp.length > 0);
});
