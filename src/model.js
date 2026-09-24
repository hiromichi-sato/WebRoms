export const SIDES = ['west', 'east', 'south', 'north'];
export const SIDE_LABELS = { west: '西 / 左', east: '東 / 右', south: '南 / 下', north: '北 / 上' };
export const SOURCE = '57aecf589a408b1e5490d2db7f9bd0196062a44e';
export const BIO_TRACERS = [
  { key: 'NO3', label: '硝酸塩', initial: 5, unit: 'mmol N/m³' },
  { key: 'NH4', label: 'アンモニウム', initial: 0.1, unit: 'mmol N/m³' },
  { key: 'phytoplankton', label: '植物プランクトン', initial: 0.1, unit: 'mmol N/m³' },
  { key: 'zooplankton', label: '動物プランクトン', initial: 0.05, unit: 'mmol N/m³' },
  { key: 'LDeN', label: '大型デトリタス', initial: 0.01, unit: 'mmol N/m³' },
  { key: 'SDeN', label: '小型デトリタス', initial: 0.01, unit: 'mmol N/m³' },
  { key: 'chlorophyll', label: 'クロロフィル', initial: 0.05, unit: 'mg Chl/m³' }
];

export function defaults() {
  return {
    schemaVersion: 1, name: '沿岸海域 01',
    ecosystem: { enabled: false, initial: Object.fromEntries(BIO_TRACERS.map(({ key, initial }) => [key, initial])) },
    grid: { nx: 48, ny: 32, nz: 3, dx: 2000, dy: 2000, preset: 'bay', minDepth: 40, maxDepth: 240, edits: {}, geoBounds: null, geoSource: null },
    initial: { distribution: 'stratified', tempSurface: 20, tempBottom: 8, saltSurface: 34, saltBottom: 35, tempGradient: 2, zeta: 0, u: 0, v: 0, anchors: {}, painted: {} },
    boundary: Object.fromEntries(SIDES.map(side => [side, { mode: 'closed', zeta: 0, ubar: 0, vbar: 0,
      layers: Array.from({ length: 3 }, (_, k) => ({ temp: 10 + k * 4, salt: 35 - (k + 0.5) / 3, u: 0, v: 0, ...Object.fromEntries(BIO_TRACERS.map(({ key, initial }) => [key, initial])) })), anchors: {}, painted: {} }])),
    numerics: { dt: 10, maxSteps: 12000, tolerance: 1e-5, steadyWindow: 100, horizontalDiffusion: 10, verticalDiffusion: 0.0001, windX: 0, windY: 0, coriolisF0: 1e-4, coriolisBeta: 2e-11 }
  };
}

// UI layer labels are surface-first; stored fields follow ROMS bottom-first k.
export function resizeLayers(config, nz) {
  for (const side of SIDES) {
    const boundary = config.boundary[side], old = boundary.layers;
    boundary.layers = Array.from({ length: nz }, (_, k) => ({ ...Object.fromEntries(BIO_TRACERS.map(({ key, initial }) => [key, initial])), ...old[Math.min(old.length - 1, Math.floor((k + 0.5) * old.length / nz))] }));
    boundary.anchors ??= {}; boundary.painted ??= {};
    for (const key of Object.keys(boundary.anchors)) boundary.anchors[key] = resizeProfile(boundary.anchors[key], old.length, nz);
    for (const key of Object.keys(boundary.painted)) boundary.painted[key] = resizeProfile(boundary.painted[key], old.length, nz);
  }
  config.initial.anchors ??= {}; config.initial.painted ??= {};
  for (const key of Object.keys(config.initial.anchors)) config.initial.anchors[key] = resizeProfile(config.initial.anchors[key], config.grid.nz, nz);
  for (const key of Object.keys(config.initial.painted)) config.initial.painted[key] = resizeProfile(config.initial.painted[key], config.grid.nz, nz);
  config.grid.nz = nz;
}

