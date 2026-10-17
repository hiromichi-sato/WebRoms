// PARI Technical Note 1168, Appendix C (2007), equations C.2-C.14.
// Arguments use UTC; local phase lags require the east longitude term n*lon.
const rad = Math.PI / 180;
export const ASTRONOMICAL_TIDE_MODEL = 'jma-local-pari-2007-v1';
const constituents = {
  M2: [-2, 2, 0, 0, 2, 'M2', 1, 28.9841042],
  S2: [0, 0, 0, 0, 2, null, 1, 30],
  K1: [0, 1, 0, 90, 1, 'K1', 1, 15.0410686],
  O1: [-2, 1, 0, 270, 1, 'O1', 1, 13.9430356],
  N2: [-3, 2, 1, 0, 2, 'M2', 1, 28.4397295],
  Q1: [-3, 1, 1, 270, 1, 'O1', 1, 13.3986609],
  P1: [0, -1, 0, 270, 1, null, 1, 14.9589314],
  K2: [0, 2, 0, 0, 2, 'K2', 1, 30.0821373],
  M4: [-4, 4, 0, 0, 4, 'M2', 2, 57.9682084],
  MS4: [-2, 2, 0, 0, 4, 'M2', 1, 58.9841042],
  S4: [0, 0, 0, 0, 4, null, 1, 60],
  M6: [-6, 6, 0, 0, 6, 'M2', 3, 86.9523127],
};
const nodal = {
  M2: [[1.0004, -.0373, .0002, 0], [-2.14, 0, 0]],
  O1: [[1.0089, .1871, -.0147, .0014], [10.80, -1.34, .19]],
  K1: [[1.0060, .1150, -.0088, .0006], [-8.86, .68, -.07]],
  K2: [[1.0241, .2863, .0083, -.0015], [-17.74, .68, -.04]],
};
export function astronomicalArguments(utc) {
  const time = typeof utc === 'number' ? utc : Date.parse(utc);
  if (!Number.isFinite(time)) throw new Error('潮汐の開始日時が不正です。');
  const date = new Date(time), year = date.getUTCFullYear();
  if (year < 1901 || year > 2099) throw new Error('天文潮汐の日時は1901〜2099年で指定してください。');
  const midnight = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const y = year - 2000, d = (midnight - Date.UTC(year, 0, 1)) / 86400000 + Math.floor((year + 3) / 4) - 500;
  return { s: 211.728 + 129.38471 * y + 13.176396 * d,
    h: 279.974 - .23871 * y + .985647 * d,
    p: 83.298 + 40.66229 * y + .111404 * d,
    N: (125.071 - 19.32812 * y - .052954 * d) * rad,
    hours: (time - midnight) / 3600000 };
}
export function constituentSpecies(name) { return constituents[name]?.[4] ?? 0; }
export function astronomicalBasis(name, utc, lon = 0, speed) {
  const c = constituents[name];
  if (!c || speed !== undefined && Math.abs(speed - c[7]) > 1e-6) return null;
  const a = astronomicalArguments(utc), coeff = nodal[c[5]];
  let f = 1, u = 0;
  if (coeff) {
    f = coeff[0][0];
    for (let i = 1; i <= 3; i++) { f += coeff[0][i] * Math.cos(i * a.N); u += coeff[1][i - 1] * Math.sin(i * a.N); }
  }
  return { factor: f ** c[6], phaseDegrees: c[0] * a.s + c[1] * a.h + c[2] * a.p + c[3] + c[4] * lon + c[7] * a.hours + c[6] * u };
}
