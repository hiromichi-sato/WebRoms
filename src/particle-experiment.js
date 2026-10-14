import { writeNetcdf } from './netcdf.js';
import { boundsOf, forcingEnd } from './ocean-boundary.js';
import { RUNTIME_STEP_LIMIT } from './export-plan.js';

export const PARTICLE_DEFAULTS = { cell: null, count: 25, depth: 1, mode: '3d', hours: 24, interval: 3600 };
export const PARTICLE_LIMIT = 512;
export const PARTICLE_COLORS = ['#c52c64', '#007f91', '#d18000', '#684baf', '#29864f'];

export function particleSettings(config) {
  const settings = { ...PARTICLE_DEFAULTS, ...config.particles };
  settings.sources = Array.isArray(config.particles?.sources)
    ? config.particles.sources.map(s => ({ ...s }))
    : Number.isInteger(settings.cell) ? [{ id: 'release-1', cell: settings.cell, count: settings.count, depth: settings.depth, color: PARTICLE_COLORS[0] }] : [];
  return settings;
}

export function releaseCoordinates(config, cell) {
  const bounds = boundsOf(config), { nx, ny } = config.grid;
  return bounds ? { longitude: bounds.west + cell % nx / (nx - 1) * (bounds.east - bounds.west), latitude: bounds.south + Math.floor(cell / nx) / (ny - 1) * (bounds.north - bounds.south) } : null;
}