function resizeProfile(profile, oldNz, nz) {
  return Array.from({ length: nz }, (_, k) => profile[Math.min(oldNz - 1, Math.floor((k + 0.5) * oldNz / nz))] ?? {});
}

export function interpolateAnchors(anchors, nz, fallback) {
  const points = Object.entries(anchors ?? {}).map(([k, value]) => [+k, value]).filter(([k, value]) => Number.isInteger(k) && k >= 0 && k < nz && Number.isFinite(value));
  for (let k = 0; k < nz; k++) if (points.every(([point]) => point !== k)) points.push([k, fallback(k)]);
  points.sort((a, b) => a[0] - b[0]);
  return Array.from({ length: nz }, (_, k) => {
    let lo = points[0], hi = points[points.length - 1];
    for (let i = 0; i < points.length - 1; i++) if (k >= points[i][0] && k <= points[i + 1][0]) { lo = points[i]; hi = points[i + 1]; break; }
    const t = hi[0] === lo[0] ? 0 : (k - lo[0]) / (hi[0] - lo[0]);
    return lo[1] + t * (hi[1] - lo[1]);
  });
}

export function validate(config) {
  const errors = [];
  const number = (value, low, high, label, integer = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high || (integer && !Number.isInteger(value))) errors.push(`${label}: ${low}〜${high}${integer ? 'の整数' : ''}を指定してください。`);
  };
  if (!config || config.schemaVersion !== 1) return ['対応していない設定形式です（schemaVersion: 1）。'];
  if (typeof config.name !== 'string' || !config.name.trim() || config.name.length > 80) errors.push('プロジェクト名は1〜80文字で指定してください。');
  const g = config.grid ?? {}, a = config.initial ?? {}, n = config.numerics ?? {};
  if (!config.ecosystem || typeof config.ecosystem.enabled !== 'boolean') errors.push('生態系モデルの設定が不正です。');
  number(g.nx, 8, 100, 'X格子数', true); number(g.ny, 8, 100, 'Y格子数', true); number(g.nz, 2, 10, '層数', true);
  number(g.dx, 10, 100000, 'X格子間隔'); number(g.dy, 10, 100000, 'Y格子間隔');
  number(g.minDepth, 1, 10000, '最小水深'); number(g.maxDepth, 1, 10000, '最大水深');
  if (g.minDepth > g.maxDepth) errors.push('最大水深は最小水深以上にしてください。');
  if (!['bay', 'island', 'channel', 'open'].includes(g.preset)) errors.push('地形の種類が不正です。');
  if (g.geoBounds !== null && g.geoBounds !== undefined) {
    if (!g.geoBounds || typeof g.geoBounds !== 'object') errors.push('地図範囲の設定が不正です。');
    else { number(g.geoBounds.west, -180, 180, '西端経度'); number(g.geoBounds.east, -180, 180, '東端経度'); number(g.geoBounds.south, -90, 90, '南端緯度'); number(g.geoBounds.north, -90, 90, '北端緯度'); if (g.geoBounds.west >= g.geoBounds.east || g.geoBounds.south >= g.geoBounds.north) errors.push('地図範囲の東西・南北を正しく指定してください。'); }
  }
  if (!g.edits || typeof g.edits !== 'object' || Array.isArray(g.edits)) errors.push('地形編集データが不正です。');
  else for (const [key, depth] of Object.entries(g.edits)) {
    if (!/^\d+$/.test(key) || +key >= g.nx * g.ny) errors.push('地形編集の格子番号が不正です。');
    number(depth, 0, 10000, '編集水深');
  }
  if (!['uniform', 'stratified', 'gradient'].includes(a.distribution)) errors.push('初期分布が不正です。');
  for (const key of ['tempSurface', 'tempBottom']) number(a[key], -5, 45, key);
  for (const key of ['saltSurface', 'saltBottom']) number(a[key], 0, 50, key);
  number(a.tempGradient, -20, 20, '水温差'); number(a.zeta, -20, 20, '初期水位');
  number(a.u, -10, 10, '初期U'); number(a.v, -10, 10, '初期V');
  for (const [field, profile] of Object.entries(a.anchors ?? {})) for (const [k, value] of Object.entries(profile ?? {})) {
    if (!/^\d+$/.test(k) || +k >= g.nz) errors.push('初期プロファイルの層番号が不正です。');
    number(value, field === 'salt' ? 0 : field === 'temp' ? -5 : -10000, field === 'salt' ? 50 : field === 'temp' ? 45 : 10000, `初期${field}`);
  }
  if (config.ecosystem?.enabled) for (const tracer of BIO_TRACERS) number(config.ecosystem?.initial?.[tracer.key], 0, 10000, `初期${tracer.label}`);
  for (const side of SIDES) {
    const b = config.boundary?.[side];
    if (!b || !['closed', 'specified', 'radiation', 'periodic'].includes(b.mode)) { errors.push(`${SIDE_LABELS[side]}の境界が不正です。`); continue; }
    number(b.zeta, -20, 20, '境界水位'); number(b.ubar, -10, 10, 'Ubar'); number(b.vbar, -10, 10, 'Vbar');
    if (!Array.isArray(b.layers) || b.layers.length !== g.nz) { errors.push(`${SIDE_LABELS[side]}の層数が一致しません。`); continue; }
    for (const layer of b.layers) {
      number(layer?.temp, -5, 45, '境界水温'); number(layer?.salt, 0, 50, '境界塩分');
      number(layer?.u, -10, 10, '境界U'); number(layer?.v, -10, 10, '境界V');
      if (config.ecosystem?.enabled) for (const tracer of BIO_TRACERS) number(layer?.[tracer.key], 0, 10000, `境界${tracer.label}`);
    }
    for (const [field, profile] of Object.entries(b.anchors ?? {})) for (const [k, value] of Object.entries(profile ?? {})) {
      if (!/^\d+$/.test(k) || +k >= g.nz) errors.push('境界プロファイルの層番号が不正です。');
      number(value, field === 'salt' ? 0 : field === 'temp' ? -5 : -10000, field === 'salt' ? 50 : field === 'temp' ? 45 : 10000, `境界${field}`);
    }
  }
  for (const [a, b] of [['west', 'east'], ['south', 'north']]) if ((config.boundary?.[a]?.mode === 'periodic') !== (config.boundary?.[b]?.mode === 'periodic')) errors.push(`${SIDE_LABELS[a]}と${SIDE_LABELS[b]}は対で周期境界にしてください。`);
  number(n.dt, 0.01, 600, '時間刻み'); number(n.maxSteps, 1, 1000000, 'ステップ上限', true);
  number(n.tolerance, 1e-12, 0.1, '定常判定の許容値'); number(n.steadyWindow, 2, 10000, '判定区間', true);
  if (n.steadyWindow > n.maxSteps) errors.push('判定区間はステップ上限以下にしてください。');
  number(n.horizontalDiffusion, 0, 10000, '水平拡散係数'); number(n.verticalDiffusion, 0, 1, '鉛直拡散係数');
  number(n.windX, -10, 10, '東西風応力'); number(n.windY, -10, 10, '南北風応力');
  number(n.coriolisF0, -0.001, 0.001, 'コリオリ係数 f₀'); number(n.coriolisBeta, -1e-9, 1e-9, 'β係数');
  return [...new Set(errors)];
}

