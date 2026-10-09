import { biologyTracers } from './model.js';

export const fieldSizes = ({ nx, ny, nz }, ecosystem = false, model = 'fennel') => ({ h: nx * ny, zeta: nx * ny, temp: nx * ny * nz, salt: nx * ny * nz, u: (nx - 1) * ny * nz, v: nx * (ny - 1) * nz, ubar: (nx - 1) * ny, vbar: nx * (ny - 1), z_r: nx * ny * nz,
  ...(ecosystem ? Object.fromEntries(biologyTracers({ ecosystem: { model } }).map(({ key }) => [`bio_${key}`, nx * ny * nz])) : {}) });

export function snapshot(runtime, config) {
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
  return state;
}
