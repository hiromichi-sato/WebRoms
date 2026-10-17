import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import createRoms from '../runtime/roms.js';
import { fixture } from '../tests/runtime-helper.mjs';
import { writeInputs } from '../src/roms-input.js';
import { snapshot } from '../src/runtime-state.js';

const candidate = process.argv[2];
if (!candidate) throw new Error('Usage: node scripts/benchmark-kernel.mjs candidate.wasm');
const config = fixture('coast');
Object.assign(config.grid, { nx: 32, ny: 32, nz: 3 });
Object.assign(config.numerics, { dt: 1, maxSteps: 300 });
const template = await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8');
const varinfo = await readFile(new URL('../runtime/varinfo.dat', import.meta.url));
const binaries = [await readFile(new URL('../runtime/roms.wasm', import.meta.url)), await readFile(candidate)];
const reports = [[], []]; let reference, maxDifference = 0;
for (let round = 0; round < 4; round++) for (const variant of round % 2 ? [1, 0] : [0, 1]) {
  const runtime = await createRoms({ wasmBinary: binaries[variant], print() {}, printErr() {} });
  let initialized = false;
  try {
    runtime.FS.writeFile('varinfo.dat', varinfo); writeInputs(runtime, config, template);
    if (runtime._webroms_init() !== 0) throw new Error('Initialization failed');
    initialized = true;
    const start = performance.now();
    for (let i = 0; i < config.numerics.maxSteps; i++) if (runtime._webroms_step() !== 0) throw new Error('Step failed');
    const ms = performance.now() - start;
    if (round) reports[variant].push(ms);
    const state = snapshot(runtime, config);
    if (!reference) reference = state;
    for (const [name, values] of Object.entries(state)) for (let i = 0; i < values.length; i++) {
      const difference = Math.abs(values[i] - reference[name][i]);
      maxDifference = Math.max(maxDifference, difference);
      if (difference > 1e-8 * Math.max(1, Math.abs(reference[name][i]))) throw new Error(`Numerical mismatch ${name}[${i}]`);
    }
  } finally { if (initialized) runtime._webroms_finalize(); }
}
const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const report = { grid: '32x32x3', steps: config.numerics.maxSteps, warmups: 1, repeats: 3, baselineMs: reports[0], candidateMs: reports[1], speedup: median(reports[0]) / median(reports[1]), maxDifference, baselineBytes: binaries[0].length, candidateBytes: binaries[1].length };
await mkdir('.tools/performance', { recursive: true });
await writeFile('.tools/performance/kernel-comparison.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
