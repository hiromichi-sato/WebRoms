import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { serialize, deserialize } from 'node:v8';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture } from '../tests/runtime-helper.mjs';
import { writeInputs } from '../src/roms-input.js';
import { snapshot } from '../src/runtime-state.js';
import { compareNumericalField } from '../src/numerical-comparison.js';
import { buildFields, resizeLayers } from '../src/model.js';
import { ensureOcean, tideRequest } from '../src/ocean-boundary.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.tools/parallel-kernels');
await mkdir(directory, { recursive: true });
const scales = { h: 100, z_r: 100, temp: 10, salt: 1, zeta: .1, u: .1, v: .1, ubar: .1, vbar: .1 };

if (process.argv[2] === '--run') {
  const [name, threadText] = process.argv.slice(3), threads = Number(threadText);
  const config = JSON.parse(await readFile(path.join(directory, `${name}.json`), 'utf8'));
  const kernel = threads ? path.join(directory, 'physical/roms.js') : path.join(root, 'runtime/roms.js');
  const factory = (await import(pathToFileURL(kernel))).default;
  const logs = [];
  let runtime, initialized = false;
  try {
    runtime = await factory({ print: line => logs.push(line), printErr: line => logs.push(line) });
    if (threads && (runtime._webroms_set_threads(threads) !== 0 || runtime._webroms_threads() !== threads)) throw new Error('OpenMP thread count mismatch');
    runtime.FS.writeFile('varinfo.dat', await readFile(path.join(root, 'runtime/varinfo.dat')));
    const fields = writeInputs(runtime, config, await readFile(path.join(root, 'runtime/roms-template.in'), 'utf8'));
    if (threads > 1) {
      let input = runtime.FS.readFile('roms.in', { encoding: 'utf8' });
      const tiles = threads === 2 ? [2, 1] : [2, 2];
      for (const [axis, count] of [['I', tiles[0]], ['J', tiles[1]]]) {
        const expression = new RegExp(`(^\\s*Ntile${axis}\\s*==)\\s*1\\s*$`, 'm');
        if (!expression.test(input)) throw new Error(`Ntile${axis} not found`);
        input = input.replace(expression, `$1 ${count}`);
      }
      runtime.FS.writeFile('roms.in', input);
    }
    const initStart = performance.now();
    if (runtime._webroms_init() !== 0) throw new Error('ROMS initialization failed');
    initialized = true;
    if (threads && runtime._webroms_roms_threads() !== threads) throw new Error('ROMS domain decomposition is not using the requested OpenMP team');
    const initializationMs = performance.now() - initStart;
    const checkpoints = [{ step: 0, state: snapshot(runtime, config) }];
    const sampleSteps = [Math.ceil(config.numerics.maxSteps / 2), config.numerics.maxSteps];
    let integrationMs = 0;
    for (let step = 1; step <= config.numerics.maxSteps; step++) {
      const start = performance.now();
      if (runtime._webroms_step() !== 0) throw new Error(`ROMS step ${step} failed`);
      integrationMs += performance.now() - start;
      if (sampleSteps.includes(step)) checkpoints.push({ step, state: snapshot(runtime, config) });
    }
    const result = { name, threads, initializationMs, integrationMs, time: runtime._webroms_time(), checkpoints,
      masks: { rho: fields.mask, u: fields.maskU, v: fields.maskV } };
    await writeFile(path.join(directory, `${name}-${threads}.bin`), serialize(result));
    console.log(JSON.stringify({ name, threads, initializationMs, integrationMs, time: result.time }));
  } catch (error) {
    console.error(error.stack, logs.slice(-60).join('\n'));
    process.exitCode = 1;
  } finally {
    if (initialized) runtime._webroms_finalize();
    await writeFile(path.join(directory, `${name}-${threads}.log`), logs.join('\n'));
  }
  // Emscripten owns persistent pthread Workers, isolated to this child process.
  process.exit(process.exitCode ?? 0);
}

