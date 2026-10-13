import { writeInputs } from '../src/roms-input.js';
import { validate } from '../src/model.js';
import { snapshot } from '../src/runtime-state.js';
import { exportPlan, RUNTIME_STEP_LIMIT } from '../src/export-plan.js';
import { RecentSeries } from '../src/recent-series.js';
let recent, baseFields, particleOutput;

let runtime, config, startedTime, step = 0, busy = false, ready = false, cancelled = false, displayPending = false;
const logs = [];
let chunkAck;
const sendChunk = bytes => new Promise((resolve, reject) => { chunkAck = { resolve, reject }; self.postMessage({ type: 'export-chunk', bytes }, [bytes.buffer]); });
const log = line => { logs.push(String(line)); if (logs.length > 120) logs.shift(); };
const text = async path => { const response = await fetch(new URL(path, import.meta.url)); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`); return response.text(); };

const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const elapsed = () => runtime._webroms_time() - startedTime;
const displaySnapshot = () => snapshot(runtime, config, { mixing: true });
const stateMessage = type => ({ type, step, time: elapsed(), state: displaySnapshot() });
function advance() {
  const before = runtime._webroms_time(), code = runtime._webroms_step();
  if (code !== 0) { ready = false; throw new Error(`ROMS計算エラー ${code} / step ${step + 1}`); }
  if (!(runtime._webroms_time() > before)) { ready = false; throw new Error('ROMSのモデル時刻が進みませんでした。'); }
  step++;
  if (recent?.due(elapsed())) recent.add(elapsed(), displaySnapshot());
}

async function run(initialConfig) {
    config = initialConfig;
    const errors = validate(config);
    if (errors.length) throw new Error(errors.join('\n'));
    const model = config.ecosystem.enabled ? config.ecosystem.model : 'physical';
    const modules = { physical: './roms.js', npzd: './npzd/roms.js', nemuro: './nemuro/roms.js' };
    if (!modules[model]) throw new Error('この生態系モデルの計算用WASMは未対応です。');
    const { default: createRoms } = await import(config.numerics.calculateDiffusion ? `./gls/${model}/roms.js` : modules[model]);
    self.postMessage({ type: 'status', message: 'ROMS実行核を読み込み中' });
    const [module, template, varinfo] = await Promise.all([createRoms({ print: log, printErr: log }), text('./roms-template.in'), text('./varinfo.dat')]);
    runtime = module;
    if (config.numerics.calculateDiffusion && typeof runtime._webroms_copy_mixing !== 'function') throw new Error('GLS対応のROMS実行核が必要です。');
    runtime.FS.writeFile('varinfo.dat', varinfo);
    baseFields = writeInputs(runtime, config, template, RUNTIME_STEP_LIMIT);
    self.postMessage({ type: 'status', message: 'ROMSを初期化中' });
    const initialized = runtime._webroms_init();
    if (initialized !== 0) throw new Error(`ROMS初期化エラー ${initialized}`);
    startedTime = runtime._webroms_time();
    const initial = displaySnapshot();
    recent = new RecentSeries(initial, config.numerics.dt); recent.add(0, initial);
    for (; step < config.numerics.maxSteps;) {
      advance();
      if ((!displayPending && (step % 5 === 0 || step === 1)) || step === config.numerics.maxSteps) { displayPending = true; self.postMessage(stateMessage('progress')); }
      if (step % 5 === 0) await pause();
    }
    ready = true;
    log('WebROMS: DONE - requested steps completed; runtime retained for additional RUN');
    self.postMessage({ type: 'complete', step, time: elapsed(), logs: [...logs] });
}

async function particleRun(data) {
  const { particlePlan, seedParticles, particleSnapshot, initialParticleRecord, particleNetcdf } = await import('../src/particle-experiment.js');
  const experimentConfig = { ...config, particles: data.settings };
  const plan = particlePlan(experimentConfig, baseFields, step);
  const records = [initialParticleRecord(plan, elapsed())];
  seedParticles(runtime, plan);
  let pendingRecord;
  try {
    for (let i = 1; i <= plan.steps; i++) {
      if (cancelled) break;
      advance();
      if (i === 1 || i % plan.every === 0 || i === plan.steps) {
        pendingRecord = { time: elapsed(), positions: particleSnapshot(runtime, plan.count) };
        records.push(pendingRecord);
      }
      if (i % 5 === 0 || i === plan.steps) {
        self.postMessage({ type: 'particles-progress', done: i, total: plan.steps, step, time: elapsed(), record: pendingRecord, ...(pendingRecord ? { state: displaySnapshot() } : {}) });
        pendingRecord = undefined;
        await pause();
      }
    }
    if (cancelled && records.at(-1).time !== elapsed()) records.push({ time: elapsed(), positions: particleSnapshot(runtime, plan.count) });
    const bytes = particleNetcdf(runtime, experimentConfig, plan, records);
    particleOutput = { config: experimentConfig, plan, records };
    self.postMessage({ ...stateMessage('particles-complete'), records, bytes, cancelled, plan: { count: plan.count, mode: plan.mode, interval: plan.actualInterval } }, [bytes.buffer]);
  } finally { runtime._webroms_floats_pause?.(); }
}

async function exportRun(data) {
  const plan = exportPlan(config, data.hours, data.interval, data.format, step);
  if (plan.streaming) {
    const { createStreamExport } = await import('../src/stream-export.js');
    const output = createStreamExport(runtime, config, data.format, data.layer, sendChunk, { interval: plan.interval });
    const start = elapsed(); let count = 1;
    await output.append({ time: start, state: snapshot(runtime, config) });
    for (let i = 1; i <= plan.steps; i++) {
      if (cancelled) { self.postMessage(stateMessage('export-cancelled')); return; }
      advance();
      if (i % plan.every === 0 || i === plan.steps) { await output.append({ time: elapsed(), state: snapshot(runtime, config) }); count++; }
      if (i % 5 === 0 || i === plan.steps) { self.postMessage({ type: 'export-progress', done: i, total: plan.steps, time: elapsed() }); await pause(); }
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
    if (i % 5 === 0 || i === plan.steps) {
      self.postMessage({ type: 'export-progress', done: i, total: plan.steps, time: elapsed() });
      await pause();
    }
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
  if (data.type === 'cancel-export' || data.type === 'cancel-particles') { cancelled = true; return; }
  if (busy || (data.type === 'run' ? Boolean(runtime) : !['export', 'particles'].includes(data.type) || !ready)) return;
  busy = true; cancelled = false;
  try {
    if (data.type === 'run') await run(data.config);
    else if (data.type === 'particles') await particleRun(data);
    else await exportRun(data);
  } catch (error) {
    let state;
    if (ready) { try { state = displaySnapshot(); } catch { ready = false; } }
    self.postMessage({ type: data.type === 'export' ? 'export-error' : data.type === 'particles' ? 'particles-error' : 'error', message: error.message, ready, step, time: runtime && startedTime !== undefined ? elapsed() : 0, ...(state ? { state } : {}), logs: [...logs] });
  } finally { busy = false; }
};
