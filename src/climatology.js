import { CLIMATOLOGY_DATA as woa } from './data/climatology-woa23.js';
import { ENSO_DATA as enso } from './data/climatology-enso.js';
import { buildFields, biologyTracers, SIDES } from './model.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const CLIMATOLOGY_DATA = freeze(woa);
export const ENSO_DATA = freeze(enso);
export const DEFAULT_DENSITY_KG_M3 = 1025;
const REGION_LABELS = { 'japan-pacific': '日本太平洋側（南部・湾の周辺海域）', 'japan-north': '日本太平洋側（北部）', 'japan-sea': '日本海', 'north-pacific': '北太平洋', california: '北太平洋東岸', 'south-pacific': '南太平洋', 'north-atlantic': '北大西洋', 'south-atlantic': '南大西洋' };
export function regionalClimate(config, season = 'annual') {
  const preset = config.grid.preset, region = ['japan', 'bay', 'setouchi', 'osaka', 'tokyo', 'ise'].includes(preset) ? 'japan-pacific' : ['california', 'north-pacific', 'south-pacific', 'north-atlantic', 'south-atlantic'].includes(preset) ? preset : null;
  if (!region) throw new Error('この地形には参照海域がありません。地域付きの地形を選んでください。');
  const south = region.startsWith('south-');
  const period = season === 'annual' ? 'annual' : (season === 'summer') !== south ? 'JJA' : 'DJF';
  const profile = woa.profiles.find(p => p.region === region && p.season === period);
  return { id: profile.id, region, label: REGION_LABELS[region], period };
}
export function applyRegionalClimate(config, season) {
  const selected = regionalClimate(config, season);
  const next = applyClimatology(config, selected.id, { boundaries: false, outOfRange: 'clamp' });
  next.initial.distribution = 'climatology'; next.initial.regionalSeason = season;
  next.climatology.regionLabel = selected.label;
  return next;
}
const SEASON_LABELS = { annual: '年平均', JJA: '夏季（6～8月）', DJF: '冬季（12～2月）' };
export const OUT_OF_RANGE_OPTIONS = freeze([
  { id: 'error', label: '観測範囲外は適用しない' },
  { id: 'clamp', label: '範囲外は最も近い有効深度の値で固定（近似）' }
]);
export const CLIMATOLOGY_OPTIONS = freeze(woa.profiles.map(profile => ({
  id: profile.id,
  label: `${REGION_LABELS[profile.region]} / ${profile.region.startsWith('south-') ? ({ annual: '年平均', JJA: '冬季（6～8月）', DJF: '夏季（12～2月）' })[profile.season] : SEASON_LABELS[profile.season]} / NOAA WOA23`,
  region: profile.region, season: profile.season,
  requiresNorthernTerrain: profile.season === 'JJA' && !profile.region.startsWith('south-'),
  depthRangeM: [woa.depthsM[0], woa.depthsM.at(-1)],
  temperatureSalinityPeriod: '1991-2020', nutrientPeriod: '1965-2022',
  sourceUrl: woa.sourcePage,
  disclosure: '水温・塩分は1500 m以深、栄養塩は500 m以深で年平均を使用。海域別の有効深度は異なります。P/Z/Dは観測値ではありません。',
  outOfRangeOptions: OUT_OF_RANGE_OPTIONS
})));
export const ENSO_OPTIONS = freeze(enso.profiles.map(profile => ({
  id: profile.id, label: `北太平洋 / ${profile.phase === 'el-nino' ? 'エルニーニョ' : 'ラニーニャ'} / 選定冬季事例 / NOAA GODAS`,
  phase: profile.phase, winterYears: profile.winterYears, season: profile.season,
  depthRangeM: [enso.depthsM[0], enso.depthsM.at(-1)], applicableToConfig: true,
  sourceUrl: enso.sourcePage, outOfRangeOptions: OUT_OF_RANGE_OPTIONS,
  disclosure: '各相3冬季のDJF合成（全ENSO事例の気候値・偏差ではありません）。ポテンシャル水温と質量塩分をモデル値に近似。栄養塩・P/Z/Dは変更しません。'
})));

