import { boundaryPoints, boundsOf, gridSignature, idealizedTide, interpolateTime } from './ocean-boundary.js';
import { smoothTidalCorners } from './boundary-corners.js';

export const TIDE_EXPERIMENT_MODES = { inherit: '元の潮汐を引き継ぐ', off: '切る', spring: '大潮期（代表波形）', middle: '中潮期（代表波形）', neap: '小潮期（代表波形）' };
export const TIDAL_DAY = 24.8412024 * 3600;
const DAY = 86400;
const quantile = (sorted, q) => sorted[Math.round((sorted.length - 1) * q)];

export function tideContext(config, fields) {
  const ocean = config.ocean;
  const active = ocean?.tideMode === 'auto' && boundsOf(config) && Object.values(config.boundary).some(b => ['open', 'specified', 'radiation'].includes(b.mode));
  if (!active) return { enabled: false, source: '潮汐なし', cells: [], end: Infinity, value: () => 0 };
  const points = boundaryPoints(config, fields).filter(({ cell }) => {
    const x = cell % fields.nx, y = Math.floor(cell / fields.nx);
    return [[x === 0, 'west'], [x === fields.nx - 1, 'east'], [y === 0, 'south'], [y === fields.ny - 1, 'north']].some(([on, side]) => on && !['closed', 'periodic'].includes(config.boundary[side].mode));
  });
  const packet = ocean.tides;
  if (!packet) return { enabled: Boolean(points.length), source: '理想化M2＋S2（ダミー・実地点の予測ではありません）', cells: points.map(p => p.cell), end: (ocean.predictionDays ?? 45) * DAY, value: (_, t) => idealizedTide(t), idealized: true };
  if (packet.gridSignature !== gridSignature(config)) throw new Error('潮汐データと計算格子が一致しません。');
  const offset = (Date.parse(ocean.startUtc) - Date.parse(packet.epoch)) / 1000;
  const map = new Map(packet.points.map(p => [p.cell, p.height]));
  if (points.some(p => !map.has(p.cell))) throw new Error('境界の潮汐データが不足しています。');
  return { enabled: Boolean(points.length), source: packet.source, cells: points.map(p => p.cell), end: packet.times.at(-1) - offset, value: smoothTidalCorners(config.boundary,fields,(cell,t)=>interpolateTime(packet.times,map.get(cell),t+offset)) };
}

