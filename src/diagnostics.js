import { fieldValue } from './view-section.js';
import { layerDepth, sampleDepth } from './result-sampling.js';
import { npzdRates } from './ecosystem-panel.js';

export const DIAGNOSTICS = {
  diagVorticity: { label: '相対渦度', unit: 's⁻¹', formula: 'dv/dx - du/dy' },
  diagShear: { label: '鉛直せん断', unit: 's⁻¹', formula: 'sqrt((du/dz)^2 + (dv/dz)^2)' },
  diagStrain: { label: '水平変形率', unit: 's⁻¹', formula: 'sqrt((du/dx - dv/dy)^2 + (dv/dx + du/dy)^2)' },
  diagOW: { label: 'OW', unit: 's⁻²', formula: '(du/dx - dv/dy)^2 + (dv/dx + du/dy)^2 - (dv/dx - du/dy)^2' },
  diagDivergence: { label: '水平発散', unit: 's⁻¹', formula: 'du/dx + dv/dy' },
  diagKE: { label: '運動エネルギー KE', unit: 'm²/s²', formula: '(u^2 + v^2)/2（単位質量あたり・瞬間値）' },
  diagProduction: { label: '光合成・栄養塩取り込み（瞬間反応）', unit: 'mmol N/m³/day', rate: 'U', formula: 'Vm_NO3 exp(-K_ext d) N P/(K_NO3+N)' },
  diagGrazing: { label: '捕食量（瞬間反応）', unit: 'mmol N/m³/day', rate: 'G', formula: 'ZooGR Z P^2/(K_Phy^2+P^2)' },
  diagGrazingPressure: { label: '捕食圧（Pに対する損失率）', unit: 'day⁻¹', rate: 'pressure', formula: 'G/P（P=0は未定義）' },
  diagMortality: { label: '植物枯死（瞬間反応）', unit: 'mmol N/m³/day', rate: 'M', formula: 'PhyMR P' },
  diagRemineralization: { label: '再無機化（瞬間反応）', unit: 'mmol N/m³/day', rate: 'R', formula: 'DetRR D' },
  diagNetGrowth: { label: '植物の正味増減（瞬間反応）', unit: 'mmol N/m³/day', rate: 'P', formula: 'U - G - M（輸送を除く）' }
};
export function diagnosticAvailable(key, config) {
  const d = DIAGNOSTICS[key];
  return !!d && !d.unavailable && (!d.rate || config.ecosystem.enabled && config.ecosystem.model === 'npzd');
}

// Horizontal gradients are evaluated at the same geometric height, never across land.
function derivative(f, axis, variable, p, k) {
  const n = axis === 'x' ? f.nx : f.ny, at = axis === 'x' ? p % f.nx : Math.floor(p / f.nx);
  const stride = axis === 'x' ? 1 : f.nx, spacing = axis === 'x' ? f.dx : f.dy;
  const z = (f.zeta?.[p] ?? 0) - layerDepth(f, p, k), center = fieldValue(f, variable, p, k);
  const sample = q => {
    const depth = (f.zeta?.[q] ?? 0) - z;
    if (!f.mask[q] || depth < layerDepth(f, q, f.nz - 1) - 1e-8 || depth > layerDepth(f, q, 0) + 1e-8) return NaN;
    return sampleDepth(f, variable, q, depth);
  };
  const left = at > 0 ? sample(p - stride) : NaN, right = at < n - 1 ? sample(p + stride) : NaN;
  if (Number.isFinite(left) && Number.isFinite(right)) return (right - left) / (2 * spacing);
  if (Number.isFinite(right)) return (right - center) / spacing;
  if (Number.isFinite(left)) return (center - left) / spacing;
  return NaN;
}

export function diagnosticValue(f, config, key, p, k) {
  if (!f.mask[p] || !diagnosticAvailable(key, config)) return NaN;
  const d = DIAGNOSTICS[key];
  if (d.rate) {
    const initial = Object.fromEntries(Object.keys(f.biology ?? {}).map(key => [key, fieldValue(f, key, p, k)]));
    const rates = npzdRates({ ...config, ecosystem: { ...config.ecosystem, initial } }, layerDepth(f, p, k) - (f.zeta?.[p] ?? 0));
    return d.rate === 'pressure' ? initial.npzd_Phyt > 0 ? rates.G / initial.npzd_Phyt : NaN : rates[d.rate];
  }
  if (key === 'diagShear') {
    const bottom = Math.max(0, k - 1), top = Math.min(f.nz - 1, k + 1);
    const dz = layerDepth(f, p, bottom) - layerDepth(f, p, top);
    return dz > 0 ? Math.hypot(...['u', 'v'].map(v => (fieldValue(f, v, p, top) - fieldValue(f, v, p, bottom)) / dz)) : NaN;
  }
  if (key === 'diagKE') return (fieldValue(f, 'u', p, k) ** 2 + fieldValue(f, 'v', p, k) ** 2) / 2;
  const ux = derivative(f, 'x', 'u', p, k), uy = derivative(f, 'y', 'u', p, k);
  const vx = derivative(f, 'x', 'v', p, k), vy = derivative(f, 'y', 'v', p, k);
  if (key === 'diagVorticity') return vx - uy;
  if (key === 'diagDivergence') return ux + vy;
  const strain2 = (ux - vy) ** 2 + (vx + uy) ** 2;
  return key === 'diagStrain' ? Math.sqrt(strain2) : strain2 - (vx - uy) ** 2;
}

export function diagnosticFields(f, config, key) {
  const size = f.nx * f.ny;
  return { ...f, [key]: Float64Array.from({ length: size * f.nz }, (_, i) => diagnosticValue(f, config, key, i % size, Math.floor(i / size))) };
}

export function sampleDiagnostic(f, config, key, p, layer, depth) {
  if (depth === null) return diagnosticValue(f, config, key, p, layer);
  if (depth < 0 || depth > f.h[p] + (f.zeta?.[p] ?? 0)) return NaN;
  if (depth >= layerDepth(f, p, 0)) return diagnosticValue(f, config, key, p, 0);
  for (let k = 1; k < f.nz; k++) {
    const top = layerDepth(f, p, k), bottom = layerDepth(f, p, k - 1);
    if (depth >= top) {
      const t = (depth - top) / (bottom - top);
      return diagnosticValue(f, config, key, p, k) * (1 - t) + diagnosticValue(f, config, key, p, k - 1) * t;
    }
  }
  return diagnosticValue(f, config, key, p, f.nz - 1);
}
