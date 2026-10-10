import { fieldSizes } from './runtime-state.js';
import { forcingEnd } from './ocean-boundary.js';

// Reserve native integration time for user-requested continuations; JS controls each run.
export const RUNTIME_STEP_LIMIT = 10000000;
export function exportPlan(config, hours, interval, format, currentStep = config.numerics.maxSteps) {
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(interval) || interval <= 0) throw new Error('追加計算時間は0以上、保存間隔は0より大きい値にしてください。');
  if (!['netcdf', 'netcdf-series', 'shape'].includes(format)) throw new Error('出力形式を選択してください。');
  const dt = config.numerics.dt, steps = Math.max(0, Math.ceil(hours * 3600 / dt - 1e-9)), every = Math.max(1, Math.ceil(interval / dt - 1e-9));
  if (steps > 1000000 || currentStep + steps >= RUNTIME_STEP_LIMIT) throw new Error('追加RUNが長すぎます。1回100万ステップ以内にしてください。');
  if ((currentStep + steps) * dt > forcingEnd(config)) throw new Error('追加RUNの終了が潮汐・補正データの期間を超えます。期間内を指定してください。');
  const count = 1 + Math.ceil(steps / every);
  const bytes = Object.values(fieldSizes(config.grid, config.ecosystem.enabled, config.ecosystem.model)).reduce((sum, size) => sum + size * 8, 0) * count;
  if (format === 'netcdf' && bytes > 256 * 1024 * 1024) throw new Error('単一NetCDFが256 MiBを超えます。NetCDF時刻別ZIP（逐次保存）を選択してください。計算済み状態は保持しています。');
  if (format !== 'netcdf' && (bytes > 3.5 * 1024 ** 3 || count > 20000)) throw new Error('ZIP出力は推定3.5 GiB・2万時刻以内です。期間を分けて保存してください。');
  return { steps, every, count, bytes, streaming: format !== 'netcdf', duration: steps * dt, interval: every * dt };
}
