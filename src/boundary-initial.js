import { fieldValue } from './view-section.js';

export function resolvedBoundaries(config, fields) {
  const resolved = { boundary: structuredClone(config.boundary) };
  syncBoundaryDefaults(resolved, fields);
  return resolved.boundary;
}

export function syncBoundaryDefaults(config, fields) {
  for (const side of ['west', 'east', 'south', 'north']) {
    const b = config.boundary[side];
    if (b.fromInitial !== true || !(['specified', 'open'].includes(b.mode) || b.mode === 'closed' && b.autoClosed)) continue;
    const { nx, ny } = fields, length = ['west', 'east'].includes(side) ? ny : nx;
    const wet = Array.from({ length }, (_, q) => side === 'west' ? q * nx : side === 'east' ? q * nx + nx - 1 : side === 'south' ? q : (ny - 1) * nx + q).some(p => fields.mask[p]);
    b.mode = wet ? (b.mode === 'open' ? 'open' : 'specified') : 'closed'; b.autoClosed = !wet;
    if (wet) seedBoundary(config, fields, side);
  }
}

export function seedBoundary(config, fields, side) {
  const b = config.boundary[side], { nx, ny, nz } = fields;
  const length = ['west', 'east'].includes(side) ? ny : nx;
  const index = q => side === 'west' ? q * nx : side === 'east' ? q * nx + nx - 1 : side === 'south' ? q : (ny - 1) * nx + q;
  const keys = ['temp', 'salt', 'u', 'v', ...Object.keys(fields.biology ?? {})];
  b.anchors = {}; b.painted = {};
  for (const key of keys) {
    b.painted[key] = Array.from({ length: nz }, () => ({}));
    for (let k = 0; k < nz; k++) {
      const values = [];
      for (let q = 0; q < length; q++) {
        const p = index(q); if (!fields.mask[p]) continue;
        const value = fieldValue(fields, key, p, k);
        b.painted[key][k][q] = value; values.push(value);
      }
      if (values.length) b.layers[k][key] = values.reduce((a, v) => a + v, 0) / values.length;
    }
  }
  const wet = Array.from({ length }, (_, q) => index(q)).filter(p => fields.mask[p]);
  b.painted.zeta = [Object.fromEntries(Array.from({ length }, (_, q) => [q, fields.zeta[index(q)]]))];
  b.zeta = wet.length ? wet.reduce((sum, p) => sum + fields.zeta[p], 0) / wet.length : 0;
  for (const key of ['u', 'v']) {
    const width = key === 'u' ? nx - 1 : nx, height = key === 'v' ? ny - 1 : ny;
    const alongLength = ['west', 'east'].includes(side) ? height : width;
    const at = q => side === 'west' ? q * width : side === 'east' ? q * width + width - 1 : side === 'south' ? q : (height - 1) * width + q;
    b.painted[key] = Array.from({ length: nz }, (_, k) => Object.fromEntries(Array.from({ length: alongLength }, (_, q) => [q, fields[key][k * width * height + at(q)]])));
    b.painted[key + 'bar'] = [Object.fromEntries(Array.from({ length: alongLength }, (_, q) => [q, fields[key + 'bar'][at(q)]]))];
    const wetFaces = Array.from({ length: alongLength }, (_, q) => q).filter(q => fields[key === 'u' ? 'maskU' : 'maskV'][at(q)]);
    const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    for (let k = 0; k < nz; k++) b.layers[k][key] = mean(wetFaces.map(q => b.painted[key][k][q]));
    b[key + 'bar'] = mean(wetFaces.map(q => b.painted[key + 'bar'][0][q]));
  }
  b.fromInitial = true;
}