function northernTerrain(config) {
  const bounds = config?.grid?.geoBounds;
  if (bounds != null) return Boolean(Number.isFinite(bounds.south) && Number.isFinite(bounds.north)
    && bounds.south >= 0 && bounds.north > bounds.south && bounds.north <= 90);
  return TERRAIN_PRESETS[config?.grid?.preset]?.hemisphere === 'north';
}

/** With no config, return the catalogue; with a config, include eligibility reasons. */
export function getClimatologyOptions(config) {
  return CLIMATOLOGY_OPTIONS.map(option => ({ ...option,
    ...(config === undefined ? {} : {
      available: !option.requiresNorthernTerrain || northernTerrain(config),
      reason: option.requiresNorthernTerrain && !northernTerrain(config)
        ? '夏季（JJA）は北半球の地形でのみ適用できます。' : null
    })
  }));
}

export function getEnsoOptions(config) {
  const region = TERRAIN_PRESETS[config?.grid?.preset]?.region;
  const available = northernTerrain(config) && ['japan', 'north-pacific'].includes(region);
  return ENSO_OPTIONS.map(option => ({ ...option, ...(config === undefined ? {} : {
    available, reason: available ? null : '選定ENSO合成は日本・北太平洋の地形で適用できます。'
  }) }));
}

export function getClimatologyProfile(id) {
  const profile = woa.profiles.find(p => p.id === id);
  if (!profile) throw new RangeError(`Unknown WOA climatology: ${id}`);
  return freeze({ ...profile, depthsM: woa.depthsM, variables: woa.variables,
    bounds: woa.regions.find(r => r.id === profile.region) });
}

export function getEnsoComposite(id) {
  const profile = enso.profiles.find(p => p.id === id);
  if (!profile) throw new RangeError(`Unknown GODAS composite: ${id}`);
  return freeze({ ...profile, depthsM: enso.depthsM, units: enso.units, bounds: enso.region });
}

function density(value) {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError('Density must be finite and positive (kg/m3)');
  return value;
}

/** Conversion only; density is an explicit modelling assumption, not a NOAA observation. */
export function micromolKgToMmolM3(value, densityKgM3 = DEFAULT_DENSITY_KG_M3) {
  density(densityKgM3);
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Concentration must be nonnegative or null');
  return value * densityKgM3 / 1000;
}

export function mmolM3ToMicromolKg(value, densityKgM3 = DEFAULT_DENSITY_KG_M3) {
  density(densityKgM3);
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Concentration must be nonnegative or null');
  return value * 1000 / densityKgM3;
}

/** Linear interpolation never crosses a missing endpoint. No extrapolation by default. */
export function sampleProfile(depthsM, values, depthM, { outOfRange = 'missing' } = {}) {
  if (!['missing', 'error', 'clamp'].includes(outOfRange)) throw new RangeError('Invalid outOfRange policy');
  if (!Number.isFinite(depthM) || depthM < 0) throw new RangeError('Depth must be finite, positive-down metres');
  if (!Array.isArray(depthsM) || !Array.isArray(values) || !depthsM.length || depthsM.length !== values.length
    || depthsM.some((d, i) => !Number.isFinite(d) || d < 0 || (i && d <= depthsM[i - 1]))
    || values.some(v => v !== null && !Number.isFinite(v))) throw new TypeError('Invalid profile arrays');
  if (depthM < depthsM[0] || depthM > depthsM.at(-1)) {
    if (outOfRange === 'error') throw new RangeError(`Depth ${depthM} outside ${depthsM[0]}-${depthsM.at(-1)} m`);
    if (outOfRange === 'missing') return null;
    return depthM < depthsM[0] ? values[0] : values.at(-1);
  }
  const upper = depthsM.findIndex(d => d >= depthM);
  if (depthsM[upper] === depthM) return values[upper];
  const lower = upper - 1;
  if (values[lower] === null || values[upper] === null) return null;
  return values[lower] + (values[upper] - values[lower]) * (depthM - depthsM[lower]) / (depthsM[upper] - depthsM[lower]);
}

