// Exact joins first, followed by bounded nearest-endpoint gap completion.
import { gridContourMask } from './grid-contour-mask.js';
export function shallowContourMask(lines, bounds, nx, ny, joinGapCells = 1.5) {
  if (!Number.isFinite(joinGapCells) || joinGapCells < 0 || joinGapCells > 5) throw new Error('等深線の接続距離は0〜5格子で指定してください。');
  const depth = Math.min(...lines.map(line => line.depth));
  const paths = lines.filter(line => line.depth === depth && line.coordinates.length >= 2).map(line => line.coordinates);
  const key = point => `${Math.round(point[0] * 1e7)},${Math.round(point[1] * 1e7)}`;
  const ends = new Map();
  paths.forEach((path, index) => {
    for (const point of [path[0], path.at(-1)]) { const k = key(point); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(index); }
  });
  const used = new Set(), rings = [], open = [], connections = [];
  const addRing = path => {
    const box = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
    for (const [x, y] of path) { box.west = Math.min(box.west, x); box.east = Math.max(box.east, x); box.south = Math.min(box.south, y); box.north = Math.max(box.north, y); }
    rings.push({ path, box });
  };
  for (let index = 0; index < paths.length; index++) {
    if (used.has(index)) continue;
    let path = paths[index].slice(); used.add(index);
    for (const prepend of [false, true]) {
      while (key(path[0]) !== key(path.at(-1))) {
        const end = prepend ? path[0] : path.at(-1), candidates = ends.get(key(end)) ?? [];
        const next = candidates.filter(candidate => !used.has(candidate));
        if (candidates.length !== 2 || next.length !== 1) break;
        const other = paths[next[0]]; used.add(next[0]);
        const oriented = key(other[0]) === key(end) ? other : other.slice().reverse();
        path = prepend ? oriented.slice(1).reverse().concat(path) : path.concat(oriented.slice(1));
      }
    }
    if (path.length >= 4 && key(path[0]) === key(path.at(-1))) {
      addRing(path);
    } else open.push(path);
  }
  const scaledDistance = (a, b) => Math.hypot((a[0] - b[0]) / (bounds.east - bounds.west) * (nx - 1), (a[1] - b[1]) / (bounds.north - bounds.south) * (ny - 1));
  const gapCompletionSkipped = open.length > 500;
  if (!gapCompletionSkipped && joinGapCells > 0) {
    for (;;) {
      let best = null, distance = joinGapCells;
      for (let i = 0; i < open.length; i++) for (let j = i; j < open.length; j++) {
        if (i === j && open[i].length < 4) continue;
        for (const a of [0, 1]) for (const b of [0, 1]) {
          if (i === j && (a !== 0 || b !== 1)) continue;
          const from = a ? open[i].at(-1) : open[i][0], to = b ? open[j].at(-1) : open[j][0];
          const d = scaledDistance(from, to);
          if (d <= distance) { distance = d; best = { i, j, a, b, from, to }; }
        }
      }
      if (!best) break;
      const { i, j, a, b, from, to } = best;
      connections.push({ from, to, distanceGridCells: distance });
      if (i === j) { addRing(open[i].concat([open[i][0]])); open.splice(i, 1); }
      else {
        const left = a ? open[i] : open[i].slice().reverse(), right = b ? open[j].slice().reverse() : open[j];
        open[i] = left.concat(right); open.splice(j, 1);
        if (key(open[i][0]) === key(open[i].at(-1))) { addRing(open[i]); open.splice(i, 1); }
      }
    }
  }
  const cells = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = bounds.west + i / (nx - 1) * (bounds.east - bounds.west), y = bounds.south + j / (ny - 1) * (bounds.north - bounds.south);
    if (rings.some(({ path, box }) => {
      if (x < box.west || x > box.east || y < box.south || y > box.north) return false;
      let inside = false;
      for (let a = 0, b = path.length - 1; a < path.length; b = a++) {
        const [ax, ay] = path[a], [bx, by] = path[b];
        if (ax === bx && ay === by) continue;
        const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
        if (Math.abs(cross) < 1e-12 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return false;
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      }
      return inside;
    })) cells.push(j * nx + i);
  }
  const raster = joinGapCells > 0 ? gridContourMask(lines, bounds, nx, ny, depth, connections) : null;
  return { depth, cells: raster?.cells ?? cells, gridMask: raster, rings: rings.length, openPaths: open.length, connections, joinGapCells, gapCompletionSkipped };
}