export function particlePlan(config, fields, completedSteps = 0, options = {}) {
  const settings = particleSettings(config), { nx, ny, mask, h } = fields;
  if (!settings.sources.length) throw new Error('粒子の放流位置を内部の水域セルに指定してください。');
  const ids = new Set(); let count = 0;
  for (const [index, source] of settings.sources.entries()) {
    if (typeof source.id !== 'string' || !source.id || ids.has(source.id)) throw new Error('放流地点の識別IDが不正です。');
    ids.add(source.id);
    if (!/^#[0-9a-f]{6}$/i.test(source.color)) throw new Error('粒子の色が不正です。');
    const p = source.cell, i = p % nx, j = Math.floor(p / nx);
    if (!Number.isInteger(p) || p < 0 || p >= nx * ny || !mask[p] || i < 1 || i >= nx - 1 || j < 1 || j >= ny - 1) throw new Error('粒子の放流位置を内部の水域セルに指定してください。');
    if (!Number.isInteger(source.count) || source.count < 1 || source.count > PARTICLE_LIMIT) throw new Error(`地点${index + 1}の粒子数は1〜${PARTICLE_LIMIT}で指定してください。`);
    count += source.count;
    if (!['3d', 'depth'].includes(settings.mode)) throw new Error('粒子の追跡方式が不正です。');
    const localDepth = Math.min(...[-1, 0, 1].flatMap(dj => [-1, 0, 1].map(di => (j + dj) * nx + i + di)).filter(q => mask[q]).map(q => h[q]));
    if (!Number.isFinite(source.depth) || source.depth <= 0 || source.depth >= localDepth) throw new Error(`地点${index + 1}の放流深度は0 mより深く、周辺の最浅水深 ${localDepth.toFixed(1)} m未満にしてください。`);
  }
  if (count > PARTICLE_LIMIT) throw new Error(`粒子数は全地点の合計で${PARTICLE_LIMIT}以内にしてください。`);
  const dt = config.numerics.dt;
  if (!Number.isFinite(settings.hours) || settings.hours <= 0 || settings.hours > 720) throw new Error('追跡期間は0時間より長く、720時間以内にしてください。');
  if (!Number.isFinite(settings.interval) || settings.interval < dt || settings.interval > settings.hours * 3600) throw new Error(`記録間隔は時間刻み ${dt} s以上、追跡期間以内にしてください。`);
  const steps = Math.ceil(settings.hours * 3600 / dt - 1e-9), every = Math.max(1, Math.ceil(settings.interval / dt - 1e-9));
  if (steps > 1000000 || steps + completedSteps >= RUNTIME_STEP_LIMIT) throw new Error('粒子追跡のステップ上限を超えます。追跡期間を短くしてください。');
  if (!options.repeatForcing && (steps + completedSteps) * dt > forcingEnd(config)) throw new Error('追跡期間が潮汐・補正データの期間を超えます。');
  const records = 2 + Math.ceil(steps / every);
  if (records * count > 500000) throw new Error('粒子の記録数が多すぎます。粒子数を減らすか、記録間隔を広げてください。');
  const xyz = new Float64Array(count * 3), sourceIndex = new Uint16Array(count);
  let offset = 0;
  for (const [index, source] of settings.sources.entries()) {
    const i = source.cell % nx, j = Math.floor(source.cell / nx);
    for (let l = 0; l < source.count; l++) {
      const radius = source.count === 1 ? 0 : .3 * Math.sqrt(l / (source.count - 1)), angle = l * 2.399963229728653;
      xyz.set([i + radius * Math.cos(angle), j + radius * Math.sin(angle), source.depth], offset * 3);
      sourceIndex[offset++] = index + 1;
    }
  }
  return { ...settings, count, sourceIndex, steps, every, records, duration: steps * dt, actualInterval: every * dt, xyz };
}

export function seedParticles(runtime, plan) {
  if (runtime._webroms_floats_version?.() !== 1) throw new Error('ROMS標準FLOATS対応の実行核が必要です。');
  const pointer = runtime._malloc(plan.xyz.byteLength);
  if (!pointer) throw new Error('放流データのメモリを確保できませんでした。');
  try {
    runtime.HEAPF64.set(plan.xyz, pointer / 8);
    if (runtime._webroms_floats_seed(plan.count, plan.mode === '3d' ? 1 : 3, pointer) !== 0) throw new Error('ROMSが放流位置または深度を受け付けませんでした。');
  } finally { runtime._free(pointer); }
}

export function particleSnapshot(runtime, count) {
  const pointer = runtime._malloc(count * 4 * 8);
  if (!pointer) throw new Error('粒子データのメモリを確保できませんでした。');
  try {
    if (runtime._webroms_floats_copy(pointer) !== count) throw new Error('粒子数が実行核と一致しません。');
    return runtime.HEAPF64.slice(pointer / 8, pointer / 8 + count * 4);
  } finally { runtime._free(pointer); }
}

export function initialParticleRecord(plan, time) {
  const positions = new Float64Array(plan.count * 4);
  for (let l = 0; l < plan.count; l++) positions.set([...plan.xyz.subarray(l * 3, l * 3 + 3), 0], l * 4);
  return { time, positions };
}

export function particleNetcdf(runtime, config, plan, records) {
  const variables = [
    { name: 'ocean_time', dimensions: ['ocean_time'], data: records.map(r => r.time), attributes: { units: `seconds since ${config.ocean?.startUtc?.replace('T', ' ').replace('Z', '') ?? '2000-01-01 00:00:00'}`, calendar: 'gregorian' } },
    { name: 'trajectory', dimensions: ['trajectory'], data: Array.from({ length: plan.count }, (_, i) => i + 1), attributes: { cf_role: 'trajectory_id' } }
  ];
  const bounds = boundsOf(config), { nx, ny, dx, dy } = config.grid;
  variables.push({ name: 'release_site_index', dimensions: ['trajectory'], data: plan.sourceIndex, attributes: { long_name: 'Origin release site (1-based index)' } });
  for (const [name, data, units] of [
    ['release_site', plan.sources.map((_, i) => i + 1), '1'],
    ['release_cell', plan.sources.map(s => s.cell), '1'],
    ['release_grid_x', plan.sources.map(s => s.cell % nx), '1'],
    ['release_grid_y', plan.sources.map(s => Math.floor(s.cell / nx)), '1'],
    ['release_depth', plan.sources.map(s => s.depth), 'm'],
    ['release_count', plan.sources.map(s => s.count), '1'],
    ...(bounds ? [['release_longitude', plan.sources.map(s => releaseCoordinates(config, s.cell).longitude), 'degrees_east'], ['release_latitude', plan.sources.map(s => releaseCoordinates(config, s.cell).latitude), 'degrees_north']] : [])
  ]) variables.push({ name, dimensions: ['release_site'], data, attributes: { units } });
  for (const [name, column, units, convert] of [
    ['initial_grid_x', 0, '1', x => x], ['initial_grid_y', 1, '1', y => y], ['initial_depth', 2, 'm', z => z],
    ...(bounds ? [['initial_longitude', 0, 'degrees_east', x => bounds.west + x / (nx - 1) * (bounds.east - bounds.west)], ['initial_latitude', 1, 'degrees_north', y => bounds.south + y / (ny - 1) * (bounds.north - bounds.south)]] : [])
  ]) variables.push({ name, dimensions: ['trajectory'], data: Array.from({ length: plan.count }, (_, l) => convert(plan.xyz[l * 3 + column])), attributes: { units } });
  const specs = [['grid_x', 0, '1', x => x], ['grid_y', 1, '1', y => y], ['depth', 2, 'm', z => z], ['status', 3, '1', s => s], ['x', 0, 'm', x => x * dx], ['y', 1, 'm', y => y * dy]];
  if (bounds) specs.push(['longitude', 0, 'degrees_east', x => bounds.west + x / (nx - 1) * (bounds.east - bounds.west)], ['latitude', 1, 'degrees_north', y => bounds.south + y / (ny - 1) * (bounds.north - bounds.south)]);
  for (const [name, column, units, convert] of specs) {
    const data = new Float64Array(records.length * plan.count);
    for (let t = 0; t < records.length; t++) for (let l = 0; l < plan.count; l++) {
      const p = records[t].positions, value = p[l * 4 + column];
      data[t * plan.count + l] = column !== 3 && (p[l * 4 + 3] === 2 || !Number.isFinite(value)) ? -9999 : convert(value);
    }
    variables.push({ name, dimensions: ['ocean_time', 'trajectory'], data, attributes: { units, ...(name === 'status' ? { flag_values: '0 1 2', flag_meanings: 'pending active outside_domain' } : { _FillValue: -9999 }), ...(name === 'depth' ? { positive: 'down' } : {}) } });
  }
  writeNetcdf(runtime, 'particles.nc', { ocean_time: records.length, trajectory: plan.count, release_site: plan.sources.length }, variables, { title: 'WebROMS ROMS FLOATS trajectories', source: 'ROMS standard FLOATS: Milne predictor / Hamming corrector', webroms_format: 'particles-v2', trajectory_type: plan.mode === '3d' ? 'Lagrangian 3D' : 'Geopotential constant depth', release_site_metadata: JSON.stringify(plan.sources.map((s, i) => ({ index: i + 1, ...s, ...releaseCoordinates(config, s.cell) }))), experiment_config: JSON.stringify({ ...plan, xyz: Array.from(plan.xyz), sourceIndex: Array.from(plan.sourceIndex) }), grid_config: JSON.stringify(config.grid), conventions_note: 'Time-by-trajectory matrix; not a restart; no random walk or biological behavior', time_note: 'Model elapsed seconds; continues the preceding ocean calculation' });
  const bytes = runtime.FS.readFile('particles.nc'); runtime.FS.unlink('particles.nc'); return bytes;
}
