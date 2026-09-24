import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import createRoms from '../runtime/roms.js';
import { defaults } from '../src/model.js';
import { writeInputs } from '../src/roms-input.js';

const config = defaults();
Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
config.initial.distribution = 'uniform';
Object.assign(config.numerics, { maxSteps: 10, steadyWindow: 2 });
const runtime = await createRoms({ print: console.log, printErr: console.error });
runtime.FS.writeFile('varinfo.dat', await readFile(new URL('../runtime/varinfo.dat', import.meta.url)));
writeInputs(runtime, config, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'));
assert.equal(runtime._webroms_init(), 0, 'ROMS initialization');
for (let step = 0; step < 10; step++) {
  assert.equal(runtime._webroms_step(), 0, `ROMS step ${step + 1}`);
  console.log('WEBROMS TIME', runtime._webroms_time());
}
const pointer = runtime._malloc(8 * 64 * 3);
try {
  const count = runtime._webroms_copy(2, pointer);
  assert.equal(count, 64 * 3);
  const values = runtime.HEAPF64.slice(pointer / 8, pointer / 8 + count);
  assert(values.every(Number.isFinite), 'finite temperatures');
  console.log('WEBROMS TEMPERATURE RANGE', Math.min(...values), Math.max(...values));
} finally { runtime._free(pointer); runtime._webroms_finalize(); }