export function sampleClimatology(id, depthM, options = {}) {
  const profile = getClimatologyProfile(id);
  const nutrientUnits = options.nutrientUnits ?? 'umol/kg';
  if (!['umol/kg', 'mmol/m3'].includes(nutrientUnits)) throw new RangeError('Invalid nutrientUnits');
  const densityKgM3 = density(options.densityKgM3 ?? DEFAULT_DENSITY_KG_M3);
  const values = Object.fromEntries(Object.entries(profile.fields).map(([key, field]) => {
    const value = sampleField(profile.depthsM, field.values, depthM, options);
    return [key, nutrientUnits === 'mmol/m3' && ['nitrate', 'phosphate', 'silicate'].includes(key)
      ? micromolKgToMmolM3(value, densityKgM3) : value];
  }));
  return { id, depthM, ...values, missing: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null])),
    units: { temperature: 'degree_Celsius', salinity: '1 (practical salinity)', nitrate: nutrientUnits, phosphate: nutrientUnits, silicate: nutrientUnits },
    densityKgM3: nutrientUnits === 'mmol/m3' ? densityKgM3 : null };
}

// Regional seabeds can leave trailing nulls well above the product's deepest level.
// Clamp only outside valid coverage; internal holes remain missing.
function sampleField(depths, values, depth, options) {
  const first = values.findIndex(v => v !== null), last = values.findLastIndex(v => v !== null);
  if (first < 0) return null;
  return sampleProfile(depths.slice(first, last + 1), values.slice(first, last + 1), depth, options);
}

/** GODAS is deliberately separate: potential temperature, mass-fraction salinity, no nutrients. */
export function sampleEnsoComposite(id, depthM, options = {}) {
  const profile = getEnsoComposite(id);
  const values = Object.fromEntries(Object.entries(profile.fields).map(([key, field]) => [key,
    sampleField(profile.depthsM, field.values, depthM, options)]));
  return { id, depthM, ...values, missing: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === null])), units: profile.units };
}

/** Return a new config. Paint wet rho cells and boundary points at their actual sigma depths. */
export function applyClimatology(config, id, { densityKgM3 = DEFAULT_DENSITY_KG_M3, boundaries = true, outOfRange = 'error' } = {}) {
  const profile = getClimatologyProfile(id);
  density(densityKgM3);
  if (profile.season === 'JJA' && !profile.region.startsWith('south-') && !northernTerrain(config)) throw new RangeError('北半球の夏季データは北半球の地形で選択してください。');
  const nutrientMap = { NO3: 'nitrate', npzd_NO3_: 'nitrate', nemuro_NO3_: 'nitrate', nemuro_SiOH: 'silicate' };
  const mapping = { temp: 'temperature', salt: 'salinity' };
  for (const tracer of biologyTracers(config)) if (nutrientMap[tracer.key]) mapping[tracer.key] = nutrientMap[tracer.key];
  const next = applyProfile(config, mapping, depthM => sampleClimatology(id, depthM,
    { densityKgM3, nutrientUnits: 'mmol/m3', outOfRange }), { boundaries, outOfRange });
  next.climatology = {
    ...next.climatology, id, product: woa.product, sourceUrl: woa.sourcePage,
    payloadSha256: woa.payloadSha256, densityKgM3,
    temperatureKind: 'WOA in-situ temperature used as model temperature without potential-temperature correction',
    verticalComposite: 'Seasonal T/S through 1500 m, nutrients through 500 m; annual below those ranges through 5500 m; regional missing depths preserved',
    biology: 'NOAA nitrate and (NEMURO only) silicate; all other biology retained from model configuration'
  };
  return next;
}

/** Apply selected DJF event means, not anomalies or a full ENSO climatology. */
export function applyEnsoComposite(config, id, { boundaries = true, outOfRange = 'error' } = {}) {
  const profile = getEnsoComposite(id);
  const option = getEnsoOptions(config).find(o => o.id === id);
  if (!option.available) throw new RangeError(option.reason);
  const next = applyProfile(config, { temp: 'potentialTemperature', salt: 'salinityMassFraction' },
    depth => sampleEnsoComposite(id, depth, { outOfRange }), { boundaries, outOfRange });
  next.climatology = {
    ...next.climatology, id, product: enso.product, sourceUrl: enso.sourcePage,
    payloadSha256: enso.payloadSha256, winterYears: [...profile.winterYears], season: 'DJF',
    temperatureKind: 'GODAS potential temperature (K minus 273.15) used directly as model temperature',
    salinityKind: 'GODAS mass fraction times 1000 (g/kg) used numerically as model practical salinity; approximation, not a TEOS-10 conversion',
    eventSelection: enso.eventSelection, biology: 'No GODAS nutrients or P/Z/D; all biology retained'
  };
  return next;
}

