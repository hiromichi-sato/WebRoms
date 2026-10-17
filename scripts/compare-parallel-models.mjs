import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { serialize, deserialize } from 'node:v8';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture } from '../tests/runtime-helper.mjs';
import { resizeLayers } from '../src/model.js';
import { writeInputs } from '../src/roms-input.js';
import { snapshot } from '../src/runtime-state.js';
import { compareNumericalField } from '../src/numerical-comparison.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, '.tools/parallel-kernels/models');
await mkdir(out, { recursive: true });
const artifact = (model, mixing, parallel) => `${parallel ? '.tools/parallel-kernels' : 'runtime'}/${mixing === 'gls' ? 'gls/' : ''}${model === 'physical' && mixing === 'fixed' && !parallel ? '' : model + '/'}roms.js`;
const key = (model, mixing, threads) => `${model}-${mixing}-${threads}`;
const configFor = (model, mixing) => {
  const c = fixture(model === 'physical' ? 'coast' : model);
  Object.assign(c.grid, { nx: 32, ny: 32, preset: 'island' }); resizeLayers(c, 15);
  c.initial.distribution = 'stratified';
  c.rivers = [{ id: 'parallel-test-river', cell: 33, flow: 10, temp: 10, salt: 0, biology: {} }];
  c.heat = { mode: 'flux', netFlux: 150 };
  Object.assign(c.numerics, { calculateDiffusion: mixing === 'gls', windX: .02, dt: 10, maxSteps: 100 });
  return c;
};
const flatState = (runtime, config) => {
  const { biology, ...state } = snapshot(runtime, config, { mixing: true });
  for (const [key, value] of Object.entries(biology ?? {})) state['bio_' + key] = value;
  if (config.numerics.calculateDiffusion) {
    const size = config.grid.nx * config.grid.ny * (config.grid.nz + 1), ptr = runtime._malloc(size * 8);
    try {
      for (let field = 0; field < 3; field++) {
        if (runtime._webroms_copy_mixing(field, ptr) !== size) throw new Error('Mixing ABI mismatch');
        state['mixing_' + field] = runtime.HEAPF64.slice(ptr / 8, ptr / 8 + size);
      }
    } finally { runtime._free(ptr); }
  }
  return state;
};
if (process.argv[2] === '--run') {
  const [model, mixing, count] = process.argv.slice(3), threads = Number(count), config = configFor(model, mixing), logs = [];
  let runtime, initialized = false;
  try {
    const create = (await import(pathToFileURL(path.join(root, artifact(model, mixing, threads > 0))))).default;
    runtime = await create({ print: l => logs.push(l), printErr: l => logs.push(l) });
    if (threads && (runtime._webroms_set_threads(threads) || runtime._webroms_threads() !== threads)) throw new Error('OpenMP team mismatch');
    runtime.FS.writeFile('varinfo.dat', await readFile(path.join(root, 'runtime/varinfo.dat')));
    const fields = writeInputs(runtime, config, await readFile(path.join(root, 'runtime/roms-template.in'), 'utf8'), 100, { threads });
    if (runtime._webroms_init()) throw new Error('ROMS initialization failed');
    initialized = true;
    if (threads && runtime._webroms_roms_threads() !== threads) throw new Error('ROMS partition mismatch');
    const checkpoints = [{ step: 0, state: flatState(runtime, config) }], start = performance.now();
    for (let step = 1; step <= 100; step++) {
      if (runtime._webroms_step()) throw new Error('ROMS step ' + step);
      if (step % 50 === 0) checkpoints.push({ step, state: flatState(runtime, config) });
    }
    const report = { time: runtime._webroms_time(), checkpoints, milliseconds: performance.now() - start, mask: fields.mask, maskU: fields.maskU, maskV: fields.maskV };
    await writeFile(path.join(out, key(model, mixing, threads) + '.bin'), serialize(report));
    console.log(JSON.stringify({ model, mixing, threads, time: report.time, milliseconds: report.milliseconds }));
  } catch (error) { console.error(error.stack, logs.slice(-40).join('\n')); process.exitCode = 1; }
  finally { if (initialized) runtime._webroms_finalize(); await writeFile(path.join(out, key(model, mixing, threads) + '.log'), logs.join('\n')); }
  process.exit(process.exitCode ?? 0);
}
const report = { format: 'webroms-parallel-models-v1', date: new Date().toISOString(), passed: true, cases: [] };
for (const mixing of ['fixed', 'gls']) for (const model of ['physical', 'npzd', 'nemuro']) {
  const entry = { model, mixing, grid: '32x32x15', steps: 100, dt: 10, passed: true, sha256: {}, runs: [] };
  await writeFile(path.join(out, `${model}-${mixing}.json`), JSON.stringify(configFor(model, mixing), null, 2));
  for (const parallel of [false, true]) {
    const file = artifact(model, mixing, parallel).replace(/\.js$/, '.wasm');
    entry.sha256[parallel ? 'parallel' : 'serial'] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  }
  for (const threads of [0, 1, 2, 4]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', model, mixing, String(threads)], { cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
    console.log(result.stdout || result.stderr);
    if (result.status !== 0) { entry.runs.push({ threads, passed: false, error: result.stderr }); entry.passed = false; break; }
    if (!threads) continue;
    const reference = deserialize(await readFile(path.join(out, key(model, mixing, 0) + '.bin')));
    const candidate = deserialize(await readFile(path.join(out, key(model, mixing, threads) + '.bin')));
    const metrics = { threads, passed: candidate.time === reference.time, checkpoints: [] };
    for (let k = 0; k < reference.checkpoints.length; k++) {
      const fields = {};
      for (const [name, values] of Object.entries(reference.checkpoints[k].state)) {
        const base = ['u', 'ubar'].includes(name) ? reference.maskU : ['v', 'vbar'].includes(name) ? reference.maskV : reference.mask;
        const mask = Uint8Array.from(values, (_, i) => base[i % base.length]);
        const scale = name.startsWith('bio_') ? 5 : name.startsWith('mixing_') || name === 'verticalDiffusivity' ? .01 : ({ temp: 10, salt: 1, h: 100, z_r: 100 })[name] ?? .1;
        fields[name] = compareNumericalField(values, candidate.checkpoints[k].state[name], { scale, mask });
        metrics.passed &&= fields[name].passed;
      }
      metrics.checkpoints.push({ step: reference.checkpoints[k].step, fields });
    }
    entry.runs.push(metrics); entry.passed &&= metrics.passed;
  }
  report.cases.push(entry); report.passed &&= entry.passed;
  await writeFile(path.join(out, '../comparison-models.json'), JSON.stringify(report, null, 2));
  if (!entry.passed) { console.error('Model comparison failed'); process.exit(1); }
}
console.log('All six parallel model/mixing combinations passed.');