export function analyzeBoundaryTides(config, fields, duration) {
  const context = tideContext(config, fields);
  if (!context.enabled) return { ...context, times: [0, duration], mean: [0, 0], windows: [], summary: '潮汐は設定されていません。', representedSeconds: duration };
  const end = Math.min(context.end, Math.max(duration, 30 * DAY));
  if (!(end >= 0)) throw new Error('潮汐の開始日時がデータ期間外です。');
  const interval = Math.max(1800, Math.ceil(end / 20000 / 1800) * 1800), times = [0];
  for (let t = interval; t < end; t += interval) times.push(t);
  if (end > 0) times.push(end);
  const matrix = context.cells.map(cell => Float64Array.from(times, t => context.value(cell, t)));
  const mean = times.map((_, i) => matrix.reduce((sum, values) => sum + values[i], 0) / matrix.length);
  const series = ['west', 'east', 'south', 'north'].flatMap(side => {
    if (['closed', 'periodic'].includes(config.boundary[side].mode)) return [];
    const indices = context.cells.flatMap((cell, index) => {
      const x = cell % fields.nx, y = Math.floor(cell / fields.nx);
      const on = side === 'west' ? x === 0 : side === 'east' ? x === fields.nx - 1 : side === 'south' ? y === 0 : y === fields.ny - 1;
      return on ? [index] : [];
    });
    return indices.length ? [{ side, count: indices.length, values: times.map((_, i) => indices.reduce((sum, index) => sum + matrix[index][i], 0) / indices.length) }] : [];
  });
  const windows = [];
  for (let start = 0; start + TIDAL_DAY <= end; start += DAY) {
    const indices = times.map((t, i) => t >= start && t <= start + TIDAL_DAY ? i : -1).filter(i => i >= 0);
    if (indices.length < 12) continue;
    const ranges = matrix.map(values => { const sample = indices.map(i => values[i]); return Math.max(...sample) - Math.min(...sample); });
    const strength = Math.sqrt(ranges.reduce((sum, range) => sum + range * range, 0) / ranges.length);
    windows.push({ start, end: start + TIDAL_DAY, strength, indices });
  }
  const strengths = windows.map(w => w.strength).sort((a, b) => a - b), enough = end >= 14.8 * DAY && strengths.length >= 14;
  const low = enough ? quantile(strengths, .25) : undefined, high = enough ? quantile(strengths, .75) : undefined;
  const varied = enough && high - low > Math.max(1e-6, high * .03);
  for (const window of windows) window.kind = varied ? window.strength >= high ? 'spring' : window.strength <= low ? 'neap' : 'middle' : 'unknown';
  const within = windows.filter(w => w.start < duration && w.end > 0);
  const kinds = new Set(within.map(w => w.kind));
  const summary = !varied ? '参照期間が短い、または潮差変動が小さいため、大潮・小潮の目安を判定できません。'
    : `計算期間の目安：${kinds.has('spring') ? '大潮相当あり' : '大潮相当なし'}・${kinds.has('neap') ? '小潮相当あり' : '小潮相当なし'}。`;
  return { ...context, times, mean, series, matrix, windows, summary, low, high, varied, representedSeconds: Math.min(duration, context.end), truncated: duration > context.end };
}

export function representativeTide(config, fields, baseTime, mode) {
  const analysis = analyzeBoundaryTides(config, fields, baseTime);
  if (!analysis.enabled) throw new Error('代表潮汐を選ぶには、境界条件で潮汐を有効にしてください。');
  const target = mode === 'spring' ? 'spring' : mode === 'neap' ? 'neap' : 'middle';
  let candidates = analysis.windows.filter(w => w.kind === target && w.end <= baseTime);
  const fromHistory = candidates.length > 0;
  if (!candidates.length) candidates = analysis.windows.filter(w => w.kind === target);
  if (!candidates.length) throw new Error('代表潮汐を作るための期間・潮差変動が不足しています。');
  const coefficients = new Map();
  for (const [cellIndex, cell] of analysis.cells.entries()) {
    const values = analysis.matrix[cellIndex], terms = new Float64Array(8);
    for (const window of candidates) {
      const average = window.indices.reduce((sum, i) => sum + values[i], 0) / window.indices.length;
      for (let harmonic = 1; harmonic <= 4; harmonic++) {
        let cos = 0, sin = 0;
        for (const i of window.indices) { const angle = 2 * Math.PI * harmonic * analysis.times[i] / TIDAL_DAY, value = values[i] - average; cos += value * Math.cos(angle); sin += value * Math.sin(angle); }
        terms[2 * (harmonic - 1)] += 2 * cos / window.indices.length / candidates.length;
        terms[2 * (harmonic - 1) + 1] += 2 * sin / window.indices.length / candidates.length;
      }
    }
    coefficients.set(cell, terms);
  }
  return {
    source: `${analysis.source}／${fromHistory ? '計算済み期間' : '入力潮汐の参照期間（計算済み期間に該当周期なし）'}の代表周期波形`, windows: candidates.length, fromHistory,
    value: (cell, t) => {
      const terms = coefficients.get(cell); if (!terms) return 0;
      let height = 0;
      for (let harmonic = 1; harmonic <= 4; harmonic++) { const angle = 2 * Math.PI * harmonic * t / TIDAL_DAY; height += terms[2 * (harmonic - 1)] * Math.cos(angle) + terms[2 * (harmonic - 1) + 1] * Math.sin(angle); }
      return height;
    }
  };
}
