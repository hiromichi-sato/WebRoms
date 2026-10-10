import { buildFields } from './model.js';
import { resultNetcdf } from './results-export.js';
import { boundsOf } from './ocean-boundary.js';

export async function initialNetcdf(config, surfaceOnly = false) {
  if (!boundsOf(config)) throw new Error('初期場の保存には地形の緯度経度が必要です。');
  const { default: createRoms } = await import('../runtime/roms.js');
  const runtime = await createRoms({ print() {}, printErr() {} });
  const fields = buildFields(config), size = fields.nx * fields.ny;
  fields.z_r = Float64Array.from({ length: size * fields.nz }, (_, i) => -fields.h[i % size] + (fields.h[i % size] + fields.zeta[i % size]) * (Math.floor(i / size) + .5) / fields.nz);
  return resultNetcdf(runtime, config, [{ time: 0, state: fields }], { surfaceOnly, initial: true });
}
