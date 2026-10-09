import { TERRAIN_DATA } from './data/terrain-etopo2022.js';

export const TERRAIN_PRESETS = {
  uniform: { label: '一様な地形', region: 'generic', hemisphere: 'north', depth: [200, 200], spacing: 2000 },
  setouchi: { label: '瀬戸内海（模擬）', region: 'japan', hemisphere: 'north', depth: [5, 200], spacing: 3000 },
  osaka: { label: '大阪湾（模擬）', region: 'japan', hemisphere: 'north', depth: [8, 70], spacing: 1200 },
  tokyo: { label: '東京湾（模擬）', region: 'japan', hemisphere: 'north', depth: [8, 100], spacing: 1200 },
  ise: { label: '伊勢湾（模擬）', region: 'japan', hemisphere: 'north', depth: [8, 60], spacing: 1400 },
  japan: { label: '日本・北太平洋西岸（模擬）', region: 'japan', hemisphere: 'north', depth: [80, 5000], spacing: 25000 },
  california: { label: '北太平洋東岸（模擬）', region: 'north-pacific', hemisphere: 'north', depth: [60, 4500], spacing: 20000 },
  'north-pacific': { label: '北太平洋（模擬）', region: 'north-pacific', hemisphere: 'north', depth: [100, 5000], spacing: 100000 },
  'south-pacific': { label: '南太平洋（模擬）', region: 'south-pacific', hemisphere: 'south', depth: [100, 5000], spacing: 100000 },
  'north-atlantic': { label: '北大西洋（模擬）', region: 'north-atlantic', hemisphere: 'north', depth: [100, 4500], spacing: 80000 },
  'south-atlantic': { label: '南大西洋（模擬）', region: 'south-atlantic', hemisphere: 'south', depth: [100, 4500], spacing: 80000 },
  bay: { label: '一般的な湾', region: 'japan', hemisphere: 'north' },
  island: { label: '島', region: 'generic', hemisphere: 'north' },
  channel: { label: '水路', region: 'generic', hemisphere: 'north' },
  open: { label: '外洋', region: 'generic', hemisphere: 'north' }
};

for (const [id, data] of Object.entries(TERRAIN_DATA)) {
  TERRAIN_PRESETS[id].label = TERRAIN_PRESETS[id].label.replace('（模擬）', '（ETOPO地形）');
  TERRAIN_PRESETS[id].bounds = data.bounds;
}

// Preserve the nearest source cell's land mask; interpolate only submerged
// elevations so tall coastal mountains cannot create an artificial deep coast.
export function sampleEtopo(data, x, y) {
  const gx = Math.max(0, Math.min(1, x)) * (data.width - 1);
  const gy = Math.max(0, Math.min(1, y)) * (data.height - 1);
  const at = (i, j) => data.elevation[j * data.width + i];
  if (at(Math.round(gx), Math.round(gy)) >= 0) return 0;
  const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
  let depth = 0, weights = 0;
  for (const [i, wx] of [[x0, 1 - tx], [Math.min(x0 + 1, data.width - 1), tx]]) {
    for (const [j, wy] of [[y0, 1 - ty], [Math.min(y0 + 1, data.height - 1), ty]]) {
      const z = at(i, j), weight = wx * wy;
      if (z < 0) { depth -= z * weight; weights += weight; }
    }
  }
  return depth / weights;
}

export function fitTerrainSpacing(grid) {
  const bounds = TERRAIN_DATA[grid.preset]?.bounds;
  if (!bounds) return;
  const latitude = (bounds.north + bounds.south) / 2 * Math.PI / 180;
  grid.dx = Math.round((bounds.east - bounds.west) * 111195 * Math.cos(latitude) / (grid.nx - 1));
  grid.dy = Math.round((bounds.north - bounds.south) * 111195 / (grid.ny - 1));
}

