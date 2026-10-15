// Aggregate point/contour depth constraints, then fill gaps with discrete Laplace.
import { shallowContourMask } from './shallow-contour-mask.js';
export function contourTerrain(features, grid) {
  return sampledTerrain(features, grid, false);
}

export function pointTerrain(features, grid) {
  return sampledTerrain(features, grid, true);
}

export function setPointLandMask(grid, enabled) {
  const metadata = grid.contourInterpolation;
  if (metadata?.sourceGeometry !== 'points' || !metadata.inferredLandDepths) return;
  for (const [cell, depth] of Object.entries(metadata.inferredLandDepths)) {
    if (enabled && grid.edits[cell] === depth) grid.edits[cell] = 0;
    else if (!enabled && grid.edits[cell] === 0) grid.edits[cell] = depth;
  }
  metadata.landInferenceEnabled = enabled;
  metadata.inferredLandCells = Object.keys(metadata.inferredLandDepths).filter(p => grid.edits[p] === 0).length;
}

function sampledTerrain(features, grid, pointInput) {
  const label = pointInput ? '水深点' : '等深線';
  if (features.some(f => !Number.isFinite(f.depth) || f.depth < 0 || f.depth > 10000)) throw new Error('水深は有限の0〜10000 mで指定してください。');
  const lines = features.flatMap(f => {
    const coordinates = pointInput
      ? (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates).map(point => [point, point])
      : f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return coordinates.map(coordinates => ({ coordinates, depth: f.depth }));
  });
  const bounds = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
  let vertices = 0;
  for (const line of lines) for (const point of line.coordinates) {
    if (++vertices > 1000000) throw new Error(`${label}の頂点数が上限を超えています。点は50万点、線は100万頂点までです。`);
    const [x, y] = point;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -180 || x > 180 || y < -90 || y > 90) throw new Error(`${label}の座標をWGS84へ変換できません。`);
    bounds.west = Math.min(bounds.west, x); bounds.east = Math.max(bounds.east, x);
    bounds.south = Math.min(bounds.south, y); bounds.north = Math.max(bounds.north, y);
  }
  if (!(bounds.east > bounds.west && bounds.north > bounds.south) || bounds.east - bounds.west > 180) throw new Error(`${label}の範囲が不正です。日付変更線をまたぐデータは分割してください。`);
  const { nx, ny } = grid, size = nx * ny;
  const dx = 6371008.8 * Math.PI / 180 * (bounds.east - bounds.west) * Math.cos((bounds.north + bounds.south) * Math.PI / 360) / (nx - 1);
  const dy = 6371008.8 * Math.PI / 180 * (bounds.north - bounds.south) / (ny - 1);
  if (![dx, dy].every(v => v >= 10 && v <= 2500000)) throw new Error(`${label}の領域サイズが対応範囲外です。`);
  const sums = new Float64Array(size), counts = new Uint32Array(size);
  const toGrid = ([x, y]) => [(x - bounds.west) / (bounds.east - bounds.west) * (nx - 1), (y - bounds.south) / (bounds.north - bounds.south) * (ny - 1)];
  let samples = 0;
  for (const line of lines) for (let k = 1; k < line.coordinates.length; k++) {
    const a = toGrid(line.coordinates[k - 1]), b = toGrid(line.coordinates[k]);
    const steps = Math.max(1, Math.ceil(2 * Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
    for (let s = 0; s <= steps; s++) {
      if (++samples > 4000000) throw new Error(`${label}が複雑すぎます。データを間引いてください。`);
      const i = Math.max(0, Math.min(nx - 1, Math.round(a[0] + (b[0] - a[0]) * s / steps)));
      const j = Math.max(0, Math.min(ny - 1, Math.round(a[1] + (b[1] - a[1]) * s / steps)));
      const p = j * nx + i; sums[p] += line.depth; counts[p]++;
    }
  }
  const values = new Float64Array(size), visited = new Uint8Array(size), queue = [];
  for (let p = 0; p < size; p++) if (counts[p]) { values[p] = sums[p] / counts[p]; visited[p] = 1; queue.push(p); }
  const constraints = queue.length;
  if (!constraints) throw new Error(`水深を持つ有効な${label}がありません。`);
  const low = Math.min(...queue.map(p => values[p])), high = Math.max(...queue.map(p => values[p]));
  const neighbors = p => [p % nx ? p - 1 : -1, p % nx < nx - 1 ? p + 1 : -1, p >= nx ? p - nx : -1, p < size - nx ? p + nx : -1];
  const distance = new Uint16Array(size);
  for (let head = 0; head < queue.length; head++) for (const q of neighbors(queue[head])) if (q >= 0 && !visited[q]) { values[q] = values[queue[head]]; distance[q] = distance[queue[head]] + 1; visited[q] = 1; queue.push(q); }
  const wx = 1 / (dx * dx), wy = 1 / (dy * dy);
  let change = Infinity, iterations = 0;
  for (; iterations < 5000 && change > .001; iterations++) {
    change = 0;
    for (let p = 0; p < size; p++) if (!counts[p]) {
      let sum = 0, weight = 0;
      for (const [index, q] of neighbors(p).entries()) if (q >= 0) { const w = index < 2 ? wx : wy; sum += values[q] * w; weight += w; }
      const next = Math.max(low, Math.min(high, sum / weight)); change = Math.max(change, Math.abs(next - values[p])); values[p] = next;
    }
  }
  // Bathymetry alone is not a land mask: retain even zero-depth contours as water.
  const shallowFloor = 1;
  let shallowCells = 0;
  for (let p = 0; p < size; p++) if (values[p] < shallowFloor) { values[p] = shallowFloor; shallowCells++; }
  const inferredLandDepths = {};
  if (pointInput) {
    // Only outside-connected gaps are candidates, never observed cells or enclosed gaps.
    const outside = [], seen = new Uint8Array(size);
    for (let p = 0; p < size; p++) if (!counts[p] && (p < nx || p >= size - nx || p % nx === 0 || p % nx === nx - 1)) { seen[p] = 1; outside.push(p); }
    for (let head = 0; head < outside.length; head++) for (const q of neighbors(outside[head])) if (q >= 0 && !seen[q] && !counts[q]) { seen[q] = 1; outside.push(q); }
    for (const p of outside) if (distance[p] > 1) inferredLandDepths[p] = values[p];
  }
  const wet = Array.from(values);
  const result = { ...grid, preset: 'open', geoBounds: bounds, dx, dy, edits: Object.fromEntries(Array.from(values, (v, p) => [p, v])), minDepth: Math.min(...wet), maxDepth: Math.max(...wet), importedUncoveredCells: 0,
    geoSource: pointInput ? 'Shapefile depth points; cell-average / discrete Laplace interpolation' : 'Shapefile contours; discrete Laplace interpolation', contourInterpolation: { sourceGeometry: pointInput ? 'points' : 'contours', sourceCount: pointInput ? lines.length : features.length, method: pointInput ? 'cell-average depth points; discrete Laplace for empty cells; nearest initialization; no-flow outer edges' : 'discrete Laplace; rasterized fixed depth constraints; nearest initialization; no-flow outer edges', landMaskKnown: false, shallowFloorMetres: shallowFloor, shallowCells, constraints, filledCells: size - constraints, iterations, lastChangeMetres: change, toleranceMetres: .001, converged: change <= .001 } };
  if (pointInput) {
    Object.assign(result.contourInterpolation, { inferredLandDepths, landInferenceMethod: 'Outside-connected unobserved cells farther than one 4-neighbor grid step from observed cells', landInferenceBufferCells: 1 });
    setPointLandMask(result, true);
  } else {
    const mask = shallowContourMask(lines, bounds, nx, ny, grid.contourJoinGapCells ?? 1.5);
    for (const p of mask.cells) result.edits[p] = 0;
    Object.assign(result.contourInterpolation, { shallowContourDepthMetres: mask.depth, shallowContourRings: mask.rings, openShallowContourPaths: mask.openPaths, shallowContourLandCells: mask.cells.length, syntheticContourConnections: mask.connections, contourJoinGapCells: mask.joinGapCells, gapCompletionSkipped: mask.gapCompletionSkipped, gridMaskRadiusCells: mask.gridMask?.radiusCells ?? 0, landInferenceMethod: mask.gridMask ? 'Shallow-contour raster with one-cell morphological closing; regions without deeper contour constraints inferred as land' : 'Interior of minimum-depth contours after exact joins and bounded nearest-endpoint gap completion' });
  }
  return result;
}
