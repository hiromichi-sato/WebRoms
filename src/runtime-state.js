import { biologyTracers } from './model.js';

export const fieldSizes = ({ nx, ny, nz }, ecosystem = false, model = 'fennel') => ({ h: nx * ny, zeta: nx * ny, temp: nx * ny * nz, salt: nx * ny * nz, u: (nx - 1) * ny * nz, v: nx * (ny - 1) * nz, ubar: (nx - 1) * ny, vbar: nx * (ny - 1), z_r: nx * ny * nz,
  ...(ecosystem ? Object.fromEntries(biologyTracers({ ecosystem: { model } }).map(({ key }) => [`bio_${key}`, nx * ny * nz])) : {}) });

export function snapshot(runtime, config, { mixing = false } = {}) {
  const state = {};
  for (const [id, [name, size]] of Object.entries(fieldSizes(config.grid, config.ecosystem.enabled, config.ecosystem.model)).entries()) {
    const pointer = runtime._malloc(size * 8);
    if (!pointer) throw new Error('ROMS result allocation failed');
    try {
      const count = runtime._webroms_copy(id, pointer);
      if (count !== size) throw new Error(`${name}: ROMS array size mismatch (${count}/${size})`);
      const values = runtime.HEAPF64.slice(pointer / 8, pointer / 8 + size);
      if (values.some(value => !Number.isFinite(value))) throw new Error(`${name}: nonfinite ROMS result`);
      if (name.startsWith('bio_')) (state.biology ??= {})[name.slice(4)] = values;
      else state[name] = values;
    } finally { runtime._free(pointer); }
  }
  if (mixing) {
    const { nx, ny, nz } = config.grid, size = nx * ny;
    const values = new Float64Array(size * nz);
    if (!config.numerics.calculateDiffusion) values.fill(config.numerics.verticalDiffusion);
    else {
      const count = size * (nz + 1), pointer = runtime._malloc(count * 8);
      if (!pointer) throw new Error('ROMS mixing allocation failed');
      try {
        if (runtime._webroms_copy_mixing(0, pointer) !== count) throw new Error('ROMS mixing array size mismatch');
        const interfaces = runtime.HEAPF64.subarray(pointer / 8, pointer / 8 + count);
        // Current ROMS setup uses linear sigma layers: centers bisect interfaces.
        for (let i = 0; i < values.length; i++) values[i] = (interfaces[i] + interfaces[i + size]) / 2;
      } finally { runtime._free(pointer); }
    }
    state.verticalDiffusivity = values;
  }
  return state;
}
