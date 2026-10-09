import { writeNetcdf } from './netcdf.js';
import { buildFields, biologyTracers } from './model.js';
import { fieldValue } from './view-section.js';
import { gridGeometry, shapeFiles } from './shape-io.js';
import { zipSync, strToU8 } from '../vendor/fflate.js';

export function selectRecords(records, start, end, interval) {
  if (![start, end, interval].every(Number.isFinite) || start < 0 || end < start || interval <= 0) throw new Error('期間と時間間隔を確認してください。');
  const selected = [];
  for (const record of records) if (record.time >= start && record.time <= end && (!selected.length || record.time >= selected.at(-1).time + interval - 1e-8)) selected.push(record);
  if (!selected.length) throw new Error('指定期間に保存済みの計算結果がありません。');
  return selected;
}
export function selectFinalHours(records, hours, interval) {
  if (!Number.isFinite(hours) || hours < 0 || !Number.isFinite(interval) || interval <= 0) throw new Error('保存時間は0以上、保存間隔は0より大きい値にしてください。');
  if (!records.length) throw new Error('保存済みの計算結果がありません。');
  const end = records.at(-1).time, start = Math.max(0, end - hours * 3600), selected = [];
  // Anchor sampling to the actual final record, including early convergence.
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record.time >= start - 1e-8 && (!selected.length || record.time <= selected.at(-1).time - interval + 1e-8)) selected.push(record);
  }
  return selected.reverse();
}
export function resultNetcdf(runtime, config, records) {
  const f = buildFields(config), { nx, ny, nz } = f;
  const dimensions = { ocean_time: records.length, xi_rho: nx, eta_rho: ny, xi_u: nx - 1, eta_u: ny, xi_v: nx, eta_v: ny - 1, s_rho: nz };
  const rho = ['eta_rho', 'xi_rho'];
  const variables = [
    { name: 'ocean_time', dimensions: ['ocean_time'], data: records.map(r => r.time), attributes: { units: 'seconds since 2000-01-01 00:00:00', calendar: 'gregorian' } },
    { name: 'h', dimensions: rho, data: f.h, attributes: { units: 'm', positive: 'down' } },
    { name: 'mask_rho', dimensions: rho, data: f.mask },
    { name: 'x_rho', dimensions: rho, data: Float64Array.from(f.h, (_, p) => p % nx * f.dx), attributes: { units: 'm' } },
    { name: 'y_rho', dimensions: rho, data: Float64Array.from(f.h, (_, p) => Math.floor(p / nx) * f.dy), attributes: { units: 'm' } }
  ];
  const geometry = gridGeometry(config);
  if (geometry.bounds) for (const [key, unit] of [['lon_rho', 'degrees_east'], ['lat_rho', 'degrees_north']]) variables.push({ name: key, dimensions: rho, data: Float64Array.from(f.h, (_, p) => key === 'lon_rho' ? geometry.bounds.west + p % nx / (nx - 1) * (geometry.bounds.east - geometry.bounds.west) : geometry.bounds.south + Math.floor(p / nx) / (ny - 1) * (geometry.bounds.north - geometry.bounds.south)), attributes: { units: unit } });
  const specs = [['zeta', rho, 'm'], ['temp', ['s_rho', ...rho], 'degree_Celsius'], ['salt', ['s_rho', ...rho], '1'], ['z_r', ['s_rho', ...rho], 'm'], ['u', ['s_rho', 'eta_u', 'xi_u'], 'm s-1'], ['v', ['s_rho', 'eta_v', 'xi_v'], 'm s-1'], ['ubar', ['eta_u', 'xi_u'], 'm s-1'], ['vbar', ['eta_v', 'xi_v'], 'm s-1']];
  if (config.ecosystem.enabled) for (const tracer of biologyTracers(config)) specs.push([tracer.key, ['s_rho', ...rho], tracer.unit]);
  for (const [key, dims, units] of specs) {
    const count = dims.reduce((n, d) => n * dimensions[d], 1), data = new Float64Array(count * records.length);
    records.forEach((record, t) => { const source = record.state.biology?.[key] ?? record.state[key]; if (source?.length !== count) throw new Error('結果配列が一致しません: ' + key); data.set(source, t * count); });
    variables.push({ name: key, dimensions: ['ocean_time', ...dims], data, attributes: { units, ...(key === 'z_r' ? { positive: 'up' } : {}) } });
  }
  writeNetcdf(runtime, 'result.nc', dimensions, variables, { title: 'WebROMS saved model states', source: 'ROMS', grid_config: JSON.stringify(config.grid), time_note: 'Model elapsed time; no interpolation between saved records', layer_order: 'bottom to surface' });
  const bytes = runtime.FS.readFile('result.nc'); runtime.FS.unlink('result.nc'); return bytes;
}
export function resultShape(config, records) {
  const f = buildFields(config), geometry = gridGeometry(config), files = {};
  if (records.length * f.nz * f.nx * f.ny > 500000) throw new Error('Shape出力は50万セル層までです。期間を短くするか間隔を広げてください。');
  const bio = config.ecosystem.enabled ? biologyTracers(config) : [];
  const mapping = Object.fromEntries(bio.map((tracer, i) => ['BIO' + i, { key: tracer.key, unit: tracer.unit }]));
  records.forEach((record, t) => {
    const state = { ...f, ...record.state };
    for (let k = 0; k < f.nz; k++) {
      const rows = geometry.rings.map((_, p) => ({ I: p % f.nx, J: Math.floor(p / f.nx), K: k, TIME_S: record.time, WET: f.mask[p], DEPTH_M: f.mask[p] ? f.h[p] : 0, Z_M: record.state.z_r[k * f.nx * f.ny + p], TEMP_C: fieldValue(state, 'temp', p, k), SALT: fieldValue(state, 'salt', p, k), U_MS: fieldValue(state, 'u', p, k), V_MS: fieldValue(state, 'v', p, k), ZETA_M: state.zeta[p], ...Object.fromEntries(bio.map((tracer, i) => ['BIO' + i, fieldValue(state, tracer.key, p, k)])) }));
      Object.assign(files, shapeFiles(`time_${t}/layer_${k}`, rows, geometry.rings, Boolean(geometry.bounds)));
    }
  });
  files['metadata.json'] = strToU8(JSON.stringify({ timesSeconds: records.map(r => r.time), layers: 'K=0 bottom; velocities averaged to cell centers', biology: mapping, config }, null, 2));
  return zipSync(files);
}