const names = process.argv.slice(2);
const cases = names.length ? names : ['uniform', 'coast', 'diffusion', 'specified', 'tide', 'large'];
const report = { format: 'webroms-openmp-comparison-v1', date: new Date().toISOString(), relativeTolerance: .01,
  statisticalConfidence: null, scales, cpu: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(),
  timingPolicy: 'single process per run; integration includes JIT warmup; excludes input, initialization and snapshots',
  scope: 'physical, fixed mixing; short integrations, not a long-term validation', cases: [], passed: true };
for (const [label, file] of [['serial', 'runtime/roms.wasm'], ['openmp', '.tools/parallel-kernels/physical/roms.wasm']]) {
  report[`${label}Sha256`] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
}
for (const name of cases) {
  const config = fixture(['tide', 'large'].includes(name) ? 'coast' : name);
  Object.assign(config.grid, { nx: name === 'large' ? 100 : 32, ny: name === 'large' ? 100 : 32 });
  resizeLayers(config, ['large', 'diffusion'].includes(name) ? 15 : 5);
  Object.assign(config.numerics, { dt: 1, maxSteps: name === 'large' ? 40 : 100 });
  if (name === 'tide') {
    config.grid.preset = 'open';
    config.grid.geoBounds = { west: 135, east: 135.1, south: 34, north: 34.1 };
    for (const b of Object.values(config.boundary)) { b.mode = 'open'; b.fromInitial = true; }
    const ocean = ensureOcean(config), request = tideRequest(config, buildFields(config));
    ocean.tideMode = 'auto';
    ocean.tides = { format: 'webroms-tides-v1', gridSignature: request.gridSignature, epoch: ocean.startUtc,
      kind: 'ocean-tide', unit: 'm', source: 'SYNTHETIC OPENMP TEST', times: [0, 1800, 3600],
      points: request.points.map(p => ({ ...p, height: [0, .1, 0] })) };
  }
  await writeFile(path.join(directory, `${name}.json`), JSON.stringify(config, null, 2));
  const entry = { name, grid: config.grid, steps: config.numerics.maxSteps, runs: [], passed: true };
  for (const threads of [0, 1, 2, 4]) {
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', name, String(threads)], { cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
    console.log(run.stdout || run.stderr);
    if (run.status !== 0) {
      entry.runs.push({ threads, passed: false, error: run.stderr }); entry.passed = false; break;
    }
    const result = deserialize(await readFile(path.join(directory, `${name}-${threads}.bin`)));
    const timing = { threads, tiles: threads === 4 ? [2, 2] : threads === 2 ? [2, 1] : [1, 1], integrationMs: result.integrationMs, initializationMs: result.initializationMs, time: result.time, checkpoints: [], passed: true };
    entry.runs.push(timing);
    if (threads) {
      const reference = deserialize(await readFile(path.join(directory, `${name}-0.bin`)));
      if (result.time !== reference.time) throw new Error('Model times differ');
      for (let c = 0; c < reference.checkpoints.length; c++) {
        const ref = reference.checkpoints[c], candidate = result.checkpoints[c];
        const metrics = { step: ref.step, fields: {} };
        if (ref.step !== candidate.step) throw new Error('Comparison steps differ');
        for (const [field, values] of Object.entries(ref.state)) {
          const baseMask = reference.masks[['u', 'ubar'].includes(field) ? 'u' : ['v', 'vbar'].includes(field) ? 'v' : 'rho'];
          const mask = Uint8Array.from(values, (_, i) => baseMask[i % baseMask.length]);
          const metric = compareNumericalField(values, candidate.state[field], { scale: scales[field], mask });
          metrics.fields[field] = metric;
          timing.passed &&= metric.passed;
        }
        timing.checkpoints.push(metrics);
      }
      timing.speedupVersusSerial = reference.integrationMs / result.integrationMs;
      entry.passed &&= timing.passed;
    }
  }
  report.cases.push(entry); report.passed &&= entry.passed;
  await writeFile(path.join(directory, 'comparison.json'), JSON.stringify(report, null, 2));
  if (!entry.passed) break;
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.map(c => ({ name: c.name, passed: c.passed, timings: c.runs.map(r => ({ threads: r.threads, ms: r.integrationMs, passed: r.passed })) })) }, null, 2));
if (!report.passed) process.exitCode = 1;
