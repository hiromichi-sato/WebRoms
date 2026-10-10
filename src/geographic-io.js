import { NetCDFReader } from '../vendor/netcdf-reader.js';
import { boundsOf, gridSignature } from './ocean-boundary.js';
import { biologyTracers } from './model.js';

// netcdfjs reads NC_CHAR as signed bytes; attributes written by NetCDF C are UTF-8.
const attributeValue = a => a.type === 'char' && typeof a.value === 'string' ? new TextDecoder().decode(Uint8Array.from(a.value, c => c.charCodeAt(0) & 255)) : a.value;
const attributes = variable => Object.fromEntries(variable.attributes.map(a => [a.name, attributeValue(a)]));
const flat = values => values.flat ? values.flat(Infinity) : Array.from(values);
export function readGeographicNetcdf(bytes, timeIndex = 0) {
  if (bytes.byteLength > 256 * 1048576) throw new Error('入力NetCDFは256 MiB以下にしてください。');
  let reader;
  try { reader = new NetCDFReader(bytes); } catch { throw new Error('NetCDF classic / 64-bit offset形式が必要です。NetCDF4/HDF5はclassicへ変換してください。'); }
  const get = (names, required = true) => {
    const variable = reader.variables.find(v => names.includes(v.name));
    if (!variable) { if (required) throw new Error(`NetCDFに ${names.join(' / ')} が必要です。`); return null; }
    const attrs = attributes(variable), dims = variable.dimensions.map(i => reader.dimensions[i]);
    const shape = dims.map(d => d.size || reader.recordDimension.length);
    let data = flat(reader.getDataVariable(variable));
    const t = dims.findIndex(d => ['time', 'ocean_time'].includes(d.name));
    if (t >= 0) {
      if (t !== 0 || !Number.isInteger(timeIndex) || timeIndex < 0 || timeIndex >= shape[0]) throw new Error('時刻番号が範囲外、または時刻次元が先頭ではありません。');
      const size = shape.slice(1).reduce((a, b) => a * b, 1);
      data = data.slice(timeIndex * size, (timeIndex + 1) * size); shape.shift(); dims.shift();
    }
    data = data.map(v => !Number.isFinite(v) || v === attrs._FillValue || v === attrs.missing_value || Math.abs(v) > 1e30 ? NaN : v * (attrs.scale_factor ?? 1) + (attrs.add_offset ?? 0));
    return { name: variable.name, attrs, shape, dims: dims.map(d => d.name), data };
  };
  const lon = get(['lon_rho', 'longitude', 'lon']), lat = get(['lat_rho', 'latitude', 'lat']);
  if (lon.attrs.units !== 'degrees_east' || lat.attrs.units !== 'degrees_north') throw new Error('経度・緯度のunitsは degrees_east / degrees_north が必要です。');
  let x, y;
  if (lon.shape.length === 1 && lat.shape.length === 1) { x = lon.data; y = lat.data; }
  else if (lon.shape.length === 2 && lat.shape.join() === lon.shape.join()) {
    const [ny, nx] = lon.shape; x = lon.data.slice(0, nx); y = Array.from({ length: ny }, (_, j) => lat.data[j * nx]);
    if (lon.data.some((v, p) => Math.abs(v - x[p % nx]) > 1e-6) || lat.data.some((v, p) => Math.abs(v - y[Math.floor(p / nx)]) > 1e-6)) throw new Error('曲線格子は未対応です。直交する緯度経度格子へ変換してください。');
  } else throw new Error('緯度経度の次元が一致しません。');
  const monotone = axis => axis.length >= 2 && axis.every((v, i) => Number.isFinite(v) && (!i || (v - axis[i - 1]) * (axis[1] - axis[0]) > 0));
  if (!monotone(x) || !monotone(y) || y.some(v => Math.abs(v) > 90)) throw new Error('緯度経度は欠測のない単調な座標列にしてください。');
  const vars = {};
  for (const v of reader.variables) if (!['char', 'string'].includes(v.type)) vars[v.name] = get([v.name]);
  return { x, y, nx: x.length, ny: y.length, vars, attributes: Object.fromEntries(reader.globalAttributes.map(a => [a.name, attributeValue(a)])), timeIndex };
}
function bracket(axis, coordinate) {
  const direction = Math.sign(axis[1] - axis[0]), q = coordinate * direction;
  if (q < axis[0] * direction - 1e-7 || q > axis.at(-1) * direction + 1e-7) throw new Error('入力データが地形の緯度経度範囲を覆っていません。');
  let lo = 0, hi = axis.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (axis[mid] * direction <= q) lo = mid; else hi = mid; }
  return [lo, hi, Math.max(0, Math.min(1, (coordinate - axis[lo]) / (axis[hi] - axis[lo])))];
}
function weights(source, lon, lat) {
  const center = (source.x[0] + source.x.at(-1)) / 2;
  lon += 360 * Math.round((center - lon) / 360);
  const [i0, i1, u] = bracket(source.x, lon), [j0, j1, v] = bracket(source.y, lat);
  return [[j0 * source.nx + i0, (1 - u) * (1 - v)], [j0 * source.nx + i1, u * (1 - v)], [j1 * source.nx + i0, (1 - u) * v], [j1 * source.nx + i1, u * v]].filter(([, w]) => w > 1e-12);
}
export function sampleGeographic(source, variable, lon, lat, z, extend = false) {
  const { nx, ny, vars } = source, size = nx * ny;
  const columns = weights(source, lon, lat);
  let total = 0, sum = 0;
  for (const [p, w] of columns) {
    if (vars.mask_rho && !vars.mask_rho.data[p]) continue;
    let value;
    if (z === undefined) {
      if (variable.shape.join() !== [ny, nx].join()) throw new Error(`${variable.name}: 2次元の緯度経度格子が必要です。`);
      value = variable.data[p];
    } else {
      if (variable.shape.length !== 3 || variable.shape.slice(1).join() !== [ny, nx].join()) throw new Error(`${variable.name}: 深度・緯度・経度の3次元が必要です。`);
      const depth = vars.z_r ?? vars.depth;
      if (!depth || depth.attrs.units !== 'm' || !['up', 'down'].includes(depth.attrs.positive)) throw new Error('深度には z_r または depth と units=m、positive=up/down が必要です。');
      const nz = variable.shape[0];
      if (nz < 2) throw new Error('3次元場には2深度以上が必要です。');
      if (depth.data.length !== nz && (depth.shape.join() !== variable.shape.join())) throw new Error('深度配列の次元が一致しません。');
      const profile = Array.from({ length: nz }, (_, k) => [depth.data[depth.data.length === nz ? k : k * size + p] * (depth.attrs.positive === 'down' ? -1 : 1), variable.data[k * size + p]]);
      if (profile.some(([d, v]) => !Number.isFinite(d) || !Number.isFinite(v))) continue;
      profile.sort((a, b) => a[0] - b[0]);
      if (profile.some(([d], k) => k && d <= profile[k - 1][0])) throw new Error('深度に重複があります。');
      if (z < profile[0][0] || z > profile.at(-1)[0]) {
        const h = vars.h?.data[p], eta = vars.zeta?.data[p] ?? 0;
        const withinOwnColumn = source.attributes.webroms_format === 'geographic-v1' && Number.isFinite(h) && z >= -h - 1e-7 && z <= eta + 1e-7;
        if (!extend && !withinOwnColumn) throw new Error('入力の深度範囲が不足しています。深いデータを用意するか、端値延長を明示的に選択してください。');
        value = z < profile[0][0] ? profile[0][1] : profile.at(-1)[1];
      } else {
        const k = Math.max(1, profile.findIndex(([d]) => d >= z)), [d0, v0] = profile[k - 1], [d1, v1] = profile[k];
        value = v0 + (v1 - v0) * (z - d0) / (d1 - d0);
      }
    }
    if (Number.isFinite(value)) { total += w; sum += w * value; }
  }
  if (!total) throw new Error(`${variable.name}: 対象の海セルに有効な入力値がありません。`);
  return sum / total;
}
export function resampleInitial(source, config, fields, { extend = false, seaLevelOnly = false } = {}) {
  const b = boundsOf(config);
  if (!b) throw new Error('初期場の読み込みには、地形側にも緯度経度が必要です。');
  const { nx, ny, nz } = config.grid, size = nx * ny, painted = {};
  const names = seaLevelOnly ? ['zeta', 'mdt', 'adt'].filter(n => source.vars[n]).slice(0, 1) : ['temp', 'salt', ...Object.keys(fields.biology)];
  if (seaLevelOnly && !names.length) throw new Error('zeta / mdt / adt が必要です。');
  if (!seaLevelOnly && (!source.vars.temp || !source.vars.salt)) throw new Error('初期場には temp と salt が必要です。');
  const selected = names.filter(n => source.vars[n]);
  if (!seaLevelOnly && config.ecosystem.enabled) for (const key of Object.keys(fields.biology)) if (!source.vars[key]) throw new Error(`生物変数 ${key} がありません。現在のモデルと同じ形式が必要です。`);
  for (const name of selected) {
    const variable = source.vars[name], key = seaLevelOnly ? 'zeta' : name;
    const unit = biologyTracers(config).find(t => t.key === key)?.unit;
    const expected = key === 'zeta' ? ['m'] : key === 'temp' ? ['degree_Celsius', 'degrees_Celsius'] : key === 'salt' ? ['1', 'PSU', 'psu'] : [unit, unit?.replace('³', '3')];
    if (!expected.includes(variable.attrs.units)) throw new Error(`${name}: 単位 ${variable.attrs.units ?? '未指定'} は対応していません。`);
    const layers = key === 'zeta' ? 1 : nz;
    painted[key] = Array.from({ length: layers }, () => ({}));
    for (let p = 0; p < size; p++) if (fields.mask[p]) {
      const lon = b.west + p % nx / (nx - 1) * (b.east - b.west), lat = b.south + Math.floor(p / nx) / (ny - 1) * (b.north - b.south);
      for (let k = 0; k < layers; k++) {
        const z = key === 'zeta' ? undefined : -fields.h[p] + (fields.h[p] + fields.zeta[p]) * (k + .5) / nz;
        const v = sampleGeographic(source, variable, lon, lat, z, extend);
        const [low, high] = key === 'temp' ? [-5, 45] : key === 'salt' ? [0, 50] : key === 'zeta' ? [-20, 20] : [0, 10000];
        if (v < low || v > high) throw new Error(`${name}: 値 ${v} が対応範囲外です。`);
        painted[key][k][p] = v;
      }
    }
  }
  return { painted, metadata: { format: 'geographic-v1', gridSignature: gridSignature(config), timeIndex: source.timeIndex, source: source.attributes.source ?? 'Imported NetCDF', interpolation: 'wet-cell bilinear / physical-depth linear', extend } };
}
export function resampleTerrain(source, grid) {
  const h = source.vars.h;
  if (!h || h.attrs.units !== 'm' || h.attrs.positive !== 'down') throw new Error('地形には h（units=m、positive=down）が必要です。');
  const b = { west: Math.min(...source.x), east: Math.max(...source.x), south: Math.min(...source.y), north: Math.max(...source.y) };
  if (b.west < -180 || b.east > 180) throw new Error('地形の経度は−180〜180度に変換してください。');
  const g = { ...grid, preset: 'open', geoBounds: b, geoSource: 'Imported geographic NetCDF', edits: {} };
  const noMask = { ...source, vars: { ...source.vars, mask_rho: null } };
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const lon = b.west + i / (g.nx - 1) * (b.east - b.west), lat = b.south + j / (g.ny - 1) * (b.north - b.south);
    const nearest = weights(source, lon, lat).sort((a, b) => b[1] - a[1])[0][0];
    const depth = source.vars.mask_rho?.data[nearest] === 0 ? 0 : sampleGeographic(noMask, h, lon, lat);
    if (depth < 0 || depth > 10000) throw new Error('水深は0〜10000 mにしてください。');
    g.edits[j * g.nx + i] = depth;
  }
  const wet = Object.values(g.edits).filter(v => v > 0);
  if (!wet.length) throw new Error('海セルがありません。');
  g.minDepth = Math.min(...wet); g.maxDepth = Math.max(...wet);
  g.dx = 6371008.8 * Math.PI / 180 * (b.east - b.west) * Math.cos((b.north + b.south) * Math.PI / 360) / (g.nx - 1);
  g.dy = 6371008.8 * Math.PI / 180 * (b.north - b.south) / (g.ny - 1);
  return g;
}
