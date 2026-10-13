import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedWaterCells } from '../src/terrain-cleanup.js';

test('only edge-connected exterior water is retained, diagonal contact is isolated', () => {
  const f = { nx: 5, ny: 5, mask: new Uint8Array(25) };
  for (const p of [0, 1, 6, 12, 13]) f.mask[p] = 1;
  assert.deepEqual(isolatedWaterCells(f), [12, 13]);
});
test('an enclosed basin is preserved and only smaller disconnected pools are removed', () => {
  const f = { nx: 6, ny: 6, mask: new Uint8Array(36) };
  for (const p of [7, 8, 13, 14, 28]) f.mask[p] = 1;
  assert.deepEqual(isolatedWaterCells(f), [28]);
  f.mask.fill(1); assert.deepEqual(isolatedWaterCells(f), []);
  f.mask.fill(0); assert.deepEqual(isolatedWaterCells(f), []);
});
