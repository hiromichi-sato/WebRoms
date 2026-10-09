import { fieldSizes } from './runtime-state.js';

// Reserve native integration time for user-requested continuations; JS controls each run.
export const RUNTIME_STEP_LIMIT = 10000000;
export function exportPlan(config, hours, interval, format, currentStep = config.numerics.maxSteps) {
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(interval) || interval <= 0) throw new Error('追加計算時間は0以上、保存間隔は0より大きい値にしてください。');
  if (!['netcdf', 'shape'].includes(format)) throw new Error('出力形式を選択してください。');
  const dt = config.numerics.dt, steps = Math.max(0, Math.ceil(hours * 3600 / dt - 1e-9)), every = Math.max(1, Math.ceil(interval / dt - 1e-9));
  if (steps > 1000000 || currentStep + steps >= RUNTIME_STEP_LIMIT) throw new Error('追加RUNが長すぎます。1回100万ステップ以内にしてください。');
  const count = 1 + Math.ceil(steps / every);
  const bytes = Object.values(fieldSizes(config.grid, config.ecosystem.enabled, config.ecosystem.model)).reduce((sum, size) => sum + size * 8, 0) * count;
  if (bytes > 256 * 1024 * 1024) throw new Error('出力予定データが256 MiBを超えます。保存間隔を広げるか追加時間を短くしてください。計算済みの状態は保持しています。');
  if (format === 'shape' && count * config.grid.nx * config.grid.ny * config.grid.nz > 500000) throw new Error('Shape出力は50万セル層までです。保存間隔を広げるか追加時間を短くしてください。');
  return { steps, every, count, bytes, duration: steps * dt, interval: every * dt };
}
