export function executionPolicy(config, environment = globalThis) {
  const requested = config.numerics.executionMode ?? 'serial';
  if (!['auto', 'serial', '2', '4'].includes(requested)) throw new Error('CPU実行方式が不正です。');
  const model = config.ecosystem.enabled ? config.ecosystem.model : 'physical';
  const serialArtifact = config.numerics.calculateDiffusion ? `gls/${model}/roms.wasm` : model === 'physical' ? 'roms.wasm' : `${model}/roms.wasm`;
  const serial = reason => ({ requested, threads: 1, artifact: serialArtifact, module: serialArtifact.replace(/\.wasm$/, '.js'), reason });
  if (requested === 'serial') return serial('直列を指定');
  if (!['physical', 'npzd', 'nemuro'].includes(model)) return serial('未対応モデルは直列で実行');
  if (!environment.crossOriginIsolated || typeof environment.SharedArrayBuffer !== 'function') return serial('共有メモリー非対応のため直列で実行');
  if (config.grid.nx < 10 || config.grid.ny < 10) return serial('小さい格子は直列で実行');
  const cores = environment.navigator?.hardwareConcurrency ?? 1;
  if (requested === 'auto' && cores < 4) return serial('CPU数に合わせて直列で実行');
  const threads = requested === 'auto' ? 4 : Number(requested);
  const artifact = `openmp/${config.numerics.calculateDiffusion ? 'gls/' : ''}${model}/roms.wasm`;
  return { requested, threads, artifact, module: artifact.replace(/\.wasm$/, '.js'), reason: `${model.toUpperCase()}・${config.numerics.calculateDiffusion ? 'GLS' : '一定拡散'}のOpenMP` };
}
