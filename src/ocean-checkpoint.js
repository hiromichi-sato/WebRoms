export function captureOceanCheckpoint(runtime) {
  if (typeof runtime._webroms_checkpoint !== 'function') throw new Error('一時状態保存に対応したROMS実行核が必要です。');
  const path = 'experiment_checkpoint.nc';
  try {
    const code = runtime._webroms_checkpoint();
    if (code !== 0) throw new Error(`07終了場の一時保存に失敗しました（${code}）。`);
    return { state: runtime.FS.readFile(path), coupling: runtime.FS.readFile('experiment_coupling.bin') };
  } finally { for (const file of [path, 'experiment_coupling.bin']) if (runtime.FS.analyzePath(file).exists) runtime.FS.unlink(file); }
}
