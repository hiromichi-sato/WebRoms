import { TERRAIN_PRESETS } from './terrain-presets.js';

export const FES_DOI = 'https://doi.org/10.24400/527896/A01-2024.004';
export const boundsOf = config => config.grid.geoBounds ?? TERRAIN_PRESETS[config.grid.preset]?.bounds ?? null;
export function ensureOcean(config) {
  config.ocean ??= {};
  for (const [key, value] of Object.entries({ tideMode: boundsOf(config) ? 'auto' : 'off', seaLevelEnabled: false, velocityMode: 'auto', startUtc: '2026-01-01T00:00:00Z', predictionDays: 45, correctionLimitCm: 200, corrections: [] })) config.ocean[key] ??= value;
  return config.ocean;
}
export function gridSignature(config) {
  const { nx, ny } = config.grid;
  return JSON.stringify({ nx, ny, bounds: boundsOf(config) });
}
export function boundaryPoints(config, fields) {
  const b = boundsOf(config), { nx, ny } = config.grid;
  if (!b) throw new Error('地形に緯度経度が必要です。');
  const points = [];
  for (let p = 0; p < nx * ny; p++) {
    const i = p % nx, j = Math.floor(p / nx);
    if (fields.mask[p] && (i === 0 || j === 0 || i === nx - 1 || j === ny - 1)) points.push({ cell: p, lon: b.west + i / (nx - 1) * (b.east - b.west), lat: b.south + j / (ny - 1) * (b.north - b.south) });
  }
  return points;
}
export function tideRequest(config, fields) {
  const o = ensureOcean(config);
  if (!validUtc(o.startUtc)) throw new Error('開始日時はUTCで指定してください。');
  if (!Number.isInteger(o.predictionDays) || o.predictionDays < 1 || o.predictionDays > 366) throw new Error('予測期間は1〜366日です。');
  const points = boundaryPoints(config, fields);
  if (!points.length) throw new Error('海上の境界点がありません。');
  return { format: 'webroms-tide-request-v1', gridSignature: gridSignature(config), startUtc: o.startUtc, days: o.predictionDays, intervalSeconds: 1800, points };
}
const validUtc = value => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value));
export function validateTidePackage(data, config, fields) {
  if (data?.format !== 'webroms-tides-v1' || data.unit !== 'm' || data.kind !== 'ocean-tide' || typeof data.source !== 'string' || !validUtc(data.epoch)) throw new Error('潮汐ファイルがありません、または形式・単位・UTC・出典が不正です。');
  if (data.gridSignature !== gridSignature(config)) throw new Error('潮汐データと地形の格子・緯度経度が一致しません。再生成してください。');
  if (!Array.isArray(data.times) || data.times.length < 2 || data.times.length > 20000 || data.times.some((t, i) => !Number.isFinite(t) || (i && (t <= data.times[i - 1] || t - data.times[i - 1] > 3600)))) throw new Error('潮汐時刻は昇順、間隔1時間以内、最大2万時刻です。');
  if (!Array.isArray(data.points)) throw new Error('潮汐の地点情報がありません。');
  const expected = boundaryPoints(config, fields), seen = new Set();
  for (const point of data.points) {
    const target = expected.find(p => p.cell === point.cell);
    if (!target || seen.has(point.cell) || !Number.isFinite(point.lon) || !Number.isFinite(point.lat) || Math.abs(target.lon - point.lon) > 1e-6 || Math.abs(target.lat - point.lat) > 1e-6) throw new Error('潮汐地点が重複、範囲外、または座標不一致です。');
    seen.add(point.cell);
    if (!Array.isArray(point.height) || point.height.length !== data.times.length || point.height.some(v => !Number.isFinite(v) || Math.abs(v) > 20)) throw new Error('潮汐データに欠測・不正な潮位があります。沿岸の外挿は行いません。');
  }
  if (expected.some(p => !seen.has(p.cell))) throw new Error('海上の境界点をすべて含む潮汐データが必要です。');
  return data;
}
export function interpolateTime(times, values, time) {
  if (time < times[0] - 1e-7 || time > times.at(-1) + 1e-7) throw new Error('指定期間が時系列の範囲外です。保存用追加RUNの期間までデータを用意してください。');
  let lo = 0, hi = times.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (times[mid] <= time) lo = mid; else hi = mid; }
  const t = (time - times[lo]) / (times[hi] - times[lo]);
  return values[lo] * (1 - t) + values[hi] * t;
}
export function tideStatus(config) {
  const o = config.ocean;
  if (o?.tideMode === 'off') return '潮汐なし';
  if (!boundsOf(config)) return '位置未指定：一様基準・潮汐なし';
  if (!o?.tides) return '理想化潮汐（ダミー）：M2 30 cm＋S2 15 cm。実地点の予測ではありません。';
  return o.tides.gridSignature === gridSignature(config) ? `潮汐：${o.tides.source}` : '地形変更：潮汐の再生成が必要';
}
export function tideSource(config) {
  if (!config.ocean || config.ocean.tideMode === 'off' || !boundsOf(config) || !Object.values(config.boundary).some(b => ['open', 'specified', 'radiation'].includes(b.mode))) return 'none';
  return config.ocean.tides?.source ?? 'IDEALIZED M2+S2; arbitrary amplitudes and phases; not a local prediction';
}
export function forcingEnd(config) {
  const o = config.ocean;
  if (!Object.values(config.boundary).some(b => ['specified', 'open', 'radiation'].includes(b.mode))) return Infinity;
  let end = Infinity;
  if (o?.tideMode !== 'off' && boundsOf(config) && o) end = o.tides ? (Date.parse(o.tides.epoch) - Date.parse(o.startUtc)) / 1000 + o.tides.times.at(-1) : (o.predictionDays ?? 45) * 86400;
  for (const c of activeCorrections(config)) end = Math.min(end, (Date.parse(c.samples.at(-1)?.utc) - Date.parse(o.startUtc)) / 1000);
  return end;
}
const activeCorrections = config => config.ocean?.tideMode === 'off' && config.ocean?.seaLevelEnabled === false ? [] : config.ocean?.corrections ?? [];
export const idealizedTide = seconds => .30 * Math.sin(2 * Math.PI * seconds / (12.4206012 * 3600)) + .15 * Math.sin(2 * Math.PI * seconds / (12 * 3600));
// Correction distances follow connected wet cells, not straight lines across land.
function waterDistances(fields, origin) {
  const { nx, ny, dx, dy, mask } = fields, distances = new Float64Array(nx * ny).fill(Infinity);
  distances[origin] = 0;
  const queue = [origin]; let head = 0;
  while (head < queue.length) {
    const p = queue[head++], i = p % nx, j = Math.floor(p / nx);
    for (const [q, distance] of [[i > 0 ? p - 1 : -1, dx], [i < nx - 1 ? p + 1 : -1, dx], [j > 0 ? p - nx : -1, dy], [j < ny - 1 ? p + nx : -1, dy]]) {
      if (q >= 0 && mask[q] && distances[p] + distance < distances[q]) { distances[q] = distances[p] + distance; queue.push(q); }
    }
  }
  return distances;
}
export function parseCorrection(text, options) {
  const samples = text.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [utc, value, extra] = line.trim().split(',');
    if (extra !== undefined || !validUtc(utc) || !value?.trim() || !Number.isFinite(Number(value))) throw new Error('各行は UTC日時,潮位cm で指定してください。');
    return { utc, cm: Number(value) };
  });
  if (samples.length < 2 || samples.length > 9000) throw new Error('補正は2〜9000時刻必要です。');
  for (let i = 1; i < samples.length; i++) {
    const hours = (Date.parse(samples[i].utc) - Date.parse(samples[i - 1].utc)) / 3600000;
    if (hours < 1 || hours > 6) throw new Error('補正時刻は昇順、1〜6時間間隔にしてください。');
  }
  return { ...options, samples };
}
export function prepareForcing(config, fields, requiredEnd = config.numerics.maxSteps * config.numerics.dt) {
  const o = config.ocean;
  if (!o) return null; // Preserve static forcing in existing saved projects.
  if (o.seaLevelEnabled && o.seaLevel?.bundled && o.seaLevel.gridSignature !== JSON.stringify([gridSignature(config), config.grid.edits ?? {}])) throw new Error('地形が変わりました。境界条件で同梱MDTを再適用してください。');
  if (!Object.values(config.boundary).some(b => ['specified', 'open', 'radiation'].includes(b.mode)) && !o.corrections?.length) return null;
  if (!['auto', 'off'].includes(o.tideMode)) throw new Error('潮汐の設定が不正です。');
  const tide = o.tideMode !== 'off' && boundsOf(config);
  if (tide && !o.tides && (!Number.isInteger(o.predictionDays) || o.predictionDays < 1 || o.predictionDays > 366)) throw new Error('予測期間は1〜366日です。');
  if (!validUtc(o.startUtc)) throw new Error('計算開始日時をUTCで指定してください。');
  const start = Date.parse(o.startUtc) / 1000;
  if (tide && o.tides) {
    validateTidePackage(o.tides, config, fields);
    const first = Date.parse(o.tides.epoch) / 1000 + o.tides.times[0];
    if (start < first || requiredEnd > forcingEnd(config)) throw new Error('潮汐期間が不足しています。開始日時と追加RUN期間を含めて再生成してください。');
  }
  if (requiredEnd > forcingEnd(config)) throw new Error('境界強制の期間が不足しています。予測期間・補正期間を延ばしてください。');
  const points = tide && o.tides ? new Map(o.tides.points.map(p => [p.cell, p.height])) : new Map();
  const offset = tide && o.tides ? start - Date.parse(o.tides.epoch) / 1000 : 0;
  const tideAt = (p, t) => tide && !o.tides ? idealizedTide(t) : points.has(p) ? interpolateTime(o.tides.times, points.get(p), t + offset) : 0;
  const corrections = activeCorrections(config).map(c => {
    if (!Number.isInteger(c.cell) || !fields.mask[c.cell] || !boundaryPoints(config, fields).some(p => p.cell === c.cell)) throw new Error('補正地点は海上の境界セルを指定してください。湾内観測点を境界へ直接適用できません。');
    if (!['residual', 'absolute'].includes(c.kind) || !Number.isFinite(c.datumOffsetCm) || !Number.isFinite(c.radiusKm) || c.radiusKm <= 0 || c.radiusKm > 500 || !Array.isArray(c.samples)) throw new Error('補正の種類・基準面補正・影響距離が不正です。');
    const parsed = parseCorrection(c.samples.map(s => `${s.utc},${s.cm}`).join('\n'), c);
    const times = parsed.samples.map(s => Date.parse(s.utc) / 1000 - start);
    const i = c.cell % fields.nx, j = Math.floor(c.cell / fields.nx);
    const sides = [[i === 0, 'west', j], [i === fields.nx - 1, 'east', j], [j === 0, 'south', i], [j === fields.ny - 1, 'north', i]].filter(([on, side]) => on && !['closed', 'periodic'].includes(config.boundary[side].mode));
    if (!sides.length) throw new Error('補正地点は開いている境界の海セルを指定してください。');
    const baselines = sides.map(([, side, q]) => { const b = config.boundary[side]; return o.seaLevelEnabled === false ? 0 : b.fromInitial ? fields.zeta[c.cell] : b.painted?.zeta?.[0]?.[q] ?? b.zeta; });
    if (c.kind === 'absolute' && baselines.some(v => Math.abs(v - baselines[0]) > 1e-8)) throw new Error('角の2辺で海面高度の基準値が異なります。整合させてから絶対潮位を指定してください。');
    const values = parsed.samples.map((s, index) => s.cm / 100 + (c.kind === 'absolute' ? c.datumOffsetCm / 100 - baselines[0] - tideAt(c.cell, times[index]) : 0));
    if (!Number.isFinite(o.correctionLimitCm) || o.correctionLimitCm <= 0 || o.correctionLimitCm > 1000 || values.some(v => Math.abs(v * 100) > o.correctionLimitCm)) throw new Error(`潮位補正が許容幅 ±${o.correctionLimitCm} cm を超えています。単位・基準面・入力値を確認してください。`);
    if (times[0] > 0 || times.at(-1) < requiredEnd) throw new Error('補正の時系列が計算期間を覆っていません。');
    return { times, values, distances: waterDistances(fields, c.cell), radius: c.radiusKm * 1000 };
  });
  if (!tide && !corrections.length) return null;
  const duration = forcingEnd(config), times = [0];
  for (let t = 1800; t < duration; t += 1800) { times.push(t); if (times.length > 20000) throw new Error('境界時系列が長すぎます。'); }
  if (duration > 0) times.push(duration);
  const value = (p, t) => {
    let residual = 0, weights = 0;
    for (const c of corrections) {
      const d = c.distances[p] / c.radius, w = d < 1 ? (1 - d) ** 2 : 0;
      if (w) { residual += w * interpolateTime(c.times, c.values, t); weights += w; }
    }
    return tideAt(p, t) + residual / Math.max(1, weights);
  };
  return { times, value, end: duration, source: tide ? o.tides?.source ?? 'IDEALIZED M2+S2; arbitrary amplitudes and phases; not a local prediction' : 'User boundary correction' };
}
