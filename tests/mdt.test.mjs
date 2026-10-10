import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { defaults, buildFields } from '../src/model.js';
import { TERRAIN_PRESETS } from '../src/terrain-presets.js';
import { sampleMdt, resampleMdt } from '../src/bundled-mdt.js';
import { ensureOcean, prepareForcing } from '../src/ocean-boundary.js';

const bytes = await readFile(new URL('../src/data/mdt/atlas.bin', import.meta.url));
const metadata = JSON.parse(await readFile(new URL('../src/data/mdt/metadata.json', import.meta.url)));
const atlas = { metadata, values: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
test('MDT atlas retains source provenance, complete global lattice and hash', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  assert.equal(bytes.length, metadata.nx * metadata.ny * 2);
  assert.equal(metadata.scale, .0001);
  assert.equal(metadata.sourceAttributes.title, 'HYBRID_MDT_CNES_CLS22_CMEMS2020');
  assert.equal(sampleMdt(atlas, -180, 0).value, sampleMdt(atlas, 180, 0).value);
  assert.throws(() => sampleMdt(atlas, 0, 90), /範囲外/);
});
for (const [preset, info] of Object.entries(TERRAIN_PRESETS).filter(([, p]) => p.bounds)) test(`bundled MDT covers ${preset}, including diffusion extrapolation`, () => {
  const c = defaults(); Object.assign(c.grid, { preset, minDepth: info.depth[0], maxDepth: info.depth[1] });
  const f = buildFields(c), result = resampleMdt(atlas, c, f);
  assert.equal(Object.keys(result.painted.zeta[0]).length, f.wetCount);
  assert(Object.values(result.painted.zeta[0]).every(v => Number.isFinite(v) && v >= -1.47331 && v <= 1.82181));
  assert(result.metadata.residualMetres < 1e-8);
  c.ocean = { ...ensureOcean(c), seaLevelEnabled: true, seaLevel: result.metadata };
  c.grid.edits[10] = 123;
  assert.throws(() => prepareForcing(c, f), /再適用/);
});
test('diffusion preserves anchors and cannot cross a land barrier into an unanchored basin', () => {
  const m = { nx: 4, ny: 3, x0: 0, y0: 0, dx: 1, dy: 1, scale: 1, missing: -32768, sourceAttributes: {} };
  const data = new DataView(new ArrayBuffer(24));
  for (let p = 0; p < 12; p++) data.setInt16(p * 2, p % 4 === 0 ? 2 : p % 4 === 3 ? 8 : -32768, true);
  const c = { grid: { nx: 4, ny: 3, geoBounds: { west: 0, east: 3, south: 0, north: 2 } } };
  const f = { mask: new Uint8Array(12).fill(1), dx: 1, dy: 1 };
  const result = resampleMdt({ metadata: m, values: data }, c, f);
  for (let p = 0; p < 12; p++) assert(Math.abs(result.painted.zeta[0][p] - (2 + (p % 4) * 2)) < 1e-6);
  for (let j = 0; j < 3; j++) { f.mask[j * 4 + 1] = 0; data.setInt16((j * 4 + 3) * 2, -32768, true); }
  const isolated = resampleMdt({ metadata: m, values: data }, c, f);
  assert.deepEqual([...isolated.metadata.zeroIndices].sort((a, b) => a - b), [2, 3, 6, 7, 10, 11]);
  assert(isolated.metadata.zeroIndices.every(p => isolated.painted.zeta[0][p] === 0));
  assert.equal(isolated.metadata.interpolatedCells, 0);
  m.dx = m.dy = .1; c.grid.geoBounds = { west: 0, east: .3, south: 0, north: .2 };
  f.zeta = new Float64Array(12).fill(9);
  const nearby = resampleMdt({ metadata: m, values: data }, c, f);
  assert.equal(nearby.metadata.nearbyIndices.length, 6);
  assert(nearby.metadata.nearbyIndices.every(p => nearby.painted.zeta[0][p] === 2));
  for (let p = 0; p < 12; p++) data.setInt16(p * 2, -32768, true);
  const empty = resampleMdt({ metadata: m, values: data }, c, f);
  assert.equal(empty.metadata.zeroIndices.length, 9);
  assert(Object.values(empty.painted.zeta[0]).every(v => v === 0));
});
