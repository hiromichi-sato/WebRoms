// Water is connected by shared edges, matching the ROMS wet-cell mask.
export function isolatedWaterCells(fields) {
  const { nx, ny, mask } = fields, visited = new Uint8Array(mask.length), components = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || visited[seed]) continue;
    const cells = [seed]; visited[seed] = 1; let exterior = false;
    for (let head = 0; head < cells.length; head++) {
      const p = cells[head], i = p % nx, j = Math.floor(p / nx);
      exterior ||= i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      for (const q of [i > 0 ? p - 1 : -1, i < nx - 1 ? p + 1 : -1, j > 0 ? p - nx : -1, j < ny - 1 ? p + nx : -1]) {
        if (q >= 0 && mask[q] && !visited[q]) { visited[q] = 1; cells.push(q); }
      }
    }
    components.push({ cells, exterior });
  }
  const largest = components.reduce((best, c) => !best || c.cells.length > best.cells.length ? c : best, null);
  const open = components.some(c => c.exterior);
  return components.filter(c => open ? !c.exterior : c !== largest).flatMap(c => c.cells);
}
