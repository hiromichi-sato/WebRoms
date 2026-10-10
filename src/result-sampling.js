import { fieldValue } from './view-section.js';

// ROMS stores layers bottom first. Depth is positive below the local sea surface.
export function layerDepth(f, p, k) {
  const surface = f.zeta?.[p] ?? 0;
  return f.z_r ? surface - f.z_r[k * f.nx * f.ny + p] : (f.h[p] + surface) * (1 - (k + 0.5) / f.nz);
}

export function sampleDepth(f, variable, p, depth) {
  if (!f.mask[p] || !Number.isFinite(depth) || depth < 0 || depth > f.h[p] + (f.zeta?.[p] ?? 0)) return NaN;
  if (['h', 'zeta'].includes(variable)) return fieldValue(f, variable, p, 0);
  if (depth >= layerDepth(f, p, 0)) return fieldValue(f, variable, p, 0);
  for (let k = 1; k < f.nz; k++) {
    const top = layerDepth(f, p, k), bottom = layerDepth(f, p, k - 1);
    if (depth >= top) {
      const weight = (depth - top) / (bottom - top || 1);
      return fieldValue(f, variable, p, k) * (1 - weight) + fieldValue(f, variable, p, k - 1) * weight;
    }
  }
  return fieldValue(f, variable, p, f.nz - 1);
}

export function vectorRatio(speed, maximum, scale = 'log') {
  if (!(speed > 0) || !(maximum > 0)) return 0;
  const ratio = Math.min(1, speed / maximum);
  return scale === 'linear' ? ratio : Math.log1p(100 * ratio) / Math.log1p(100);
}

export function vectorSpeedAtRatio(ratio, maximum, scale = 'log') {
  if (!(ratio > 0) || !(maximum > 0)) return 0;
  const length = Math.min(1, ratio);
  return maximum * (scale === 'linear' ? length : Math.expm1(length * Math.log1p(100)) / 100);
}

export function vectorZoomLayout(nx, ny, zoom) {
  const z = Math.max(.25, Number.isFinite(zoom) ? zoom : 1);
  const baseStride = Math.max(1, Math.ceil(Math.max(nx, ny) / 12));
  return { stride: Math.max(1, Math.ceil(baseStride / (z * z))), lengthInCells: baseStride * 1.15 / Math.pow(z, 1.5) };
}
