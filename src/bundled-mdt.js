import { boundsOf, gridSignature } from './ocean-boundary.js';

export const mdtSignature = config => JSON.stringify([gridSignature(config), config.grid.edits ?? {}]);
let pending;
export async function loadBundledMdt() {
  pending ??= (async () => {
    const metaResponse = await fetch(new URL('./data/mdt/metadata.json', import.meta.url));
    if (!metaResponse.ok) throw new Error('同梱MDTの情報を読み込めません。');
    const metadata = await metaResponse.json();
    const response = await fetch(new URL('./data/mdt/atlas.bin', import.meta.url));
    if (!response.ok) throw new Error('同梱MDTを読み込めません。');
    const bytes = await response.arrayBuffer();
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
    if (metadata.format !== 'webroms-mdt-i16-v1' || bytes.byteLength !== metadata.nx * metadata.ny * 2 || hash !== metadata.sha256) throw new Error('同梱MDTの整合性を確認できません。');
    return { metadata, values: new DataView(bytes) };
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}

export function sampleMdt(atlas, lon, lat) {
  const { metadata: m, values } = atlas;
  const gy = (lat - m.y0) / m.dy;
  if (!Number.isFinite(lon) || !Number.isFinite(gy) || gy < 0 || gy > m.ny - 1) throw new Error('MDTの緯度範囲外です。');
  const gx = ((lon - m.x0) / m.dx % m.nx + m.nx) % m.nx;
  const i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j;
  const at = (x, y) => {
    if (y < 0 || y >= m.ny) return NaN;
    const raw = values.getInt16((y * m.nx + (x % m.nx + m.nx) % m.nx) * 2, true);
    return raw === m.missing ? NaN : raw * m.scale;
  };
  let sum = 0, weight = 0;
  for (const [x, wx] of [[i, 1 - u], [i + 1, u]]) for (const [y, wy] of [[j, 1 - v], [j + 1, v]]) {
    const z = at(x, y), w = wx * wy;
    if (Number.isFinite(z) && w > 0) { sum += z * w; weight += w; }
  }
  if (weight > 1e-12) return { value: sum / weight, partial: weight < 1 - 1e-8, distanceKm: 0 };
  throw new Error('MDTが欠測の海セルです。');
}

export function nearbyMdt(atlas, lon, lat, radiusKm = 50) {
  const { metadata: m, values } = atlas;
  const gx = ((lon - m.x0) / m.dx % m.nx + m.nx) % m.nx, gy = (lat - m.y0) / m.dy;
  const cos = Math.max(.001, Math.cos(lat * Math.PI / 180));
  const rx = Math.min(Math.ceil(radiusKm / (111.195 * cos * m.dx)), Math.ceil(m.nx / 2));
  const ry = Math.ceil(radiusKm / (111.195 * m.dy));
  let best = radiusKm, value = null;
  for (let y = Math.max(0, Math.floor(gy) - ry); y <= Math.min(m.ny - 1, Math.ceil(gy) + ry); y++) {
    for (let x = Math.floor(gx) - rx; x <= Math.ceil(gx) + rx; x++) {
      const distance = Math.hypot((x - gx) * m.dx * cos, (y - gy) * m.dy) * 111.195;
      if (distance > best) continue;
      const raw = values.getInt16((y * m.nx + (x % m.nx + m.nx) % m.nx) * 2, true);
      if (raw !== m.missing) { best = distance; value = raw * m.scale; }
    }
  }
  return value === null ? null : { value, distanceKm: best };
}

export function resampleMdt(atlas, config, fields) {
  const bounds = boundsOf(config);
  if (!bounds) throw new Error('同梱MDTの適用には地形の緯度経度が必要です。');
  const { nx, ny } = config.grid, row = {}, missing = [], queue = [];
  let partialCells = 0;
  for (let p = 0; p < nx * ny; p++) if (fields.mask[p]) {
    const lon = bounds.west + p % nx / (nx - 1) * (bounds.east - bounds.west);
    const lat = bounds.south + Math.floor(p / nx) / (ny - 1) * (bounds.north - bounds.south);
    try {
      const s = sampleMdt(atlas, lon, lat);
      row[p] = s.value; queue.push(p); partialCells += Number(s.partial);
    } catch (error) {
      if (!error.message.includes('欠測')) throw error;
      missing.push(p);
    }
  }
  const neighbors = p => [p % nx > 0 ? p - 1 : -1, p % nx < nx - 1 ? p + 1 : -1, p >= nx ? p - nx : -1, p < nx * (ny - 1) ? p + nx : -1].filter(q => q >= 0 && fields.mask[q]);
  // Initialize through connected water, then solve steady diffusion (Laplacian=0).
  for (let h = 0; h < queue.length; h++) for (const q of neighbors(queue[h])) if (!Object.hasOwn(row, q)) { row[q] = row[queue[h]]; queue.push(q); }
  const unresolved = missing.filter(p => !Object.hasOwn(row, p));
  const extrapolated = missing.filter(p => Object.hasOwn(row, p));
  const nearbyIndices = [], zeroIndices = [], remaining = new Set(unresolved);
  // Use one constant per unanchored component to avoid artificial internal slopes.
  while (remaining.size) {
    const component = [remaining.values().next().value]; remaining.delete(component[0]);
    for (let h = 0; h < component.length; h++) for (const q of neighbors(component[h])) if (remaining.delete(q)) component.push(q);
    let reference = null;
    for (const p of component) {
      const lon = bounds.west + p % nx / (nx - 1) * (bounds.east - bounds.west);
      const lat = bounds.south + Math.floor(p / nx) / (ny - 1) * (bounds.north - bounds.south);
      const candidate = nearbyMdt(atlas, lon, lat);
      if (candidate && (!reference || candidate.distanceKm < reference.distanceKm)) reference = candidate;
    }
    for (const p of component) { row[p] = reference?.value ?? 0; (reference ? nearbyIndices : zeroIndices).push(p); }
  }
  const equations = extrapolated.map(p => ({ p, terms: neighbors(p).map(q => [q, Math.abs(q - p) === 1 ? 1 / fields.dx ** 2 : 1 / fields.dy ** 2]) }));
  let residual = 0, iterations = 0;
  for (; iterations < 20000 && equations.length; iterations++) {
    residual = 0;
    for (const { p, terms } of equations) {
      const average = terms.reduce((s, [q, w]) => s + w * row[q], 0) / terms.reduce((s, [, w]) => s + w, 0);
      const change = average - row[p]; residual = Math.max(residual, Math.abs(change)); row[p] += 1.5 * change;
    }
    if (residual < 1e-8) break;
  }
  if (residual >= 1e-8) throw new Error('MDTの欠測補間が収束しません。格子や入力データを確認してください。');
  return { painted: { zeta: [row] }, metadata: { kind: 'mdt', datum: 'geoid', source: atlas.metadata.title, file: atlas.metadata.sourceFile, sourceSha256: atlas.metadata.sourceSha256, doi: atlas.metadata.sourceAttributes.DOI, period: '1993-2012', bundled: true, gridSignature: mdtSignature(config), interpolatedCells: extrapolated.length, interpolatedIndices: extrapolated, nearbyIndices, zeroIndices, unresolvedIndices: [], nearbyRadiusKm: 50, partialCells, iterations, residualMetres: residual, interpolation: 'Steady diffusion extrapolation (discrete Laplacian=0); bilinear source anchors fixed; no-flux land and exterior model edges; SOR 1.5; tolerance 1e-8 m; unanchored components use a uniform nearest atlas value within 50 km of the component, otherwise zero' } };
}
