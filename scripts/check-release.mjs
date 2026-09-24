import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runCase } from '../tests/runtime-helper.mjs';
import { fieldSizes } from '../src/runtime-state.js';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('runtime/manifest.json', root), 'utf8'));
for (const [name, hash] of Object.entries(manifest.sha256)) {
  for (const directory of ['runtime', 'dist/runtime']) {
    assert.equal(createHash('sha256').update(await readFile(new URL(`${directory}/${name}`, root))).digest('hex'), hash, `${directory}/${name} integrity`);
  }
}
assert.ok(WebAssembly.validate(await readFile(new URL('runtime/roms.wasm', root))), 'Valid WASM required');
for (const name of ['index.html', 'app.js', 'vendor/lucide.js', 'vendor/three/three.module.js', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'licenses/ROMS.txt', 'licenses/LLVM.txt', 'licenses/NetCDF-C.txt', 'licenses/NetCDF-Fortran.txt', 'licenses/Emscripten.txt', 'licenses/three.txt', 'licenses/lucide.txt']) {
  assert.ok((await readFile(new URL(`dist/${name}`, root))).length > 0, name);
}
for (const name of manifest.validation.cases) {
  const config = JSON.parse(await readFile(new URL(`validation/${name}-config.json`, root), 'utf8'));
  const bytes = await readFile(new URL(`validation/${name}-reference.bin`, root));
  const reference = new Float64Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const { state, time } = await runCase(config, manifest.validation.steps);
  assert.equal(time, reference[0]);
  let offset = 1, maximum = 0;
  for (const [field, count] of Object.entries(fieldSizes(config.grid))) {
    for (let i = 0; i < count; i++) {
      const actual = state[field][i], expected = reference[offset++];
      const delta = Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
      assert.ok(Number.isFinite(delta) && delta <= manifest.validation.scaledTolerance, `${name}/${field}/${i}: ${actual} vs ${expected}`);
      maximum = Math.max(maximum, delta);
    }
  }
  assert.equal(offset, reference.length);
  console.log(`${name}: native-reference comparison passed (max scaled error ${maximum})`);
}
console.log('Release artifact integrity, licenses and native-reference checks passed.');
