import { BIO_TRACERS } from './model.js';

export const fieldSizes = ({ nx, ny, nz }, ecosystem = false) => ({ h: nx * ny, zeta: nx * ny, temp: nx * ny * nz, salt: nx * ny * nz, u: (nx - 1) * ny * nz, v: nx * (ny - 1) * nz, ubar: (nx - 1) * ny, vbar: nx * (ny - 1), z_r: nx * ny * nz,
  ...(ecosystem ? Object.fromEntries(BIO_TRACERS.map(({ key }) => [`bio_${key}`, nx * ny * nz])) : {}) });

export function snapshot(runtime, config) {
  const state = {};
  for (const [id, [name, size]] of Object.entries(fieldSizes(config.grid, config.ecosystem.enabled)).entries()) {
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

export function residual(previous, next, masks, dt) {
  if (!(dt > 0)) return Infinity;
  let result = 0;
  for (const [name, scale, mask] of [['zeta', 1, masks.mask], ['temp', 10, masks.mask], ['salt', 35, masks.mask], ['u', 1, masks.maskU], ['v', 1, masks.maskV]]) {
    for (let i = 0; i < next[name].length; i++) if (mask[i % mask.length]) result = Math.max(result, Math.abs(next[name][i] - previous[name][i]) / scale / dt);
  }
  if (next.biology && previous.biology) for (const [key, values] of Object.entries(next.biology)) for (let i = 0; i < values.length; i++) if (masks.mask[i % masks.mask.length]) result = Math.max(result, Math.abs(values[i] - previous.biology[key][i]) / Math.max(1, Math.abs(values[i])) / dt);
  return result;
}
