import { biologyTracers } from './model.js';

export const fieldSizes = ({ nx, ny, nz }, ecosystem = false, model = 'fennel') => ({ h: nx * ny, zeta: nx * ny, temp: nx * ny * nz, salt: nx * ny * nz, u: (nx - 1) * ny * nz, v: nx * (ny - 1) * nz, ubar: (nx - 1) * ny, vbar: nx * (ny - 1), z_r: nx * ny * nz,
  ...(ecosystem ? Object.fromEntries(biologyTracers({ ecosystem: { model } }).map(({ key }) => [`bio_${key}`, nx * ny * nz])) : {}) });

export function nonfiniteResultError(name, values, config, { step, time } = {}) {
  const {nx,ny,nz,geoBounds:b}=config.grid;
  const isU=['u','ubar'].includes(name),isV=['v','vbar'].includes(name);
  const width=nx-(isU?1:0),height=ny-(isV?1:0),size=width*height;
  const labels={h:'水深',zeta:'海面高度',temp:'水温',salt:'塩分',u:'東西流速',v:'南北流速',ubar:'鉛直平均東西流速',vbar:'鉛直平均南北流速',z_r:'鉛直座標',verticalDiffusivity:'鉛直拡散係数'};
  const tracer=name.startsWith('bio_')?biologyTracers(config).find(t=>t.key===name.slice(4)):null;
  const label=labels[name]??tracer?.label??name;
  let count=0;const samples=[];
  for(let p=0;p<values.length;p++)if(!Number.isFinite(values[p])){
    count++;if(samples.length>=5)continue;
    const i=p%width,j=Math.floor(p/width)%height,k=Math.floor(p/size);
    let location=`i=${i+1}, j=${j+1}`;
    if(values.length>size)location+=`、海面から${nz-k}層目（底から${k+1}層目）`;
    if(b){const lon=b.west+(i+(isU ? .5 : 0))/(nx-1)*(b.east-b.west),lat=b.south+(j+(isV ? .5 : 0))/(ny-1)*(b.north-b.south);location+=`、経度${lon.toFixed(5)}°・緯度${lat.toFixed(5)}°`;}
    samples.push(`${location}：${String(values[p])}`);
  }
  const clock=[Number.isInteger(step)?`ステップ${step}`:'',Number.isFinite(time)?`モデル経過${(time/3600).toFixed(4)}時間（${time.toFixed(1)}秒）`:''].filter(Boolean).join('、');
  return new Error(`${label}（${name}）に異常値を検出しました。数値発散または不正な入力の可能性があります。${clock?`\n${clock}`:''}\n異常値：${count}格子点。最初の${samples.length}点：\n${samples.join('\n')}\n格子番号は西→東・南→北の1始まり${isU?'（U格子：東西のセル間）':isV?'（V格子：南北のセル間）':'（セル中心）'}です。検出位置は発散の発生源とは限りません。`);
}

export function snapshot(runtime, config, { mixing = false, precision = 64, omitStatic = false, step, time = runtime._webroms_time?.() } = {}) {
  const state = {};
  const ArrayType = precision === 32 ? Float32Array : Float64Array;
  const sizes = Object.entries(fieldSizes(config.grid, config.ecosystem.enabled, config.ecosystem.model));
  const scratch = runtime._malloc(Math.max(...sizes.map(([, size]) => size), mixing ? config.grid.nx * config.grid.ny * (config.grid.nz + 1) : 0) * 8);
  if (!scratch) throw new Error('ROMS result allocation failed');
  try {
    for (const [id, [name, size]] of sizes.entries()) {
      if (omitStatic && name === 'h') continue;
      const pointer = scratch;
      const count = runtime._webroms_copy(id, pointer);
      if (count !== size) throw new Error(`${name}: ROMS array size mismatch (${count}/${size})`);
      const values = new ArrayType(runtime.HEAPF64.subarray(pointer / 8, pointer / 8 + size));
      if (values.some(value => !Number.isFinite(value))) throw nonfiniteResultError(name, values, config, {step,time});
      if (name.startsWith('bio_')) (state.biology ??= {})[name.slice(4)] = values;
      else state[name] = values;
    }
    if (mixing) {
      const { nx, ny, nz } = config.grid, size = nx * ny;
      const values = new ArrayType(size * nz);
      if (!config.numerics.calculateDiffusion) values.fill(config.numerics.verticalDiffusion);
      else {
        const count = size * (nz + 1), pointer = scratch;
        if (runtime._webroms_copy_mixing(0, pointer) !== count) throw new Error('ROMS mixing array size mismatch');
        const interfaces = runtime.HEAPF64.subarray(pointer / 8, pointer / 8 + count);
        // Current ROMS setup uses linear sigma layers: centers bisect interfaces.
        for (let i = 0; i < values.length; i++) values[i] = (interfaces[i] + interfaces[i + size]) / 2;
      }
      if(values.some(value=>!Number.isFinite(value)))throw nonfiniteResultError('verticalDiffusivity',values,config,{step,time});
      state.verticalDiffusivity = values;
    }
    return state;
  } finally { runtime._free(scratch); }
}
