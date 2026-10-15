import { TERRAIN_DATA } from './data/terrain-etopo2022.js';
import { TSUGARU_ETOPO } from './data/terrain-tsugaru-etopo2022.js';

export const ETOPO_ENDPOINT = 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.json';
export const BUNDLED_ETOPO = { ...TERRAIN_DATA, 'tsugaru-15s': TSUGARU_ETOPO };
const step = 1 / 240;
export function coversEtopo(tile, lon, lat) {
  if (tile.coverageBounds) { const b=tile.coverageBounds; return lon>=b.west-1e-9 && lon<=b.east+1e-9 && lat>=b.south-1e-9 && lat<=b.north+1e-9; }
  const b = tile.bounds, dx = (b.east - b.west) / (tile.width - 1) / 2, dy = (b.north - b.south) / (tile.height - 1) / 2;
  return lon >= b.west - dx - 1e-9 && lon <= b.east + dx + 1e-9 && lat >= b.south - dy - 1e-9 && lat <= b.north + dy + 1e-9;
}
export function planEtopo(bounds) {
  const { west, east, south, north } = bounds ?? {};
  if (![west,east,south,north].every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || east <= west || north <= south || east - west > 180) throw new Error('ETOPOの対象範囲が不正です。日付変更線を跨ぐ領域は分割してください。');
  const parts = west < 0 && east > 0 ? [[west, 0], [0, east]] : [[west, east]];
  let stride = Math.max(1, Math.ceil(Math.sqrt((east - west) * (north - south) * 240 ** 2 / 350000)));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  let requests;
  do {
    requests = parts.map(([w,e]) => {
      const negative = w < 0, offset = negative ? 360 : 0;
      let x0 = clamp(Math.floor(((w + offset) / step - .5) / stride) * stride - stride, negative ? 43200 : 0, negative ? 86398 : 43198);
      const x1 = clamp(Math.ceil(((e + offset) / step - .5) / stride) * stride + stride, x0 + 1, negative ? 86399 : 43199);
      let y0 = clamp(Math.floor(((south + 90) / step - .5) / stride) * stride - stride, 0, 43198);
      const y1 = clamp(Math.ceil(((north + 90) / step - .5) / stride) * stride + stride, y0 + 1, 43199);
      x0 = x1 - Math.floor((x1 - x0) / stride) * stride;
      y0 = y1 - Math.floor((y1 - y0) / stride) * stride;
      // Include the end of each padded interval rather than truncating its coverage.
      const width = Math.floor((x1 - x0) / stride) + 1, height = Math.floor((y1 - y0) / stride) + 1;
      return { x0, x1, y0, y1, stride, width, height, offset, coverage: { west:w,east:e,south,north } };
    });
    if (requests.every(r => r.width >= 2 && r.height >= 2) && requests.reduce((sum,r) => sum + r.width * r.height,0) <= 400000) break;
    stride++;
    if (stride > 1000) throw new Error('ETOPOの対象範囲が大きすぎます。');
  } while (true);
  return requests;
}
export const etopoProxyPath = r => `/__webroms_etopo?y0=${r.y0}&y1=${r.y1}&x0=${r.x0}&x1=${r.x1}&stride=${r.stride}`;
export const etopoSourceUrl = r => `${ETOPO_ENDPOINT}?z[${r.y0}:${r.stride}:${r.y1}][${r.x0}:${r.stride}:${r.x1}]`;

export function parseEtopoRegion(document, request) {
  const table = document?.table;
  if (JSON.stringify(table?.columnNames) !== JSON.stringify(['latitude','longitude','z']) || table.rows?.length !== request.width * request.height) throw new Error('ETOPOの応答が不完全です。');
  const xs = Array.from({ length: request.width }, (_,i) => (request.x0 + i * request.stride + .5) / 240 - request.offset);
  const ys = Array.from({ length: request.height }, (_,j) => -90 + (request.y0 + j * request.stride + .5) / 240);
  const elevation = new Float32Array(xs.length * ys.length), seen = new Uint8Array(elevation.length);
  for (const row of table.rows) {
    if (!Array.isArray(row) || row.length !== 3 || !row.every(Number.isFinite) || Math.abs(row[2]) > 20000) throw new Error('ETOPOに欠測または不正な標高があります。');
    const x = row[1] - request.offset, i = Math.round((x - xs[0]) * 240 / request.stride), j = Math.round((row[0] - ys[0]) * 240 / request.stride), p = j * xs.length + i;
    if (i < 0 || i >= xs.length || j < 0 || j >= ys.length || Math.abs(xs[i] - x) > 1e-6 || Math.abs(ys[j] - row[0]) > 1e-6 || seen[p]) throw new Error('ETOPOの格子座標が一致しません。');
    elevation[p] = row[2]; seen[p] = 1;
  }
  return { width: xs.length, height: ys.length, bounds: { west: xs[0], east: xs.at(-1), south: ys[0], north: ys.at(-1) }, coverageBounds: request.coverage, edgeExtension: 'Nearest sample at global grid edges; no coordinate stretching', elevation, sourceUrl: etopoSourceUrl(request), resolutionArcSeconds: request.stride * 15 };
}

export async function resolveEtopo(grid, { fetcher = fetch, progress = () => {} } = {}) {
  const b = grid.geoBounds;
  if (!b) throw new Error('ETOPOの取得には地形の緯度経度が必要です。');
  const full = Object.entries(BUNDLED_ETOPO).filter(([,t]) => coversEtopo(t,b.west,b.south) && coversEtopo(t,b.east,b.north));
  const adequate = full.some(([,t]) => (t.bounds.east-t.bounds.west)/(t.width-1) <= Math.max(step,(b.east-b.west)/(grid.nx-1)/4) + 1e-9 && (t.bounds.north-t.bounds.south)/(t.height-1) <= Math.max(step,(b.north-b.south)/(grid.ny-1)/4) + 1e-9);
  if (adequate) return { tiles: {}, warning: null };
  try {
    const requests = planEtopo(b), tiles = {};
    for (const [i,r] of requests.entries()) {
      progress(`ETOPOを取得中… ${i+1}/${requests.length}（${r.stride*15}秒格子）`);
      const response = await fetcher(etopoProxyPath(r), { signal: AbortSignal.timeout(60000), cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      if (text.length > 48e6) throw new Error('応答サイズが上限を超えています。');
      const tile = parseEtopoRegion(JSON.parse(text),r);
      if (globalThis.crypto?.subtle) tile.sourceSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
      tiles[`downloaded-${i}`] = tile;
    }
    return { tiles, warning: null };
  } catch (error) {
    if (full.length) return { tiles: {}, warning: `ETOPOの地域データを取得できなかったため、粗い同梱データを使用しました（${error.message}）。海岸線を確認してください。` };
    throw new Error(`ETOPOを取得できず、この海域の陸海判定を生成できません（${error.message}）。インターネット接続を確認するか陸域ポリゴンを指定してください。`);
  }
}