// Source-derived presets are clipped in metres, never stretched to min/max.
export function sampleTerrain(preset, x, y, min, max) {
  if (TERRAIN_DATA[preset]) {
    const depth = sampleEtopo(TERRAIN_DATA[preset], x, y);
    return depth > 0 ? Math.max(min, Math.min(max, depth)) : 0;
  }
  let wet = true, fraction = 0.15 + 0.7 * x + 0.15 * Math.sin(Math.PI * y);
  if (preset === 'uniform') return min;
  if (preset === 'bay') wet = x > 0.08 + 0.16 * Math.sin(Math.PI * y) && !(x > 0.78 && y > 0.78);
  if (preset === 'island') wet = (x - 0.52) ** 2 / 0.02 + (y - 0.5) ** 2 / 0.045 > 1;
  if (preset === 'channel') wet = y > 0.2 + 0.08 * Math.sin(x * 6) && y < 0.8 + 0.06 * Math.sin(x * 6);
  return wet ? min + (max - min) * Math.max(0, Math.min(1, fraction)) : 0;
}

export function applyTerrainPreset(config, id) {
  const preset = TERRAIN_PRESETS[id];
  if (!preset) throw new Error('Unknown terrain preset');
  Object.assign(config.grid, { preset: id, edits: {}, geoBounds: null, geoSource: null });
  config.rivers = [];
  config.wind = null;
  config.initial.painted = {}; config.initial.anchors = {};
  if (preset.depth) {
    [config.grid.minDepth, config.grid.maxDepth] = preset.depth;
    config.grid.dx = config.grid.dy = preset.spacing;
  }
  fitTerrainSpacing(config.grid);
  const south = preset.hemisphere === 'south';
  if (config.numerics.rotationMode === 'latitude') config.numerics.latitude = preset.bounds ? (preset.bounds.north + preset.bounds.south) / 2 : south ? -35 : 35;
  config.numerics.coriolisF0 = south ? -8e-5 : 8e-5;
  config.numerics.coriolisBeta = 2e-11;
  if (id.endsWith('pacific') || id.endsWith('atlantic')) {
    Object.assign(config.numerics, { windPattern: 'gyre', windX: south ? -0.1 : 0.1, windY: 0, dt: 60 });
    for (const boundary of Object.values(config.boundary)) boundary.mode = 'closed';
  } else if (id === 'california') {
    Object.assign(config.numerics, { windPattern: 'coastal', windX: 0, windY: -0.08, dt: 30 });
    for (const [side, boundary] of Object.entries(config.boundary)) boundary.mode = side === 'east' ? 'closed' : 'radiation';
  } else Object.assign(config.numerics, { windPattern: 'uniform', windX: 0, windY: 0 });
  if (south && config.initial.distribution === 'summer') config.initial.distribution = 'uniform';
}

// A top-face edit changes one vertical block; a side hit advances one horizontal
// cell to the selected block depth. ROMS bathymetry remains a height field.
export function terrainBlockEdits(grid, fields, p, tool, radius, hit) {
  const { nx, ny, minDepth, maxDepth, nz } = grid, out = {}, x = p % nx, y = Math.floor(p / nx);
  const block = maxDepth / nz;
  const depth = q => fields.mask[q] ? fields.h[q] : 0;
  for (let j = Math.max(0, y - radius + 1); j < Math.min(ny, y + radius); j++) for (let i = Math.max(0, x - radius + 1); i < Math.min(nx, x + radius); i++) {
    const q = j * nx + i;
    const current = depth(q);
    const side = hit && Math.abs(hit.normal?.y ?? 1) < 0.5 && Number.isFinite(hit.depth);
    const next = tool === 'dig' ? Math.min(maxDepth, side ? Math.max(current, (Math.floor(hit.depth / block) + 1) * block) : current + block)
      : tool === 'fill' ? Math.max(0, side ? Math.min(current, Math.floor(hit.depth / block) * block) : current - block)
      : tool === 'land' ? 0 : Math.max(Math.min(minDepth, block), current || block);
    if (next !== current) out[q] = next;
  }
  return out;
}