export function buildFields(config) {
  const errors = validate(config);
  if (errors.length) throw new Error(errors.join('\n'));
  const { nx, ny, nz, dx, dy, minDepth, maxDepth, preset, edits } = config.grid;
  const size = nx * ny;
  const mask = new Uint8Array(size), h = new Float64Array(size);
  const temp = new Float64Array(size * nz), salt = new Float64Array(size * nz), zeta = new Float64Array(size);
  const biology = Object.fromEntries(BIO_TRACERS.map(({ key }) => [key, new Float64Array(size * nz)]));
  const maskU = new Uint8Array((nx - 1) * ny), maskV = new Uint8Array(nx * (ny - 1)), maskPsi = new Uint8Array((nx - 1) * (ny - 1));
  let wetCount = 0, rFactor = 0;
  const initialProfiles = {};
  const keys = ['temp', 'salt', ...BIO_TRACERS.map(({ key }) => key)];
  for (const key of keys) {
    const fallback = k => {
      const s = (k + 0.5) / nz, a = config.initial;
      if (key === 'temp') return a.distribution === 'uniform' ? a.tempSurface : a.tempBottom + (a.tempSurface - a.tempBottom) * s;
      if (key === 'salt') return a.distribution === 'uniform' ? a.saltSurface : a.saltBottom + (a.saltSurface - a.saltBottom) * s;
      return config.ecosystem.initial[key];
    };
    const anchors = { ...(key === 'temp' ? { [nz - 1]: config.initial.tempSurface, 0: config.initial.distribution === 'uniform' ? config.initial.tempSurface : config.initial.tempBottom } : {}), ...(key === 'salt' ? { [nz - 1]: config.initial.saltSurface, 0: config.initial.distribution === 'uniform' ? config.initial.saltSurface : config.initial.saltBottom } : {}), ...(config.initial.anchors?.[key] ?? {}) };
    initialProfiles[key] = interpolateAnchors(anchors, nz, fallback);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = i / (nx - 1), y = j / (ny - 1), p = j * nx + i;
    let wet = true;
    if (preset === 'bay') wet = x > 0.08 + 0.16 * Math.sin(Math.PI * y) && !(x > 0.78 && y > 0.78);
    if (preset === 'island') wet = (x - 0.52) ** 2 / 0.02 + (y - 0.5) ** 2 / 0.045 > 1;
    if (preset === 'channel') wet = y > 0.2 + 0.08 * Math.sin(x * 6) && y < 0.8 + 0.06 * Math.sin(x * 6);
    const depth = Object.hasOwn(edits, p) ? edits[p] : wet ? minDepth + (maxDepth - minDepth) * (0.15 + 0.7 * x + 0.15 * Math.sin(Math.PI * y)) : 0;
    mask[p] = depth > 0 ? 1 : 0;
    // Positive dry-cell h avoids undefined terrain-following coordinates; mask defines land.
    h[p] = depth || minDepth;
    if (!mask[p]) continue;
    wetCount++;
    const a = config.initial;
    zeta[p] = a.painted?.zeta?.[0]?.[p] ?? a.zeta;
    if (h[p] + zeta[p] <= 0) throw new Error('初期海面高度が海底以下になる水域セルがあります。');
    for (let k = 0; k < nz; k++) {
      const idx = k * size + p;
      temp[idx] = a.painted?.temp?.[k]?.[p] ?? initialProfiles.temp[k] + (a.distribution === 'gradient' ? a.tempGradient * (x - 0.5) : 0);
      salt[idx] = a.painted?.salt?.[k]?.[p] ?? initialProfiles.salt[k];
      if (config.ecosystem.enabled) for (const { key } of BIO_TRACERS) biology[key][idx] = a.painted?.[key]?.[k]?.[p] ?? initialProfiles[key][k];
    }
  }
  if (!wetCount) throw new Error('水域セルがありません。');
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = j * nx + i;
    if (i < nx - 1) maskU[j * (nx - 1) + i] = mask[p] * mask[p + 1];
    if (j < ny - 1) maskV[j * nx + i] = mask[p] * mask[p + nx];
    if (i < nx - 1 && j < ny - 1) maskPsi[j * (nx - 1) + i] = mask[p] * mask[p + 1] * mask[p + nx] * mask[p + nx + 1];
    for (const q of [i < nx - 1 ? p + 1 : -1, j < ny - 1 ? p + nx : -1]) if (q >= 0 && mask[p] && mask[q]) rFactor = Math.max(rFactor, Math.abs(h[p] - h[q]) / (h[p] + h[q]));
  }
  const velocityProfiles = Object.fromEntries(['u', 'v'].map(axis => {
    const base = config.initial[axis];
    const profile = interpolateAnchors(config.initial.anchors?.[axis], nz, () => base);
    return [axis, profile];
  }));
  const initialVelocity = (faceMask, value, axis) => Float64Array.from({ length: faceMask.length * nz }, (_, index) => {
    const k = Math.floor(index / faceMask.length), p = index % faceMask.length, j = axis === 'u' ? Math.floor(p / (nx - 1)) : Math.floor(p / nx), i = axis === 'u' ? p % (nx - 1) : p % nx;
    const a = axis === 'u' ? j * nx + i : j * nx + i, b = axis === 'u' ? a + 1 : a + nx;
    const painted = config.initial.painted?.[axis]?.[k], va = painted?.[a], vb = painted?.[b];
    return faceMask[p] * (Number.isFinite(va) && Number.isFinite(vb) ? (va + vb) / 2 : Number.isFinite(va) ? va : Number.isFinite(vb) ? vb : velocityProfiles[axis][k] ?? value);
  });
  const u = initialVelocity(maskU, config.initial.u, 'u'), v = initialVelocity(maskV, config.initial.v, 'v');
  const averageLayers = (values, faceMask) => Float64Array.from(faceMask, (wet, p) => wet ? Array.from({ length: nz }, (_, k) => values[k * faceMask.length + p]).reduce((a, b) => a + b, 0) / nz : 0);
  return { nx, ny, nz, dx, dy, mask, maskU, maskV, maskPsi, h, temp, salt, zeta,
    u, v, ubar: averageLayers(u, maskU), vbar: averageLayers(v, maskV), biology, wetCount, rFactor };
}

