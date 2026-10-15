// Close one-cell breaks in the shallow contour raster, then label separated regions.
export function gridContourMask(lines, bounds, nx, ny, depth, connections) {
  const size = nx * ny, shallow = new Uint8Array(size), deep = new Uint8Array(size);
  const toGrid = ([x, y]) => [(x - bounds.west) / (bounds.east - bounds.west) * (nx - 1), (y - bounds.south) / (bounds.north - bounds.south) * (ny - 1)];
  const paint = (coordinates, target) => {
    for (let k = 1; k < coordinates.length; k++) {
      const a = toGrid(coordinates[k - 1]), b = toGrid(coordinates[k]);
      const count = Math.max(1, Math.ceil(2 * Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
      for (let s = 0; s <= count; s++) {
        const i = Math.max(0, Math.min(nx - 1, Math.round(a[0] + (b[0] - a[0]) * s / count)));
        const j = Math.max(0, Math.min(ny - 1, Math.round(a[1] + (b[1] - a[1]) * s / count)));
        target[j * nx + i] = 1;
      }
    }
  };
  for (const line of lines) paint(line.coordinates, line.depth === depth ? shallow : deep);
  if (!deep.some(Boolean)) return null;
  for (const connection of connections) paint([connection.from, connection.to], shallow);
  const neighborhood = (p, action) => {
    const x = p % nx, y = Math.floor(p / nx);
    for (let j = Math.max(0, y - 1); j <= Math.min(ny - 1, y + 1); j++) for (let i = Math.max(0, x - 1); i <= Math.min(nx - 1, x + 1); i++) action(j * nx + i);
  };
  const dilated = new Uint8Array(size), barrier = new Uint8Array(size);
  for (let p = 0; p < size; p++) if (shallow[p]) neighborhood(p, q => { dilated[q] = 1; });
  for (let p = 0; p < size; p++) { let full = true; neighborhood(p, q => { if (!dilated[q]) full = false; }); barrier[p] = +full; }
  const seen = new Uint8Array(size), cells = [];
  for (let p = 0; p < size; p++) if (!barrier[p] && !seen[p]) {
    const component = [p]; seen[p] = 1; let hasDeep = false;
    for (let head = 0; head < component.length; head++) {
      const at = component[head]; if (deep[at]) hasDeep = true;
      const x = at % nx;
      for (const q of [x ? at - 1 : -1, x < nx - 1 ? at + 1 : -1, at >= nx ? at - nx : -1, at < size - nx ? at + nx : -1]) if (q >= 0 && !barrier[q] && !seen[q]) { seen[q] = 1; component.push(q); }
    }
    if (!hasDeep) cells.push(...component);
  }
  // Contour cells themselves, including any deeper measured constraint, remain wet.
  return { cells: cells.filter(p => !deep[p] && !shallow[p]), barrierCells: barrier.reduce((sum, value) => sum + value, 0), radiusCells: 1 };
}
