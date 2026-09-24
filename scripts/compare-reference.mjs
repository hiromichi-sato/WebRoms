import { readFile, writeFile } from 'node:fs/promises';
import { fieldSizes } from '../src/runtime-state.js';
const name = process.argv[2] ?? 'uniform';
const directory = new URL(`../.tools/case-${name}/`, import.meta.url);
const config = JSON.parse(await readFile(new URL('config.json', directory), 'utf8'));
const read = async name => { const b = await readFile(new URL(name, directory)); return new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const wasm = await read('wasm.bin'), reference = await read('reference.bin');
if (wasm.length !== reference.length || wasm[0] !== reference[0]) throw new Error('Shape/time mismatch');
let offset = 1;
const report = { name, time: wasm[0], passed: true, fields: {} };
for (const [field, count] of Object.entries(fieldSizes(config.grid))) {
  let maxAbsolute = 0, maxRelative = 0;
  for (let i = offset; i < offset + count; i++) {
    if (!Number.isFinite(wasm[i]) || !Number.isFinite(reference[i])) throw new Error(`${field}: nonfinite value`);
    const delta = Math.abs(wasm[i] - reference[i]);
    maxAbsolute = Math.max(maxAbsolute, delta);
    maxRelative = Math.max(maxRelative, delta / Math.max(1, Math.abs(reference[i])));
  }
  report.fields[field] = { maxAbsolute, maxRelative };
  if (maxRelative > 1e-8) report.passed = false;
  offset += count;
}
await writeFile(new URL('comparison.json', directory), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
