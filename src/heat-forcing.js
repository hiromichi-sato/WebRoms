export const HEAT_DEFAULTS = { mode: 'off', airTemperature: 20, exchangeCoefficient: 20, netFlux: 0 };
export function heatSettings(config) { return { ...HEAT_DEFAULTS, ...config.heat }; }
export function heatErrors(config) {
  const h = heatSettings(config), errors = [];
  if (!['off', 'air', 'flux'].includes(h.mode)) errors.push('熱交換の設定方法が不正です。');
  if (h.mode === 'air') {
    if (!Number.isFinite(h.airTemperature) || h.airTemperature < -80 || h.airTemperature > 60) errors.push('気温は-80〜60 ℃で指定してください。');
    if (!Number.isFinite(h.exchangeCoefficient) || h.exchangeCoefficient < 0 || h.exchangeCoefficient > 200) errors.push('熱交換係数は0〜200 W/(m² K)で指定してください。');
  }
  if (h.mode === 'flux' && (!Number.isFinite(h.netFlux) || Math.abs(h.netFlux) > 2000)) errors.push('海面熱フラックスは-2000〜2000 W/m²で指定してください。');
  return errors;
}
export function heatParameters(config) {
  const errors = heatErrors(config); if (errors.length) throw new Error(errors.join('\n'));
  const h = heatSettings(config);
  if (h.mode === 'air') return [1, h.airTemperature, h.exchangeCoefficient, 0];
  if (h.mode === 'flux') return [2, 0, 0, h.netFlux];
  return [0, 0, 0, 0];
}
export function surfaceHeatFlux(config, seaTemperature) {
  const [mode, air, coefficient, flux] = heatParameters(config);
  return mode === 1 ? coefficient * (air - seaTemperature) : mode === 2 ? flux : 0;
}
