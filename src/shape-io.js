import shp from '../vendor/shp.esm.js';
import writeShape from '../vendor/shpwrite.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';

const LOCAL = 'LOCAL_CS["WebROMS local grid",LOCAL_DATUM["Model origin",0],UNIT["metre",1],AXIS["East",EAST],AXIS["North",NORTH]]';
export function saveBlob(name, data) {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function gridGeometry(config) {
  const g = config.grid, b = g.geoBounds ?? TERRAIN_PRESETS[g.preset]?.bounds;
  return { bounds: b ?? null, rings: Array.from({ length: g.nx * g.ny }, (_, p) => {
    const i = p % g.nx, j = Math.floor(p / g.nx);
    const ring = (west, east, south, north) => [[west, south], [west, north], [east, north], [east, south], [west, south]];
    if (!b) return [ring((i - .5) * g.dx, (i + .5) * g.dx, (j - .5) * g.dy, (j + .5) * g.dy)];
    const cellWidth = (b.east - b.west) / (g.nx - 1), cellHeight = (b.north - b.south) / (g.ny - 1);
    const center = ((b.west + i * cellWidth + 180) % 360 + 360) % 360 - 180;
    const west = center - cellWidth / 2, east = center + cellWidth / 2;
    const south = Math.max(-90, b.south + (j - .5) * cellHeight), north = Math.min(90, b.south + (j + .5) * cellHeight);
    // Split date-line cells into two clockwise exterior rings in one Shape record.
    if (west < -180) return [ring(west + 360, 180, south, north), ring(-180, east, south, north)];
    if (east > 180) return [ring(west, 180, south, north), ring(-180, east - 360, south, north)];
    return [ring(west, east, south, north)];
  }) };
}
export function shapeFiles(name, rows, rings, geographic) {
  let result;
  writeShape(rows, 'POLYGON', rings, (error, data) => { if (error) throw error; result = data; });
  return Object.fromEntries(Object.entries(result).map(([extension, value]) => [name + '.' + extension, extension === 'prj' ? strToU8(geographic ? value : LOCAL) : new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength)]));
}
export async function exportTerrain(config, fields) {
  const geometry = gridGeometry(config), g = config.grid;
  const rows = geometry.rings.map((_, p) => ({ I: p % g.nx, J: Math.floor(p / g.nx), DEPTH_M: fields.mask[p] ? fields.h[p] : 0, WET: fields.mask[p] }));
  const files = shapeFiles('terrain', rows, geometry.rings, Boolean(geometry.bounds));
  files['webroms-grid.json'] = strToU8(JSON.stringify({ format: 'webroms-shape-v1', grid: { ...g, edits: {} } }));
  files['README.txt'] = strToU8('DEPTH_M: metres positive down; 0=land. I,J: zero-based cell indices. Grid metadata preserves the original lattice.');
  return zipSync(files);
}
function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export async function importTerrain(file, currentGrid) {
  if (file.size > 50e6) throw new Error('Shape ZIPは50 MB以下にしてください。');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => { total += entry.originalSize; if (total > 150e6) throw new Error('展開後のShapeが150 MBを超えています。'); return true; } });
  const names = Object.keys(files).filter(name => name.toLowerCase().endsWith('.shp'));
  if (names.length !== 1) throw new Error('ZIPには地形のShapeを1組だけ入れてください。');
  const base = names[0].slice(0, -4), find = ext => files[Object.keys(files).find(n => n.toLowerCase() === (base + ext).toLowerCase())];
  if (!find('.dbf') || !find('.prj')) throw new Error('.shp、.dbf、.prjを同じ名前でZIPに含めてください。');
  const metadata = files['webroms-grid.json'] ? JSON.parse(strFromU8(files['webroms-grid.json'])) : null;
  const own = metadata?.format === 'webroms-shape-v1';
  const geo = await shp({ shp: find('.shp'), dbf: find('.dbf'), ...(own ? {} : { prj: strFromU8(find('.prj')) }), cpg: find('.cpg') && strFromU8(find('.cpg')) });
  const g = { ...currentGrid, ...(own ? metadata.grid : {}), edits: {} };
  if (![g.nx, g.ny].every(n => Number.isInteger(n) && n >= 8 && n <= 100) || ![g.dx, g.dy].every(n => Number.isFinite(n) && n >= 10 && n <= 2500000)) throw new Error('Shapeの格子情報が範囲外です。');
  g.nz = currentGrid.nz;
  const features = geo.features.map(feature => {
    const props = Object.fromEntries(Object.entries(feature.properties).map(([k, v]) => [k.toUpperCase(), v]));
    const depth = props.DEPTH_M ?? props.DEPTH;
    if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0 || depth > 10000) throw new Error('数値属性DEPTH_M（またはDEPTH）が必要です。正の水深m、陸地0、上限10000 mです。');
    return { ...feature, props, depth };
  });
  if (own) {
    for (const { props: { I: i, J: j }, depth } of features) {
      if (![i, j].every(Number.isInteger) || i < 0 || j < 0 || i >= g.nx || j >= g.ny || Object.hasOwn(g.edits, j * g.nx + i)) throw new Error('Shapeの格子番号が重複または範囲外です。');
      g.edits[j * g.nx + i] = depth;
    }
    if (features.length !== g.nx * g.ny) throw new Error('格子セルが欠けています。');
  } else {
    if (features.some(f => !['Polygon', 'MultiPolygon'].includes(f.geometry?.type))) throw new Error('外部Shapeは水深属性付きPolygon/MultiPolygonに対応します。等深線は面へ変換してください。');
    const points = features.flatMap(f => f.geometry.coordinates.flat(f.geometry.type === 'Polygon' ? 1 : 2));
    const b = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
    for (const [x, y] of points) { b.west = Math.min(b.west, x); b.east = Math.max(b.east, x); b.south = Math.min(b.south, y); b.north = Math.max(b.north, y); }
    if (b.west < -180 || b.east > 180 || b.south < -90 || b.north > 90 || b.east <= b.west || b.north <= b.south) throw new Error('WGS84へ変換できる座標系が必要です。');
    g.geoBounds = b; g.preset = 'open';
    g.dx = 6371008.8 * Math.PI / 180 * (b.east - b.west) * Math.cos((b.north + b.south) * Math.PI / 360) / (g.nx - 1);
    g.dy = 6371008.8 * Math.PI / 180 * (b.north - b.south) / (g.ny - 1);
    if (![g.dx, g.dy].every(v => v >= 10 && v <= 2500000)) throw new Error('領域サイズが対応範囲外です。');
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const point = [b.west + i / (g.nx - 1) * (b.east - b.west), b.south + j / (g.ny - 1) * (b.north - b.south)];
      const match = features.find(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).some(rings => insideRing(point, rings[0]) && !rings.slice(1).some(r => insideRing(point, r))));
      g.edits[j * g.nx + i] = match?.depth ?? 0;
    }
  }
  const depths = Object.values(g.edits).filter(v => v > 0);
  if (!depths.length) throw new Error('有効な海セルがありません。');
  g.minDepth = Math.min(...depths); g.maxDepth = Math.max(...depths); g.geoSource = 'Imported ESRI Shapefile';
  return g;
}
