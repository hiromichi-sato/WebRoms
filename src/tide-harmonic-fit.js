import { TIDE_SPEEDS } from './japan-tides.js';
import { coversCorrectionMonth } from './tide-spreadsheet.js';
import { ASTRONOMICAL_TIDE_MODEL, astronomicalBasis } from './tide-astronomy.js';

// Fit a datum offset and trend separately so neither is applied as tidal forcing.
export function fitTideHarmonics(samples, epoch, speeds = TIDE_SPEEDS, astronomy) {
  const origin = Date.parse(epoch), entries = Object.entries(speeds);
  if (!Number.isFinite(origin) || !coversCorrectionMonth(samples) || samples.length < 48) throw new Error('実測値は約1か月分、48時刻以上を用意してください。');
  if (samples.some((s, i) => !Number.isFinite(s.cm) || !Number.isFinite(s.utc) || i && s.utc <= samples[i - 1].utc)) throw new Error('実測日時・潮位を確認してください。');
  const duration = (samples.at(-1).utc - samples[0].utc) / 3600000;
  for (let i = 0; i < entries.length; i++) for (let j = 0; j < i; j++) if (Math.abs(entries[i][1] - entries[j][1]) * duration < 360) throw new Error('分潮を分離するには観測期間が不足しています。');
  const t = samples.map(s => (s.utc - origin) / 3600000), center = (t[0] + t.at(-1)) / 2;
  const columns = [t.map(() => 1), t.map(h => (h - center) / duration)];
  for (const [name, speed] of entries) for (const trig of [Math.cos, Math.sin]) columns.push(t.map((h, i) => {
    const basis = astronomy === ASTRONOMICAL_TIDE_MODEL ? astronomicalBasis(name, samples[i].utc, 0, speed) : null;
    return (basis?.factor ?? 1) * trig(((basis?.phaseDegrees ?? speed * h) % 360) * Math.PI / 180);
  }));
  const q = [], r = columns.map(() => Array(columns.length).fill(0)), dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  for (let j = 0; j < columns.length; j++) {
    const v = [...columns[j]];
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < j; i++) { const projection = dot(q[i], v); r[i][j] += projection; for (let k = 0; k < v.length; k++) v[k] -= projection * q[i][k]; }
    r[j][j] = Math.sqrt(dot(v, v));
    if (r[j][j] < Math.sqrt(samples.length) * 1e-6) throw new Error('観測間隔では位相を識別できません。1時間程度の間隔で用意してください。');
    q.push(v.map(value => value / r[j][j]));
  }
  const values = samples.map(s => s.cm), coefficients = q.map(col => dot(col, values));
  for (let j = coefficients.length - 1; j >= 0; j--) { for (let k = j + 1; k < coefficients.length; k++) coefficients[j] -= r[j][k] * coefficients[k]; coefficients[j] /= r[j][j]; }
  const harmonics = Object.fromEntries(entries.map(([name, speed], i) => {
    const a = coefficients[2 + i * 2], b = coefficients[3 + i * 2];
    return [name, { amplitudeCm: Math.hypot(a, b), lagDegrees: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360, speedDegreesHour: speed }];
  }));
  if (Object.values(harmonics).some(h => h.amplitudeCm > 2000)) throw new Error('推定振幅が過大です。単位と観測値を確認してください。');
  const rmseCm = Math.sqrt(values.reduce((sum, value, i) => sum + (value - columns.reduce((prediction, col, j) => prediction + col[i] * coefficients[j], 0)) ** 2, 0) / values.length);
  return { harmonics, ...(astronomy ? { astronomy, lagReference: 'Greenwich' } : {}), rmseCm, meanCm: coefficients[0], trendCmPerDay: coefficients[1] / duration * 24, epoch, samples: samples.length, startUtc: new Date(samples[0].utc).toISOString(), endUtc: new Date(samples.at(-1).utc).toISOString() };
}
