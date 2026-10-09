import { writeInputs } from '../src/roms-input.js';
import { validate } from '../src/model.js';
import { snapshot } from '../src/runtime-state.js';
import { exportPlan, RUNTIME_STEP_LIMIT } from '../src/export-plan.js';

let runtime, config, startedTime, step = 0, busy = false, ready = false, cancelled = false, displayPending = false;
const logs = [];
const log = line => { logs.push(String(line)); if (logs.length > 120) logs.shift(); };
const text = async path => { const response = await fetch(new URL(path, import.meta.url)); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`); return response.text(); };

const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const elapsed = () => runtime._webroms_time() - startedTime;
const stateMessage = type => ({ type, step, time: elapsed(), state: snapshot(runtime, config) });
function advance() {
  const before = runtime._webroms_time(), code = runtime._webroms_step();
  if (code !== 0) { ready = false; throw new Error(`ROMS計算エラー ${code} / step ${step + 1}`); }
  if (!(runtime._webroms_time() > before)) { ready = false; throw new Error('ROMSのモデル時刻が進みませんでした。'); }
  step++;
}

async function run(initialConfig) {
    config = initialConfig;
    const errors = validate(config);
    if (errors.length) throw new Error(errors.join('\n'));
    const model = config.ecosystem.enabled ? config.ecosystem.model : 'physical';
    const modules = { physical: './roms.js', npzd: './npzd/roms.js', nemuro: './nemuro/roms.js' };
    if (!modules[model]) throw new Error('この生態系モデルの計算用WASMは未対応です。');
    const { default: createRoms } = await import(modules[model]);
    self.postMessage({ type: 'status', message: 'ROMS実行核を読み込み中' });
    const [module, template, varinfo] = await Promise.all([createRoms({ print: log, printErr: log }), text('./roms-template.in'), text('./varinfo.dat')]);
    runtime = module;
    runtime.FS.writeFile('varinfo.dat', varinfo);
    writeInputs(runtime, config, template, RUNTIME_STEP_LIMIT);
    self.postMessage({ type: 'status', message: 'ROMSを初期化中' });
    const initialized = runtime._webroms_init();
    if (initialized !== 0) throw new Error(`ROMS初期化エラー ${initialized}`);
    startedTime = runtime._webroms_time();
    for (; step < config.numerics.maxSteps;) {
      advance();
      if ((!displayPending && (step % 5 === 0 || step === 1)) || step === config.numerics.maxSteps) { displayPending = true; self.postMessage(stateMessage('progress')); }
      if (step % 5 === 0) await pause();
    }
    ready = true;
    log('WebROMS: DONE - requested steps completed; runtime retained for additional RUN');
    self.postMessage({ type: 'complete', step, time: elapsed(), logs: [...logs] });
}

async function exportRun(data) {
  const plan = exportPlan(config, data.hours, data.interval, data.format, step);
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
  if (data.type === 'progress-ack') { displayPending = false; return; }
  if (data.type === 'cancel-export') { cancelled = true; return; }
  if (busy || (data.type === 'run' ? Boolean(runtime) : data.type !== 'export' || !ready)) return;
  busy = true; cancelled = false;
  try {
    if (data.type === 'run') await run(data.config);
    else await exportRun(data);
  } catch (error) {
    let state;
    if (ready) { try { state = snapshot(runtime, config); } catch { ready = false; } }
    self.postMessage({ type: data.type === 'export' ? 'export-error' : 'error', message: error.message, ready, step, time: runtime && startedTime !== undefined ? elapsed() : 0, ...(state ? { state } : {}), logs: [...logs] });
  } finally { busy = false; }
};
