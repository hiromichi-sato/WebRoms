export function buildCoastline(grid, fields, polygons, options, progress = () => {}, signal) {
  return new Promise((resolve, reject) => {
    if(signal?.aborted){reject(new Error('地形構築を中止しました。'));return;}
    const worker = new Worker(new URL('./terrain-build-worker.js', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { finish(); reject(new Error('構築が長時間続いています。対象範囲を小さくしてください。')); }, 180000);
    const finish = () => { clearTimeout(timer); worker.terminate(); signal?.removeEventListener('abort',abort); };
    const abort=()=>{finish();reject(new Error('地形構築を中止しました。'));};
    signal?.addEventListener('abort',abort,{once:true});
    worker.onmessage = event => { if (event.data.progress) { progress(event.data.progress); return; } finish(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.grid); };
    worker.onerror = () => { finish(); reject(new Error('地形構築を開始できませんでした。起動環境を確認してください。')); };
    worker.postMessage({ grid, fields: { mask: fields.mask, h: fields.h }, polygons, options });
  });
}
