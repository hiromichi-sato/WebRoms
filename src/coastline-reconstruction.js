// Local weighted planes extend measured depths only near their support.
export function reconstructCoastline(grid, fields, land, maxDistance = 4) {
  const { nx, ny } = grid, size = nx * ny, metadata = grid.contourInterpolation;
  const observed = metadata?.observedDepths ?? (!metadata ? Object.fromEntries(
    Array.from({ length: size }, (_, p) => [p, fields.mask[p] ? fields.h[p] : null])
      .filter(([, depth]) => Number.isFinite(depth) && depth > 0)) : {});
  const nearest = new Int32Array(size).fill(-1), distance = new Uint16Array(size), queue = [];
  for (const [cell, depth] of Object.entries(observed)) {
    const p = Number(cell);
    if (Number.isInteger(p) && p >= 0 && p < size && Number.isFinite(depth) && depth >= 0) {
      nearest[p] = p; queue.push(p);
    }
  }
  const neighbors = p => [p % nx ? p - 1 : -1, p % nx < nx - 1 ? p + 1 : -1,
    p >= nx ? p - nx : -1, p < size - nx ? p + nx : -1];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    if (distance[p] >= maxDistance) continue;
    for (const q of neighbors(p)) if (q >= 0 && nearest[q] < 0) {
      nearest[q] = nearest[p]; distance[q] = distance[p] + 1; queue.push(q);
    }
  }
  const predictions = {}, fits = new Map();
  for (let p = 0; p < size; p++) {
    const anchor = nearest[p];
    if (anchor < 0 || anchor === p) continue;
    if (!fits.has(anchor)) {
      const ax = anchor % nx, ay = Math.floor(anchor / nx), samples = [];
      let sw = 0, sx = 0, sy = 0, sz = 0;
      for (let j = Math.max(0, ay - 4); j <= Math.min(ny - 1, ay + 4); j++)
        for (let i = Math.max(0, ax - 4); i <= Math.min(nx - 1, ax + 4); i++) {
          const z = observed[j * nx + i];
          if (!Number.isFinite(z) || z < 0) continue;
          const x = i - ax, y = j - ay, w = 1 / (1 + x * x + y * y);
          samples.push({ x, y, z, w }); sw += w; sx += w * x; sy += w * y; sz += w * z;
        }
      let fit = null;
      if (samples.length >= 3) {
        const mx = sx / sw, my = sy / sw, mz = sz / sw;
        let xx = 0, yy = 0, xy = 0, xz = 0, yz = 0;
        for (const { x, y, z, w } of samples) {
          xx += w * (x - mx) ** 2; yy += w * (y - my) ** 2;
          xy += w * (x - mx) * (y - my); xz += w * (x - mx) * (z - mz); yz += w * (y - my) * (z - mz);
        }
        const determinant = xx * yy - xy * xy;
        if (determinant > 1e-6 * (xx + yy) ** 2) {
          const a = (xz * yy - yz * xy) / determinant, b = (yz * xx - xz * xy) / determinant;
          const residual = Math.sqrt(samples.reduce((sum, s) => sum + s.w * (s.z - mz - a * (s.x - mx) - b * (s.y - my)) ** 2, 0) / sw);
          const slope = Math.hypot(a / grid.dx, b / grid.dy);
          if (slope > 1e-6 && slope <= 1 && residual <= Math.max(1, Math.abs(mz) * .25)) fit = { a, b, c: mz - a * mx - b * my, residual };
        }
      }
      fits.set(anchor, fit);
    }
    const fit = fits.get(anchor);
    if (!fit) continue;
    // An ETOPO land cell must be nearby; an isolated seamount is not an island.
    let coastal = false;
    const x = p % nx, y = Math.floor(p / nx);
    for (let j = Math.max(0, y - maxDistance); j <= Math.min(ny - 1, y + maxDistance) && !coastal; j++)
      for (let i = Math.max(0, x - maxDistance); i <= Math.min(nx - 1, x + maxDistance); i++) if (land[j * nx + i]) { coastal = true; break; }
    if (!coastal) continue;
    const depth = fit.c + fit.a * (x - anchor % nx) + fit.b * (y - Math.floor(anchor / nx));
    if (Number.isFinite(depth) && Math.abs(depth) > Math.max(.25, 2 * fit.residual)) predictions[p] = Math.max(-10000, Math.min(10000, depth));
  }
  return { observed, predictions, maxDistance };
}
