import { TERRAIN_PRESETS } from './terrain-presets.js';
import { WIND_DATA } from './data/wind-ncep.js';

export const WIND_CLIMATES = { annual: '年平均（1991–2020）', JJA: '夏季：6–8月平均（1991–2020）', DJF: '冬季：12–2月平均（1991–2020）', elnino: 'エルニーニョ・12–2月3事例合成', lanina: 'ラニーニャ・12–2月3事例合成' };
export const OMEGA = 7.292115e-5, EARTH_RADIUS = 6371000;
export function rotationCoefficients(n) {
  if (n.rotationMode !== 'latitude') return { f0: n.coriolisF0, beta: n.coriolisBeta };
  const phi = n.latitude * Math.PI / 180;
  return { f0: 2 * OMEGA * Math.sin(phi), beta: n.rotationPlane === 'f' ? 0 : 2 * OMEGA * Math.cos(phi) / EARTH_RADIUS };
}
export function windStress(u, v) {
  const factor = WIND_DATA.airDensity * WIND_DATA.dragCoefficient * Math.hypot(u, v);
  return { tx: factor * u, ty: factor * v };
}
export function ensureWind(config) {
  if (!config.wind) {
    const n = config.numerics, stress = Math.hypot(n.windX, n.windY);
    config.wind = { pattern: n.windPattern ?? 'uniform', speed: Math.sqrt(stress / (WIND_DATA.airDensity * WIND_DATA.dragCoefficient)), direction: (Math.atan2(n.windX, n.windY) * 180 / Math.PI + 360) % 360, climate: 'annual', reference: 'japan', edits: {} };
    if (n.windPattern === 'gyre') config.wind.legacyStress = { x: n.windX, y: n.windY };
  }
  return config.wind;
}
export function windBounds(config) { return config.grid.geoBounds ?? TERRAIN_PRESETS[config.grid.preset]?.bounds ?? TERRAIN_PRESETS[config.wind?.reference ?? 'japan'].bounds; }
export function sampleWindClimate(id, longitude, latitude) {
  const data = WIND_DATA.products[id], lats = WIND_DATA.latitude, nx = WIND_DATA.longitude.length;
  if (!data) throw new Error('風の気候値が不正です。');
  const lon = ((longitude % 360) + 360) % 360, gx = lon / (360 / nx), i = Math.floor(gx), tx = gx - i;
  const lat = Math.max(lats.at(-1), Math.min(lats[0], latitude));
  let j = 0; while (j < lats.length - 2 && lats[j + 1] > lat) j++;
  const ty = (lats[j] - lat) / (lats[j] - lats[j + 1]);
  return Object.fromEntries(['u', 'v', 'tx', 'ty'].map(key => {
    const a = data[key], p = j * nx + i, q = j * nx + (i + 1) % nx;
    return [key, (a[p] * (1 - tx) + a[q] * tx) * (1 - ty) + (a[p + nx] * (1 - tx) + a[q + nx] * tx) * ty];
  }));
}
export function buildWind(config) {
  const { nx, ny } = config.grid, wind = config.wind, n = config.numerics;
  const out = Object.fromEntries(['u', 'v', 'tx', 'ty'].map(k => [k, new Float64Array(nx * ny)]));
  const bounds = wind?.pattern === 'climatology' ? windBounds(config) : null;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = j * nx + i, y = j / (ny - 1); let value;
    if (!wind || wind.legacyStress) {
      const tx = (wind?.legacyStress?.x ?? n.windX) * ((wind?.pattern ?? n.windPattern) === 'gyre' ? Math.cos(2 * Math.PI * y) : 1), ty = wind?.legacyStress?.y ?? n.windY;
      const stress = Math.hypot(tx, ty), speed = Math.sqrt(stress / (WIND_DATA.airDensity * WIND_DATA.dragCoefficient));
      value = { u: stress ? speed * tx / stress : 0, v: stress ? speed * ty / stress : 0, tx, ty };
    } else if (bounds) value = sampleWindClimate(wind.climate, bounds.west + (bounds.east - bounds.west) * i / (nx - 1), bounds.south + (bounds.north - bounds.south) * y);
    else {
      const angle = wind.direction * Math.PI / 180;
      const u = wind.speed * Math.sin(angle) * (wind.pattern === 'gyre' ? Math.cos(2 * Math.PI * y) : 1), v = wind.speed * Math.cos(angle);
      value = { u, v, ...windStress(u, v) };
    }
    if (wind?.edits?.[p]) { const { u, v } = wind.edits[p]; value = { u, v, ...windStress(u, v) }; }
    for (const key of Object.keys(out)) out[key][p] = value[key];
  }
  return out;
}

// Cell-averaged tanh thermocline: more layers resolve a continuous profile,
// rather than moving an integer number of warm layers by a hard threshold.
export function seasonalProfile(k, nz, mixing, top, bottom) {
  const depth = 0.15 + 0.7 * mixing, width = 0.025 + 0.15 * mixing;
  const a = 1 - (k + 1) / nz, b = 1 - k / nz;
  const logCosh = x => Math.abs(x) + Math.log1p(Math.exp(-2 * Math.abs(x))) - Math.LN2;
  const warm = 0.5 + width * nz / 2 * (logCosh((depth - a) / width) - logCosh((depth - b) / width));
  return bottom + (top - bottom) * ((1 - mixing) * Math.max(0, Math.min(1, warm)) + mixing / 2);
}
