import contours from '../vendor/contours.js';

export function terrainContours(config, fields) {
  const { nx, ny, h, mask } = fields, wet = Array.from(h).filter((_, p) => mask[p]);
  const min = Math.min(...wet), max = Math.max(...wet), range = max - min;
  if (!wet.length || range < 1e-8) return { features: [], interval: 0, levels: [] };
  const rough = range / 12, power = 10 ** Math.floor(Math.log10(rough)), interval = [1, 2, 5, 10].map(v => v * power).find(v => v >= rough);
  const levels = [];
  for (let depth = Math.ceil(min / interval) * interval; depth < max - 1e-8; depth += interval) if (depth > min + 1e-8) levels.push(Number(depth.toPrecision(12)));
  const raster = Array.from(h, (v, p) => mask[p] ? v : NaN), features = [];
  const b = config.grid.geoBounds;
  const point = ([x, y]) => b ? [b.west + (x - .5) / (nx - 1) * (b.east - b.west), b.south + (y - .5) / (ny - 1) * (b.north - b.south)] : [(x - .5) * fields.dx, (y - .5) * fields.dy];
  const add = (path, depth) => {
    if (path.length < 2) return;
    let piece = [];
    const finish = () => { if (piece.length > 1) features.push({ depth, coordinates: piece }); };
    for (const p of path.map(point)) {
      if (b) p[0] = ((p[0] + 180) % 360 + 360) % 360 - 180;
      if (piece.length && Math.abs(p[0] - piece.at(-1)[0]) > 180 && b) {
        const prev = piece.at(-1), unwrapped = p[0] + (p[0] < prev[0] ? 360 : -360), edge = prev[0] >= 0 ? 180 : -180;
        const lat = prev[1] + (p[1] - prev[1]) * (edge - prev[0]) / (unwrapped - prev[0]);
        piece.push([edge, lat]); finish(); piece = [[-edge, lat]];
      }
      piece.push(p);
    }
    finish();
  };
  for (const contour of contours().size([nx, ny]).thresholds(levels)(raster)) for (const polygon of contour.coordinates) for (const ring of polygon) {
    let path = [];
    for (let n = 1; n < ring.length; n++) {
      const a = ring[n - 1], b = ring[n], i = Math.floor((a[0] + b[0]) / 2 - .5), j = Math.floor((a[1] + b[1]) / 2 - .5), p = j * nx + i;
      // Keep only genuine wet-grid isolines; discard artificial polygon closure edges.
      if (i >= 0 && i < nx - 1 && j >= 0 && j < ny - 1 && [p, p + 1, p + nx, p + nx + 1].every(q => mask[q])) {
        if (!path.length) path.push(a); path.push(b);
      } else { add(path, contour.value); path = []; }
    }
    add(path, contour.value);
  }
  return { features, interval, levels };
}
