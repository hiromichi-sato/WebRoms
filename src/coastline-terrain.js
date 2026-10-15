import { BUNDLED_ETOPO, coversEtopo } from './etopo-region.js';
import { TERRAIN_PRESETS, sampleEtopo } from './terrain-presets.js';
import { reconstructCoastline } from './coastline-reconstruction.js';
import { n03Classifier } from './n03-land.js';


function inside(point, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

export function coastlineTerrain(grid, fields, collection, { threshold = .5, etopo = true, source = '', maskSource = 'polygon', regionalTiles = {}, acquisitionWarning = null, preservedMask = null, n03 = null } = {}) {
  const ETOPO_TILES = { ...BUNDLED_ETOPO, ...regionalTiles };
  const bounds = grid.geoBounds ?? TERRAIN_PRESETS[grid.preset]?.bounds;
  if (!bounds) throw new Error('先に緯度経度のある地形を読み込むか、ETOPO地形を選択してください。');
  if (!(threshold > 0 && threshold <= 1)) throw new Error('陸地面積の判定率は0より大きく100%以下にしてください。');
  if (!['polygon', 'etopo'].includes(maskSource)) throw new Error('陸海判定の方法を選択してください。');
  if (maskSource === 'polygon' && !collection?.features?.length) throw new Error('陸域ポリゴンがありません。');
  let vertices = 0;
  const polygons = (maskSource === 'polygon' ? collection.features : []).flatMap(feature => {
    const geometry = feature.geometry;
    if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw new Error('陸域ポリゴンが必要です。線だけの海岸線はGISで陸域ポリゴンへ変換してください。');
    return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map(rings => {
      if (!rings.length) throw new Error('空の陸域ポリゴンがあります。');
      const box = { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity };
      for (const ring of rings) {
        if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error('陸域ポリゴンのリングが閉じていません。');
        for (const [x, y] of ring) {
          if (++vertices > 1000000) throw new Error('陸域ポリゴンは100万頂点以下にしてください。');
          if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90) throw new Error('陸域の座標をWGS84へ変換できません。');
          box.west = Math.min(box.west, x); box.east = Math.max(box.east, x); box.south = Math.min(box.south, y); box.north = Math.max(box.north, y);
        }
      }
      if (box.east - box.west > 180) throw new Error('日付変更線を跨ぐ陸域は分割してください。');
      return { rings, box };
    });
  });
  const overlap = polygons.filter(({ box: b }) => b.east >= bounds.west && b.west <= bounds.east && b.north >= bounds.south && b.south <= bounds.north);
  if (maskSource === 'polygon' && !overlap.length) throw new Error('陸域ポリゴンが地形の範囲と重なりません。座標系と領域を確認してください。');
  const { nx, ny } = grid, size = nx * ny, dx = (bounds.east - bounds.west) / (nx - 1), dy = (bounds.north - bounds.south) / (ny - 1);
  const land = new Uint8Array(size), values = new Float64Array(size), provenance = Array(size).fill('land');
  const data = Object.values(ETOPO_TILES).sort((a, b) => (a.bounds.east - a.bounds.west) / a.width - (b.bounds.east - b.bounds.west) / b.width);
  let checks = 0, etopoCells = 0, restoredCells = 0;
  const etopoSources = {};
  const maskTiles = new Set();
  const classify = maskSource === 'etopo' ? n03Classifier(n03) : null;
  const authoritative = new Int8Array(size).fill(-1);
  const etopoMaskCells = new Uint8Array(size);
  for (let p = 0; p < size; p++) {
    const lon = bounds.west + p % nx * dx, lat = bounds.south + Math.floor(p / nx) * dy;
    if (preservedMask?.[p] >= 0) {
      land[p] = !preservedMask[p];
      if (!land[p]) { values[p] = fields.h[p]; provenance[p] = 'input'; }
      continue;
    }
    const candidates = overlap.filter(({ box: b }) => b.east >= lon - dx / 2 && b.west <= lon + dx / 2 && b.north >= lat - dy / 2 && b.south <= lat + dy / 2);
    let count = 0, n03Samples = 0;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const point = [Math.max(bounds.west, Math.min(bounds.east, lon + (i - 1) * dx / 3)), Math.max(bounds.south, Math.min(bounds.north, lat + (j - 1) * dy / 3))];
      if (maskSource === 'etopo') {
        const knownLand = classify?.(...point);
        if (knownLand != null) { count += knownLand ? 1 : 0; n03Samples++; continue; }
        const tile = data.find(t => coversEtopo(t,point[0],point[1]));
        if (!tile) throw new Error('この領域は同梱ETOPOの範囲外です。陸域ポリゴンを読み込んでください。');
        const b = tile.bounds, x = Math.max(0, Math.min(tile.width-1,Math.round((point[0] - b.west) / (b.east - b.west) * (tile.width - 1)))), y = Math.max(0, Math.min(tile.height-1,Math.round((point[1] - b.south) / (b.north - b.south) * (tile.height - 1))));
        const elevation = tile.elevation[y * tile.width + x];
        if (!Number.isFinite(elevation)) throw new Error('ETOPOの陸海判定に欠測があります。陸域ポリゴンを読み込んでください。');
        maskTiles.add(Object.keys(ETOPO_TILES).find(key => ETOPO_TILES[key] === tile));
        etopoMaskCells[p] = 1;
        if (elevation >= 0) count++;
        continue;
      }
      if (candidates.some(({ rings }) => {
        checks += rings.reduce((sum, ring) => sum + ring.length, 0);
        if (checks > 50000000) throw new Error('陸域が複雑すぎます。GISで対象範囲に切り出すか簡略化してください。');
        return inside(point, rings[0]) && !rings.slice(1).some(ring => inside(point, ring));
      })) count++;
    }
    land[p] = count / 9 >= threshold;
    if (n03Samples === 9) authoritative[p] = land[p];
    if (land[p]) continue;
    const prior = fields.mask[p] ? fields.h[p] : grid.coastline?.baseDepths?.[p] ?? grid.contourInterpolation?.interpolatedDepths?.[p] ?? grid.contourInterpolation?.inferredLandDepths?.[p] ?? 0;
    if (prior > 0) { values[p] = prior; provenance[p] = grid.contourInterpolation && !Object.hasOwn(grid.contourInterpolation.observedDepths ?? {}, p) ? 'interpolated' : 'input'; if (!fields.mask[p]) restoredCells++; continue; }
    if (etopo) for (const tile of data) {
      const b = tile.bounds;
      if (!coversEtopo(tile,lon,lat)) continue;
      const depth = sampleEtopo(tile, (lon - b.west) / (b.east - b.west), (lat - b.south) / (b.north - b.south));
      if (Number.isFinite(depth) && depth > 0) { values[p] = Math.max(1, Math.min(10000, depth)); provenance[p] = 'etopo'; etopoSources[p] = Object.keys(ETOPO_TILES).find(key => ETOPO_TILES[key] === tile); etopoCells++; break; }
    }
  }
  let reconstruction = null;
  if (maskSource === 'etopo' && etopoMaskCells.some(Boolean)) {
    const maskPixelCells = Math.max(1, ...[...maskTiles].map(id => {
      const tile = ETOPO_TILES[id];
      return Math.max((tile.bounds.east - tile.bounds.west) / (tile.width - 1) / dx,
        (tile.bounds.north - tile.bounds.south) / (tile.height - 1) / dy);
    }));
    reconstruction = reconstructCoastline(grid, fields, land, Math.min(8, Math.max(2, Math.ceil(maskPixelCells))));
    for (const [cell, depth] of Object.entries(reconstruction.predictions)) {
      if (preservedMask?.[cell] >= 0 || !etopoMaskCells[cell] || authoritative[cell] >= 0) continue;
      land[cell] = depth <= 0 ? 1 : 0;
      values[cell] = depth > 0 ? Math.max(1, depth) : 0;
      provenance[cell] = depth > 0 ? 'coastal-extrapolation' : 'inferred-land';
    }
    for (const [cell, depth] of Object.entries(reconstruction.observed)) {
      if (preservedMask?.[cell] >= 0 || authoritative[cell] === 1) continue;
      land[cell] = 0; values[cell] = Math.max(1, depth); provenance[cell] = 'input';
    }
    etopoCells = provenance.filter(value => value === 'etopo').length;
    for (const cell of Object.keys(etopoSources)) if (provenance[cell] !== 'etopo') delete etopoSources[cell];
  }
  // Recompute only unobserved coastal gaps; measured wet cells remain fixed.
  const shoreGaps = new Uint8Array(size);
  if (classify && grid.contourInterpolation) for (let p=0;p<size;p++) {
    if (authoritative[p]!==0 || preservedMask?.[p]>=0 || Object.hasOwn(grid.contourInterpolation.observedDepths??{},p)) continue;
    const x=p%nx,y=Math.floor(p/nx);
    let coastal=false;
    for (let j=Math.max(0,y-2);j<=Math.min(ny-1,y+2)&&!coastal;j++) for(let i=Math.max(0,x-2);i<=Math.min(nx-1,x+2);i++) if(authoritative[j*nx+i]===1){coastal=true;break;}
    if(coastal){shoreGaps[p]=1;values[p]=0;provenance[p]='land';delete etopoSources[p];}
  }
  // Propagate depths through water only; never bridge land or fill isolated basins as land.
  const queue = [];
  for (let p = 0; p < size; p++) if (values[p] > 0) queue.push(p);
  let neighborCells = 0, fallbackCells = 0;
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head];
    for (const q of [p % nx ? p - 1 : -1, p % nx < nx - 1 ? p + 1 : -1, p >= nx ? p - nx : -1, p < size - nx ? p + nx : -1]) if (q >= 0 && !land[q] && !values[q]) { values[q] = values[p]; provenance[q] = 'neighbor'; neighborCells++; queue.push(q); }
  }
  for (let p = 0; p < size; p++) if (!land[p] && !values[p]) { values[p] = grid.minDepth; provenance[p] = 'assumed'; fallbackCells++; }
  let change = Infinity, iterations = 0;
  const wx = 1 / grid.dx ** 2, wy = 1 / grid.dy ** 2;
  for (; neighborCells && iterations < 2000 && change > .001; iterations++) {
    change = 0;
    for (let p = 0; p < size; p++) if (provenance[p] === 'neighbor') {
      let sum = 0, weight = 0;
      for (const [i, q] of [p % nx ? p - 1 : -1, p % nx < nx - 1 ? p + 1 : -1, p >= nx ? p - nx : -1, p < size - nx ? p + nx : -1].entries()) if (q >= 0 && (!land[q] || shoreGaps[p] && authoritative[q]===1)) { const w = i < 2 ? wx : wy; sum += w * values[q]; weight += w; }
      if (weight) { const next = sum / weight; change = Math.max(change, Math.abs(next - values[p])); values[p] = next; }
    }
  }
  for(let p=0;p<size;p++)if(!land[p])values[p]=Math.max(1,values[p]);
  etopoCells = provenance.filter(value=>value==='etopo').length;
  const wet = Array.from(values).filter(value => value > 0);
  if (!wet.length) throw new Error('陸域判定後に海セルがありません。領域や判定率を確認してください。');
  const result = { ...grid, geoBounds: { ...bounds }, preset: 'open', importedUncoveredCells: 0, edits: Object.fromEntries(Array.from(values, (value, p) => [p, value])), minDepth: Math.min(...wet), maxDepth: Math.max(...wet), geoSource: `${grid.geoSource ?? 'Terrain'}; ${maskSource === 'etopo' ? 'ETOPO land mask' : 'explicit land polygons'}` };
  delete result.coastlinePendingReason;
  const baseDepths = grid.coastline?.baseDepths ?? Object.fromEntries(Array.from(fields.h, (value, p) => [p, grid.contourInterpolation?.interpolatedDepths?.[p] ?? grid.contourInterpolation?.inferredLandDepths?.[p] ?? (fields.mask[p] ? value : 0)]));
  result.coastline = { source, threshold, sampling: '3x3 approximate land fraction; polygon exterior minus holes', etopoEnabled: etopo, etopoCells, etopoSources, restoredCells, neighborCells, fallbackCells, interpolation: 'Discrete Laplace on missing water cells; input and ETOPO fixed; no flux across land', iterations, converged: !neighborCells || change <= .001, landCells: land.reduce((sum, v) => sum + v, 0), provenance, baseDepths, verticalDatum: 'Not converted; verify source bathymetric datum versus EGM2008 before scientific use', nx, ny };
  Object.assign(result.coastline, { maskSource, maskTiles: [...maskTiles], sampling: maskSource === 'etopo' ? '3x3 approximate land fraction; nearest ETOPO elevation >= 0' : result.coastline.sampling });
  result.coastline.acquisitionWarning = acquisitionWarning;
  result.coastline.etopoUsed = etopoCells > 0 || etopoMaskCells.some(Boolean);
  if (classify) {
    result.coastline.landPolygons = { ...n03.metadata, appliedCells: Array.from(authoritative).filter(v=>v>=0).length,
      cellMask: Array.from(authoritative),
      coastalInterpolatedCells: shoreGaps.reduce((sum,v)=>sum+v,0),
      excludedDepthConstraints: Object.keys(grid.contourInterpolation?.observedDepths??{}).filter(p=>authoritative[p]===1).length,
      method: 'Union of administrative polygons; 3x3 land fraction; measured wet depths fixed; Laplace coastal gaps with zero-depth land edge (minimum wet depth 1 m); ETOPO outside coverage' };
    result.geoSource += '; N03 2026 land polygons';
    result.coastline.sampling = '3x3 land fraction; N03 polygon union in covered cells; ETOPO elsewhere';
  }
  if (reconstruction) result.coastline.reconstruction = {
    method: 'Measured depths fixed; local weighted depth planes; ETOPO coastal support; bounded extrapolation; no neural network',
    maxDistanceCells: reconstruction.maxDistance,
    observedDepths: reconstruction.observed,
    predictedDepths: reconstruction.predictions,
    inferredLandCells: provenance.filter(value => value === 'inferred-land').length,
    extrapolatedWaterCells: provenance.filter(value => value === 'coastal-extrapolation').length,
    warning: 'Estimated shoreline, not surveyed; verify tidal datum and coastal geometry before scientific use',
  };
  result.coastline.maskResolution = [...maskTiles].map(id => ({ id, longitudeArcSeconds: (ETOPO_TILES[id].bounds.east - ETOPO_TILES[id].bounds.west) / (ETOPO_TILES[id].width - 1) * 3600, latitudeArcSeconds: (ETOPO_TILES[id].bounds.north - ETOPO_TILES[id].bounds.south) / (ETOPO_TILES[id].height - 1) * 3600, sourceUrl: ETOPO_TILES[id].sourceUrl, sourceSha256: ETOPO_TILES[id].sourceSha256 }));
  if (result.contourInterpolation) result.contourInterpolation = { ...result.contourInterpolation, landMaskKnown: true, landInferenceEnabled: false, inferredLandCells: 0, shallowContourLandCells: 0, openShallowContourPaths: 0, syntheticContourConnections: [], gapCompletionSkipped: false, landInferenceMethod: classify ? 'N03 2026 polygon union; ETOPO outside coverage' : maskSource === 'etopo' ? 'ETOPO land mask' : 'Explicit land polygons' };
  return result;
}
