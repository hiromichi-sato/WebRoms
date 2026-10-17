import { writeInputs } from '../src/roms-input.js';
import { validate } from '../src/model.js';
import { snapshot } from '../src/runtime-state.js';
import { exportPlan, RUNTIME_STEP_LIMIT } from '../src/export-plan.js';
import { RecentSeries } from '../src/recent-series.js';
import { particleForcing } from '../src/particle-tide.js';
import { captureOceanCheckpoint } from '../src/ocean-checkpoint.js';
import { checkCheckpoint } from '../src/checkpoint-compare.js';
import { RunPacing, stateTransfers } from '../src/runtime-performance.js';
import { executionPolicy } from '../src/execution-policy.js';
let execution, kernelManifest;
let recent, baseFields, particleOutput, createExperimentRuntime, runtimeTemplate, runtimeVarinfo;

let runtime, config, startedTime, step = 0, busy = false, ready = false, cancelled = false, displayPending = false;
const logs = [];
let chunkAck;
let timings;
const capture = options => {
  const start = performance.now(), state = snapshot(runtime, config, {step,time:elapsed(),...options});
  if (timings) { timings.snapshotMs += performance.now() - start; timings.snapshots++; }
  return state;
};
const postState = (message) => self.postMessage(message, stateTransfers(message.state));
const sendChunk = bytes => new Promise((resolve, reject) => { chunkAck = { resolve, reject }; self.postMessage({ type: 'export-chunk', bytes }, [bytes.buffer]); });
const log = line => { logs.push(String(line)); if (logs.length > 120) logs.shift(); };
const text = async path => { const response = await fetch(new URL(path, import.meta.url)); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`); return response.text(); };

const pause = (milliseconds = 0) => new Promise(resolve => setTimeout(resolve, milliseconds));
const elapsed = () => runtime._webroms_time() - startedTime;
const displaySnapshot = () => capture({ mixing: true });
const stateMessage = type => ({ type, step, time: elapsed(), execution, state: displaySnapshot() });
async function integrateMain() {
  ready = false;
  timings = { stepsMs: 0, snapshotMs: 0, snapshots: 0, updates: 0, started: performance.now() };
  const pacing = new RunPacing();
  for (; step < config.numerics.maxSteps && !cancelled;) {
    advance();
    const now = performance.now();
    if (step < config.numerics.maxSteps && pacing.displayDue(now, displayPending)) {
      displayPending = true; pacing.displayed(now); timings.updates++;
      postState({ type: 'progress', step, time: elapsed(), execution, state: capture({ mixing: true, precision: 32, omitStatic: true }) });
      if (step === 1) { await pause(16); pacing.yielded(performance.now()); }
    }
    if (pacing.yieldDue(performance.now())) { await pause(); pacing.yielded(performance.now()); }
  }
  ready = true;
  const stopped = cancelled && step < config.numerics.maxSteps;
  log(stopped ? 'WebROMS: paused; ocean state and forcing clock retained' : 'WebROMS: DONE - requested steps completed; runtime retained for additional RUN');
  const message = stateMessage(stopped ? 'stopped' : 'complete');
  postState({ ...message, logs: [...logs], performance: { ...timings, wallMs: performance.now() - timings.started } });
}
function advance() {
  const start = performance.now();
  const before = runtime._webroms_time(), code = runtime._webroms_step();
  if (timings) timings.stepsMs += performance.now() - start;
  if (code !== 0) { ready = false; throw new Error(`ROMS計算エラー ${code} / step ${step + 1}`); }
  if (!(runtime._webroms_time() > before)) { ready = false; throw new Error('ROMSのモデル時刻が進みませんでした。'); }
  step++;
  if (recent?.due(elapsed())) recent.add(elapsed(), capture({ mixing: true, precision: 32, omitStatic: true }), { owned: true });
}

async function run(initialConfig) {
    config = initialConfig;
    const errors = validate(config);
    if (errors.length) throw new Error(errors.join('\n'));
    const model = config.ecosystem.enabled ? config.ecosystem.model : 'physical';
    const modules = { physical: './roms.js', npzd: './npzd/roms.js', nemuro: './nemuro/roms.js' };
    if (!modules[model]) throw new Error('この生態系モデルの計算用WASMは未対応です。');
    execution = executionPolicy(config);
    const serialModule = config.numerics.calculateDiffusion ? `./gls/${model}/roms.js` : modules[model];
    self.postMessage({ type: 'status', message: 'ROMS実行核を読み込み中' });
    let createRoms;
    let module;
    try { createRoms = (await import('./' + execution.module)).default; module = await createRoms({ print: log, printErr: log }); }
    catch (error) {
      if (execution.threads === 1) throw error;
      execution = { ...executionPolicy({ ...config, numerics: { ...config.numerics, executionMode: 'serial' } }), requested: execution.requested, reason: '並列版を起動できないため直列で実行' };
      createRoms = (await import(serialModule)).default;
      module = await createRoms({ print: log, printErr: log });
    }
    const [template, varinfo] = await Promise.all([text('./roms-template.in'), text('./varinfo.dat')]);
    runtime = module;
    try { kernelManifest = JSON.parse(await text('./manifest.json')); } catch { kernelManifest = undefined; }
    execution.sha256 = kernelManifest?.sha256?.[execution.artifact] ?? null;
    config.reproducibility ??= {}; config.reproducibility.lastExecution = execution;
    if (execution.threads > 1 && (runtime._webroms_set_threads(execution.threads) !== 0 || runtime._webroms_threads() !== execution.threads)) throw new Error('OpenMPスレッド数が一致しません。');
    self.postMessage({ type: 'execution', execution });
    createExperimentRuntime = (await import(serialModule)).default; runtimeTemplate = template; runtimeVarinfo = varinfo;
    if (config.numerics.calculateDiffusion && typeof runtime._webroms_copy_mixing !== 'function') throw new Error('GLS対応のROMS実行核が必要です。');
    runtime.FS.writeFile('varinfo.dat', varinfo);
    baseFields = writeInputs(runtime, config, template, RUNTIME_STEP_LIMIT, { threads: execution.threads });
    self.postMessage({ type: 'status', message: 'ROMSを初期化中' });
    const initialized = runtime._webroms_init();
    if (initialized !== 0) throw new Error(`ROMS初期化エラー ${initialized}\n${logs.slice(-35).join('\n')}`);
    if (execution.threads > 1 && runtime._webroms_roms_threads() !== execution.threads) throw new Error('ROMSの並列領域分割が一致しません。');
    startedTime = runtime._webroms_time();
    const initial = displaySnapshot();
    recent = new RecentSeries(initial, config.numerics.dt); recent.add(0, initial);
    await integrateMain();
}

async function particleRun(data) {
  const { particlePlan, seedParticles, particleSnapshot, initialParticleRecord, particleNetcdf } = await import('../src/particle-experiment.js');
  const experimentConfig = { ...config, particles: data.settings };
  const plan = particlePlan(experimentConfig, baseFields, step, { repeatForcing: true });
  const baseTime = elapsed(), baseStep = step;
  const baseState = displaySnapshot();
  const repeated = particleForcing(config, baseFields, baseTime, plan.duration,baseState);
  const checkpoint = captureOceanCheckpoint(runtime);
  plan.tide = repeated.metadata;
  plan.startMethod = 'ROMS PERFECT_RESTART transient in-memory checkpoint; no spin-up replay';
  const primary = { runtime, config, startedTime, step, recent, ready, execution };
  const branch = await createExperimentRuntime({ print: log, printErr: log });
  const records = [initialParticleRecord(plan, baseTime)];
  let pendingRecord, branchReady = false;
  try {
    execution = { ...executionPolicy({ ...config, numerics: { ...config.numerics, executionMode: 'serial' } }), reason: '追加実験のチェックポイント分岐は直列で実行' };
    execution.sha256 = kernelManifest?.sha256?.[execution.artifact] ?? null;
    plan.execution = execution; plan.mainExecution = primary.execution;
    self.postMessage({ type: 'execution', scope: 'particles', execution });
    branch.FS.writeFile('varinfo.dat', runtimeVarinfo);
    writeInputs(branch, config, runtimeTemplate, plan.steps, { forcing: repeated.forcing, restart: true, restartStart: baseTime });
    branch.FS.writeFile('experiment_start.nc', checkpoint.state);
    branch.FS.writeFile('experiment_coupling.bin', checkpoint.coupling);
    self.postMessage({ type: 'particles-preparing', done: 0, total: 1 });
    if (branch._webroms_init() !== 0) throw new Error('粒子実験用のROMS初期化に失敗しました。');
    branchReady = true;
    runtime = branch; startedTime = primary.startedTime; step = baseStep; recent = undefined;
    if (Math.abs(elapsed() - baseTime) > 1e-6) throw new Error('一時保存した海洋場の開始時刻が一致しません。');
    const restored = displaySnapshot();
    checkCheckpoint(baseState, restored);
    seedParticles(runtime, plan);
    const pacing = new RunPacing();
    for (let i = 1; i <= plan.steps; i++) {
      if (cancelled) break;
      advance();
      if (i === 1 || i % plan.every === 0 || i === plan.steps) {
        pendingRecord = { time: elapsed(), positions: particleSnapshot(runtime, plan.count) };
        records.push(pendingRecord);
      }
      if (pacing.displayDue(performance.now(), false) || i === plan.steps) {
        postState({ type: 'particles-progress', done: i, total: plan.steps, step, time: elapsed(), record: pendingRecord, ...(pendingRecord ? { state: capture({ mixing: true, precision: 32, omitStatic: true }) } : {}) });
        pacing.displayed(performance.now());
        pendingRecord = undefined;
      }
      if (pacing.yieldDue(performance.now())) { await pause(); pacing.yielded(performance.now()); }
    }
    if (cancelled && records.at(-1).time !== elapsed()) records.push({ time: elapsed(), positions: particleSnapshot(runtime, plan.count) });
    const bytes = particleNetcdf(runtime, experimentConfig, plan, records);
    particleOutput = { config: experimentConfig, plan, records };
    self.postMessage({ ...stateMessage('particles-complete'), records, bytes, cancelled, plan: { count: plan.count, mode: plan.mode, interval: plan.actualInterval } }, [bytes.buffer]);
  } finally {
    try {
      if (branchReady) { branch._webroms_floats_pause?.(); branch._webroms_finalize?.(); }
      for (const path of ['experiment_start.nc', 'experiment_coupling.bin']) if (branch.FS.analyzePath(path).exists) branch.FS.unlink(path);
    } finally {
      ({ runtime, config, startedTime, step, recent, ready, execution } = primary);
      self.postMessage({ type: 'execution', execution });
    }
  }
}

async function exportRun(data) {
  const plan = exportPlan(config, data.hours, data.interval, data.format, step);
  const pacing = new RunPacing();
  if (plan.streaming) {
    const { createStreamExport } = await import('../src/stream-export.js');
    const output = createStreamExport(runtime, config, data.format, data.layer, sendChunk, { interval: plan.interval });
    const start = elapsed(); let count = 1;
    await output.append({ time: start, state: snapshot(runtime, config) });
    for (let i = 1; i <= plan.steps; i++) {
      if (cancelled) { self.postMessage(stateMessage('export-cancelled')); return; }
      advance();
      if (i % plan.every === 0 || i === plan.steps) { await output.append({ time: elapsed(), state: snapshot(runtime, config) }); count++; }
      if (pacing.displayDue(performance.now(), false) || i === plan.steps) { self.postMessage({ type: 'export-progress', done: i, total: plan.steps, time: elapsed() }); pacing.displayed(performance.now()); }
      if (pacing.yieldDue(performance.now())) { await pause(); pacing.yielded(performance.now()); }
    }
    if (cancelled) { self.postMessage(stateMessage('export-cancelled')); return; }
    await output.close();
    self.postMessage({ ...stateMessage('export-complete'), streamed: true, count, start, format: data.format });
    return;
  }
  const records = [{ time: elapsed(), state: snapshot(runtime, config) }];
  for (let i = 1; i <= plan.steps; i++) {
    if (cancelled) { self.postMessage(stateMessage('export-cancelled')); return; }
    advance();
    if (i % plan.every === 0 || i === plan.steps) records.push({ time: elapsed(), state: snapshot(runtime, config) });
    if (pacing.displayDue(performance.now(), false) || i === plan.steps) {
      self.postMessage({ type: 'export-progress', done: i, total: plan.steps, time: elapsed() });
      pacing.displayed(performance.now());
    }
    if (pacing.yieldDue(performance.now())) { await pause(); pacing.yielded(performance.now()); }
  }
  if (cancelled) { self.postMessage(stateMessage('export-cancelled')); return; }
  self.postMessage({ type: 'export-writing' });
  const { resultNetcdf, resultShape } = await import('../src/results-export.js');
  const bytes = data.format === 'shape' ? resultShape(config, records) : resultNetcdf(runtime, config, records);
  self.postMessage({ ...stateMessage('export-complete'), bytes, count: records.length, start: records[0].time, format: data.format }, [bytes.buffer]);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'particles-recolor') {
    if (busy || !particleOutput) return;
    try {
      const { particleNetcdf } = await import('../src/particle-experiment.js');
      const sources = particleOutput.plan.sources.map(s => ({ ...s, color: data.sources.find(current => current.id === s.id)?.color ?? s.color }));
      const plan = { ...particleOutput.plan, sources };
      const bytes = particleNetcdf(runtime, particleOutput.config, plan, particleOutput.records);
      self.postMessage({ type: 'particles-recolored', requestId: data.requestId, bytes }, [bytes.buffer]);
    } catch (error) { self.postMessage({ type: 'particles-recolored', requestId: data.requestId, error: error.message }); }
    return;
  }
  if (data.type === 'pin-series') {
    try {
      if (!recent) throw new Error('時系列の計算データがありません。');
      self.postMessage({ type: 'pin-series', requestId: data.requestId, ...recent.query(baseFields, displaySnapshot(), elapsed(), data, config) });
    } catch (error) { self.postMessage({ type: 'pin-series', requestId: data.requestId, error: error.message }); }
    return;
  }
  if (data.type === 'export-chunk-ack') { const ack = chunkAck; chunkAck = null; if (data.error) ack?.reject(new Error(data.error)); else ack?.resolve(); return; }
  if (data.type === 'progress-ack') { displayPending = false; return; }
  if (data.type === 'cancel-export' || data.type === 'cancel-particles' || data.type === 'cancel-run') { cancelled = true; return; }
  if (busy || (data.type === 'run' ? Boolean(runtime) : !['export', 'particles', 'resume'].includes(data.type) || !ready)) return;
  busy = true; cancelled = false;
  try {
    if (data.type === 'run') await run(data.config);
    else if (data.type === 'resume') { self.postMessage({ type: 'execution', execution }); displayPending = false; await integrateMain(); }
    else if (data.type === 'particles') await particleRun(data);
    else await exportRun(data);
  } catch (error) {
    let state;
    if (ready) { try { state = displaySnapshot(); } catch { ready = false; } }
    self.postMessage({ type: data.type === 'export' ? 'export-error' : data.type === 'particles' ? 'particles-error' : 'error', message: error.message, ready, step, time: runtime && startedTime !== undefined ? elapsed() : 0, ...(state ? { state } : {}), logs: [...logs] });
  } finally { busy = false; }
};