export function inspect(config, fields) {
  const warnings = [];
  if (fields.rFactor > 0.2) warnings.push(`隣接水深の比 r = ${fields.rFactor.toFixed(3)}。急な地形を確認してください。`);
  const g = config.grid;
  for (const [a, b, length, indexA, indexB] of [
    ['west', 'east', g.ny, j => j * g.nx, j => j * g.nx + g.nx - 1],
    ['south', 'north', g.nx, i => i, i => (g.ny - 1) * g.nx + i]
  ]) {
    if (config.boundary[a].mode === 'periodic') for (let i = 0; i < length; i++) {
      if (fields.mask[indexA(i)] !== fields.mask[indexB(i)] || Math.abs(fields.h[indexA(i)] - fields.h[indexB(i)]) > 1e-6) { warnings.push(`${SIDE_LABELS[a]}・${SIDE_LABELS[b]}の周期端で地形が一致していません。`); break; }
    }
  }
  for (const side of SIDES) {
    const b = config.boundary[side];
    if (b.mode === 'specified') for (const field of ['u', 'v']) {
      const average = b.layers.reduce((sum, layer) => sum + layer[field], 0) / g.nz;
      if (Math.abs(average - b[`${field}bar`]) > 1e-6) warnings.push(`${SIDE_LABELS[side]}: ${field.toUpperCase()}barと層流速の平均が一致していません。`);
    }
  }
  return warnings;
}

export function preparedData(config, fields) {
  return { format: 'webroms-preparation', version: 1, executableRomsInput: false,
    description: 'Preparation arrays, not NetCDF or a ROMS executable input. No halo cells; k increases from bottom to surface. Uniform sigma for preview only.',
    sourceReference: SOURCE, config, dimensions: { rho: [fields.ny, fields.nx], u: [fields.ny, fields.nx - 1], v: [fields.ny - 1, fields.nx], psi: [fields.ny - 1, fields.nx - 1] },
    arrays: Object.fromEntries(['h', 'mask', 'maskU', 'maskV', 'maskPsi', 'temp', 'salt', 'zeta', 'u', 'v', 'ubar', 'vbar'].map(key => [key, Array.from(fields[key])])),
    ecosystem: config.ecosystem.enabled ? Object.fromEntries(BIO_TRACERS.map(({ key }) => [key, Array.from(fields.biology[key])])) : null };
}
