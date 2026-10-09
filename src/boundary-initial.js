import { fieldValue } from './view-section.js';

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
    b[key + 'bar'] = b.layers.reduce((sum, layer) => sum + layer[key], 0) / nz;
  }
  b.fromInitial = true;
}