function applyProfile(config, mapping, sampler, { boundaries, outOfRange }) {
  if (!['error', 'clamp'].includes(outOfRange)) throw new RangeError('Application outOfRange must be error or clamp');
  if (typeof boundaries !== 'boolean') throw new TypeError('boundaries must be boolean');
  const next = structuredClone(config), fields = buildFields(next);
  const { nx, ny, nz } = next.grid, size = nx * ny;
  const keys = Object.keys(mapping);
  const sample = depthM => {
    const values = sampler(depthM);
    if (keys.some(key => values[mapping[key]] === null)) throw new RangeError(`Missing NOAA data at ${depthM} m; config unchanged`);
    return values;
  };
  const layerDepth = (height, k) => height * (1 - (k + 0.5) / nz);
  let referenceDepthM = 0;
  next.initial.painted ??= {}; next.initial.anchors ??= {};
  for (const key of keys) next.initial.painted[key] = Array.from({ length: nz }, () => ({}));
  for (let p = 0; p < size; p++) {
    if (!fields.mask[p]) continue;
    const height = fields.h[p] + fields.zeta[p];
    referenceDepthM = Math.max(referenceDepthM, height);
    for (let k = 0; k < nz; k++) {
      const values = sample(layerDepth(height, k));
      for (const key of keys) next.initial.painted[key][k][p] = values[mapping[key]];
    }
  }
  const representative = Array.from({ length: nz }, (_, k) => sample(layerDepth(referenceDepthM, k)));
  next.initial.distribution = 'stratified'; next.initial.tempGradient = 0;
  for (const key of keys) next.initial.anchors[key] = representative.map(v => v[mapping[key]]);
  next.initial.tempSurface = representative.at(-1)[mapping.temp];
  next.initial.tempBottom = representative[0][mapping.temp];
  next.initial.saltSurface = representative.at(-1)[mapping.salt];
  next.initial.saltBottom = representative[0][mapping.salt];
  for (const key of keys.filter(k => !['temp', 'salt'].includes(k))) next.ecosystem.initial[key] = representative.at(-1)[mapping[key]];
  if (boundaries) for (const side of SIDES) {
    const b = next.boundary[side], alongCount = side === 'west' || side === 'east' ? ny : nx;
    b.fromInitial = false;
    b.painted ??= {}; b.anchors ??= {};
    for (const key of keys) {
      b.painted[key] = Array.from({ length: nz }, () => ({}));
      b.anchors[key] = representative.map(v => v[mapping[key]]);
      b.layers.forEach((layer, k) => { layer[key] = representative[k][mapping[key]]; });
    }
    for (let along = 0; along < alongCount; along++) {
      const p = side === 'west' ? along * nx : side === 'east' ? along * nx + nx - 1
        : side === 'south' ? along : (ny - 1) * nx + along;
      if (!fields.mask[p]) continue;
      const height = fields.h[p] + (b.painted.zeta?.[0]?.[along] ?? b.zeta);
      if (!Number.isFinite(height) || height <= 0) throw new RangeError('Boundary water column must be positive');
      for (let k = 0; k < nz; k++) {
        const values = sample(layerDepth(height, k));
        for (const key of keys) b.painted[key][k][along] = values[mapping[key]];
      }
    }
  }
  next.climatology = {
    verticalSampling: 'positive-down layer centers, uniform sigma; bottom-first',
    referenceDepthM, outOfRange, boundaries, appliedFields: keys,
    rangeDisclosure: outOfRange === 'clamp' ? 'Outside each field\'s valid regional depth range, hold nearest endpoint constant; not a deep/surface observation' : 'Reject outside each field\'s valid regional depth range',
    spatialSampling: 'regional mean; no horizontal NOAA gradients; regenerate after terrain/layer changes'
  };
  return next;
}
