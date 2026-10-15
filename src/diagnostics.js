import { fieldValue } from './view-section.js';
import { layerDepth, sampleDepth } from './result-sampling.js';
import { npzdRates, npzdGrazingPressure } from './ecosystem-panel.js';
import { seawaterDensity } from './seawater-density.js';

export const DIAGNOSTICS = {
  diagDensity: { label: '密度', unit: 'kg/m³', formula: 'ROMS非線形状態方程式：モデルのポテンシャル水温・塩分・層の深さから算出（深さによる圧力近似）' },
  diagPotentialDensity: { label: 'ポテンシャル密度（海面基準）', unit: 'kg/m³', formula: 'ρ(塩分, ポテンシャル水温, 0 dbar)。σ₀ではなく密度そのもの。ROMS非線形状態方程式' },
  diagKv: { label: '鉛直拡散係数', unit: 'm²/s', formula: 'ROMS Akt（水温）：上下の層界面の平均。固定モードでは設定値' },
  diagVorticity: { label: '相対渦度', unit: 's⁻¹', formula: 'dv/dx - du/dy' },
  diagShear: { label: '鉛直せん断', unit: 's⁻¹', formula: 'sqrt((du/dz)^2 + (dv/dz)^2)' },
  diagStrain: { label: '水平変形率', unit: 's⁻¹', formula: 'sqrt((du/dx - dv/dy)^2 + (dv/dx + du/dy)^2)' },
  diagOW: { label: 'OW', unit: 's⁻²', formula: '(du/dx - dv/dy)^2 + (dv/dx + du/dy)^2 - (dv/dx - du/dy)^2' },
  diagDivergence: { label: '水平発散', unit: 's⁻¹', formula: 'du/dx + dv/dy' },
  diagKE: { label: '運動エネルギー KE', unit: 'm²/s²', formula: '(u^2 + v^2)/2（単位質量あたり・瞬間値）' },
  diagProduction: { label: '光合成・栄養塩取り込み（瞬間反応）', unit: 'mmol N/m³/day', rate: 'U', formula: 'Vm_NO3 exp(-K_ext d) N P/max(K_NO3+N, ε)、ε=10⁻¹⁶ mmol N/m³' },
  diagGrazing: { label: '捕食量（瞬間反応）', unit: 'mmol N/m³/day', rate: 'G', formula: 'ZooGR Z P²/max(K_Phy²+P², ε²)、ε=10⁻¹⁶ mmol N/m³' },
  diagGrazingPressure: { label: '捕食圧（Pに対する損失率）', unit: 'day⁻¹', rate: 'pressure', formula: 'ZooGR Z P/max(K_Phy²+P², ε²)、ε=10⁻¹⁶ mmol N/m³（ゼロ除算保護）' },
  diagMortality: { label: '植物枯死（瞬間反応）', unit: 'mmol N/m³/day', rate: 'M', formula: 'PhyMR P' },
  diagRemineralization: { label: '再無機化（瞬間反応）', unit: 'mmol N/m³/day', rate: 'R', formula: 'DetRR D' },
  diagNetGrowth: { label: '植物の正味増減（瞬間反応）', unit: 'mmol N/m³/day', rate: 'P', formula: 'U - G - M（輸送を除く）' }
};
export function diagnosticAvailable(key, config, fields) {
  const d = DIAGNOSTICS[key];
  return !!d && !d.unavailable && (!d.rate || config.ecosystem.enabled && config.ecosystem.model === 'npzd')
    && !(key === 'diagKv' && fields && config.numerics.calculateDiffusion && !fields.verticalDiffusivity);
}

// Horizontal gradients are evaluated at the same geometric height, never across land.
function derivative(f, axis, variable, p, k) {
  const n = axis === 'x' ? f.nx : f.ny, at = axis === 'x' ? p % f.nx : Math.floor(p / f.nx);
  const stride = axis === 'x' ? 1 : f.nx, spacing = axis === 'x' ? f.dx : f.dy;
  const z = (f.zeta?.[p] ?? 0) - layerDepth(f, p, k), center = fieldValue(f, variable, p, k);
  const sample = q => {
    const depth = (f.zeta?.[q] ?? 0) - z;
    if (!f.mask[q] || depth < 0 || depth > f.h[q] + (f.zeta?.[q] ?? 0)) return NaN;
    return sampleDepth(f, variable, q, depth);
  };
  const left = at > 0 ? sample(p - stride) : NaN, right = at < n - 1 ? sample(p + stride) : NaN;
  if (Number.isFinite(left) && Number.isFinite(right)) return (right - left) / (2 * spacing);
  if (Number.isFinite(right)) return (right - center) / spacing;
  if (Number.isFinite(left)) return (center - left) / spacing;
  // No resolved wet neighbour: use the local zero-gradient boundary approximation.
  return Number.isFinite(center) && spacing > 0 ? 0 : NaN;
}

export function diagnosticValue(f, config, key, p, k) {
  if (!f.mask[p] || !diagnosticAvailable(key, config)) return NaN;
  const d = DIAGNOSTICS[key];
  if(key==='diagDensity'||key==='diagPotentialDensity')return seawaterDensity(fieldValue(f,'salt',p,k),fieldValue(f,'temp',p,k),key==='diagDensity'?Math.max(0,layerDepth(f,p,k)-(f.zeta?.[p]??0)):0);
  if (key === 'diagKv') return f.verticalDiffusivity?.[k * f.nx * f.ny + p] ?? (config.numerics.calculateDiffusion ? NaN : config.numerics.verticalDiffusion);
  if (d.rate) {
    const initial = Object.fromEntries(Object.keys(f.biology ?? {}).map(key => [key, fieldValue(f, key, p, k)]));
    const rates = npzdRates({ ...config, ecosystem: { ...config.ecosystem, initial } }, layerDepth(f, p, k) - (f.zeta?.[p] ?? 0));
    return d.rate === 'pressure' ? npzdGrazingPressure(config, initial.npzd_Phyt, initial.npzd_Zoop) : rates[d.rate];
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
