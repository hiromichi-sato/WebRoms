import { writeInputs } from '../src/roms-input.js';
import { validate } from '../src/model.js';
import { snapshot as readState, residual } from '../src/runtime-state.js';

let runtime;
let cancelled = false;
const logs = [];
const log = line => { logs.push(String(line)); if (logs.length > 120) logs.shift(); };
const text = async path => { const response = await fetch(new URL(path, import.meta.url)); if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`); return response.text(); };

function snapshot(config) {
  return readState(runtime, config);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { cancelled = true; return; }
  if (data.type !== 'run' || runtime) return;
  const config = data.config;
  try {
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
    const masks = writeInputs(runtime, config, template);
    self.postMessage({ type: 'status', message: 'ROMSを初期化中' });
    const initialized = runtime._webroms_init();
    if (initialized !== 0) throw new Error(`ROMS初期化エラー ${initialized}`);
    let previous = snapshot(config), previousTime = runtime._webroms_time(), stable = 0;
    const startedTime = previousTime;
    const saveEvery = Math.max(1, Math.ceil((config.numerics.outputInterval ?? 3600) / config.numerics.dt));
    let savedBytes = 0;
    const save = (state, time) => {
      const bytes = [...Object.values(state).filter(ArrayBuffer.isView), ...Object.values(state.biology ?? {})].reduce((n, values) => n + values.byteLength, 0);
      if (savedBytes + bytes > 128e6) throw new Error('保存済み結果が128 MBに達したため停止しました。保存間隔を広げて再実行してください。');
      savedBytes += bytes; self.postMessage({ type: 'record', time, state });
    };
    save(previous, 0);
    for (let step = 1; step <= config.numerics.maxSteps; step++) {
      if (cancelled) { self.postMessage({ type: 'stopped', step: step - 1, reason: 'cancelled' }); break; }
      const code = runtime._webroms_step();
      if (code !== 0) throw new Error(`ROMS計算エラー ${code} / step ${step}`);
      const next = snapshot(config), currentTime = runtime._webroms_time();
      const elapsed = currentTime - previousTime;
      const change = elapsed > 0 ? residual(previous, next, masks, elapsed) : Infinity;
      stable = change <= config.numerics.tolerance ? stable + 1 : 0;
      const converged = stable >= config.numerics.steadyWindow;
      if (step % saveEvery === 0 || converged || step === config.numerics.maxSteps) save(next, currentTime - startedTime);
      if (step % 5 === 0 || step === 1 || converged || step === config.numerics.maxSteps) self.postMessage({ type: 'progress', step, time: currentTime - startedTime, residual: change, stable, state: next });
      previous = next; previousTime = currentTime;
      if (converged || step === config.numerics.maxSteps) {
        runtime._webroms_finalize();
        self.postMessage({ type: 'complete', step, converged, logs: [...logs] });
        return;
      }
      if (step % 5 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    runtime._webroms_finalize();
  } catch (error) { self.postMessage({ type: 'error', message: error.message, logs: [...logs] }); }
};
