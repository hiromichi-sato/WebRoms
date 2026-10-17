import writeShape from '../vendor/shpwrite.js';
import { zipSync, unzipSync, strToU8, strFromU8 } from '../vendor/fflate.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';
import { terrainContours } from './terrain-contours.js';
import { terrainNetcdf } from './terrain-netcdf.js';
import { contourTerrain, pointTerrain } from './contour-terrain.js';
import { JODC_TERRAIN_FILE,jeggTerrain } from './jodc-terrain.js';
const shp = async options => (await import('../vendor/shp.esm.js')).default(options);

const LOCAL = 'LOCAL_CS["WebROMS local grid",LOCAL_DATUM["Model origin",0],UNIT["metre",1],AXIS["East",EAST],AXIS["North",NORTH]]';
export async function readShapeFiles(input) {
  const selected = Array.isArray(input) || typeof input?.length === 'number' ? Array.from(input) : [input];
  if (!selected.length || selected.some(file => !file?.arrayBuffer)) throw new Error('Shapefile ZIP、または同じ名前の.shp・.dbf・.prjを選択してください。');
  if (selected.reduce((sum, file) => sum + file.size, 0) > 50e6) throw new Error('Shapefileファイルは合計50 MB以下にしてください。');
  const archives = selected.filter(file => /\.zip$/i.test(file.name));
  if (archives.length && selected.length !== 1) throw new Error('ZIPは1つだけ選択してください。.shp等との混在はできません。');
  if (archives.length) {
    let total = 0;
    try { return unzipSync(new Uint8Array(await archives[0].arrayBuffer()), { filter: entry => { total += entry.originalSize; if (total > 150e6) throw new Error('展開後のShapefileが150 MBを超えています。'); return true; } }); }
    catch (error) { if (total > 150e6) throw error; throw new Error('ZIPを展開できません。.shpの拡張子を.zipに変えるだけでは読み込めません。関連ファイルを実際にZIPに圧縮してください。'); }
  }
  const files = {};
  for (const file of selected) {
    if (!/\.(shp|shx|dbf|prj|cpg)$/i.test(file.name)) throw new Error('Shapefileの関連ファイル（.shp・.dbf・.prj・.shx・.cpg）を選択してください。');
    if (Object.keys(files).some(name => name.toLowerCase() === file.name.toLowerCase())) throw new Error('同じ名前のファイルが重複しています。');
    files[file.name] = new Uint8Array(await file.arrayBuffer());
  }
  const shapeNames = Object.keys(files).filter(name => /\.shp$/i.test(name));
  if (shapeNames.length !== 1) throw new Error('地形の.shpを1つと、その関連ファイルを選択してください。');
  const name = shapeNames[0], bytes = files[name], view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 100 || view.getInt32(0) !== 9994 || view.getInt32(28, true) !== 1000) throw new Error('有効なShapefileではありません。');
  const base = name.slice(0, -4), missing = ['.dbf', '.prj'].filter(ext => !Object.keys(files).some(n => n.toLowerCase() === (base + ext).toLowerCase()));
  if (missing.length) {
    const line = [3, 13, 23].includes(view.getInt32(32, true));
    throw new Error(`${name}はZIPではなく${line ? '等深線などの線' : 'Shapefileの形状'}データです。${missing.map(ext => base + ext).join('、')}も一緒に選択してください。${line ? '水深は通常.dbfのDEPTH_M／DEPTH属性にあります。関連ファイルが揃えば等深線から地形を補間します。' : ''}`);
  }
  return files;
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
    // Split date-line cells into two clockwise exterior rings in one Shapefile record.
    if (west < -180) return [ring(west + 360, 180, south, north), ring(-180, east, south, north)];
    if (east > 180) return [ring(west, 180, south, north), ring(-180, east - 360, south, north)];
    return [ring(west, east, south, north)];
  }) };
}
export function shapeFiles(name, rows, rings, geographic, type = 'POLYGON') {
  let result;
  const empty = rows.length === 0;
  writeShape(empty ? [{ DEPTH_M: 0 }] : rows, type, empty ? [[[0, 0], [0, 0]]] .map(path => [path]) : rings, (error, data) => { if (error) throw error; result = data; });
  const files = Object.fromEntries(Object.entries(result).map(([extension, value]) => [name + '.' + extension, extension === 'prj' ? strToU8(geographic ? value : LOCAL) : new Uint8Array(value.buffer, value.byteOffset ?? 0, value.byteLength)]));
  if (empty) {
    for (const ext of ['shp', 'shx']) { files[name + '.' + ext] = files[name + '.' + ext].slice(0, 100); new DataView(files[name + '.' + ext].buffer).setInt32(24, 50); }
    const original = files[name + '.dbf'], header = new DataView(original.buffer, original.byteOffset).getUint16(8, true), data = original.slice(0, header + 1);
    new DataView(data.buffer).setUint32(4, 0, true); data[header] = 0x1a; files[name + '.dbf'] = data;
  }
  files[name + '.cpg'] = strToU8('UTF-8');
  return files;
}
export async function exportTerrain(config, fields) {
  const geometry = gridGeometry(config), g = config.grid;
  const rows = geometry.rings.map((_, p) => ({ I: p % g.nx, J: Math.floor(p / g.nx), DEPTH_M: fields.mask[p] ? fields.h[p] : 0, WET: fields.mask[p] }));
  const files = shapeFiles('terrain', rows, geometry.rings, Boolean(geometry.bounds));
  files['roms_grd.nc'] = await terrainNetcdf(config, fields, geometry.bounds);
  const contourConfig = { ...config, grid: { ...g, geoBounds: geometry.bounds } }, contour = terrainContours(contourConfig, fields);
  Object.assign(files, shapeFiles('depth_contours', contour.features.map(f => ({ DEPTH_M: f.depth })), contour.features.map(f => [f.coordinates]), Boolean(geometry.bounds), 'POLYLINE'));
  files['contour-levels.csv'] = strToU8('DEPTH_M\n' + contour.levels.join('\n'));
  files['webroms-grid.json'] = strToU8(JSON.stringify({ format: 'webroms-shape-v1', grid: { ...g, edits: {} } }));
  files['README.txt'] = strToU8(`QGIS: extract the ZIP and open terrain.shp (grid polygons) and depth_contours.shp (isobaths). Keep .shx, .dbf, .prj and .cpg next to each .shp.\nDEPTH_M: metres positive down; terrain depth 0=land, WET=0/1; I,J are zero-based.\nContours are interpolated from the edited model grid, not original survey data. Interval: ${contour.interval} m. Features: ${contour.features.length}. Uniform or insufficient wet grids can produce an empty contour layer. Land and artificial domain closure edges are excluded.\nCRS: ${geometry.bounds ? 'WGS84 longitude/latitude' : 'local model metres; not georeferenced, do not assign WGS84'}.\nwebroms-grid.json preserves the lattice for WebROMS reimport. Choose the whole ZIP when reimporting; the contour layer is not a bathymetry input.\n`);
  files['README.txt'] = strToU8(strFromU8(files['README.txt']) + 'roms_grd.nc: conventional ROMS classic NetCDF grid, with h, masks, Cartesian metrics and staggered coordinates. Geographic coordinates are included only for located terrain. This grid alone is not a complete ROMS experiment configuration.\n');
  return zipSync(files);
}
export async function exportSeaLevel(config, fields) {
  const geometry = gridGeometry(config);
  if (!geometry.bounds) throw new Error('海面高度の保存には地形の緯度経度が必要です。');
  const rows = geometry.rings.map((_, p) => ({ I: p % fields.nx, J: Math.floor(p / fields.nx), WET: fields.mask[p], ZETA_M: fields.zeta[p] }));
  const files = shapeFiles('sea_level', rows, geometry.rings, true);
  const { default: createRoms } = await import('../runtime/roms.js');
  const { resultNetcdf } = await import('./results-export.js');
  const runtime = await createRoms({ print() {}, printErr() {} });
  files['sea_level.nc'] = resultNetcdf(runtime, config, [{ time: 0, state: fields }], { surfaceOnly: true, initial: true });
  files['webroms-sea-level.json'] = strToU8(JSON.stringify({ format: 'webroms-sea-level-v1', datum: config.ocean?.seaLevel?.datum ?? 'model-reference', kind: config.ocean?.seaLevel?.kind ?? 'model', tideIncluded: false, source: config.ocean?.seaLevel?.source ?? 'WebROMS initial surface', processing: config.ocean?.seaLevel ?? null }));
  return zipSync(files);
}
export async function importSeaLevel(file, config, fields) {
  if (file.size > 50e6) throw new Error('Shapefile ZIPは50 MB以下にしてください。');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => { total += entry.originalSize; if (total > 150e6) throw new Error('展開後のShapefileが150 MBを超えています。'); return true; } });
  const names = Object.keys(files).filter(n => n.toLowerCase().endsWith('.shp'));
  if (names.length !== 1) throw new Error('海面高度のShapefileを1組入れてください。');
  const base = names[0].slice(0, -4), find = ext => files[Object.keys(files).find(n => n.toLowerCase() === (base + ext).toLowerCase())];
  if (!find('.prj') || !find('.dbf')) throw new Error('座標系.prjと属性.dbfが必要です。');
  const metadata = files['webroms-sea-level.json'] ? JSON.parse(strFromU8(files['webroms-sea-level.json'])) : null;
  if (!metadata?.datum || !['mdt', 'adt', 'model'].includes(metadata.kind) || metadata.tideIncluded !== false) throw new Error('webroms-sea-level.jsonにdatum、kind、tideIncluded=falseを明示してください。');
  const geo = await shp({ shp: find('.shp'), dbf: find('.dbf'), prj: strFromU8(find('.prj')) });
  const b = gridGeometry(config).bounds;
  if (!b) throw new Error('地形に緯度経度が必要です。');
  const features = geo.features.map(f => {
    const v = f.properties.ZETA_M ?? f.properties.MDT_M ?? f.properties.ADT_M;
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 20 || !['Polygon', 'MultiPolygon'].includes(f.geometry?.type)) throw new Error('水位m属性 ZETA_M / MDT_M / ADT_M を持つポリゴンが必要です。');
    return { ...f, value: v };
  });
  const zeta = {};
  for (let p = 0; p < fields.mask.length; p++) if (fields.mask[p]) {
    const point = [b.west + p % fields.nx / (fields.nx - 1) * (b.east - b.west), b.south + Math.floor(p / fields.nx) / (fields.ny - 1) * (b.north - b.south)];
    const match = features.find(f => f.properties.WET !== 0 && (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).some(rings => insideRing(point, rings[0]) && !rings.slice(1).some(r => insideRing(point, r))));
    if (!match) throw new Error(`海面高度Shapefileが海セル ${p} を覆っていません。`);
    zeta[p] = match.value;
  }
  return { painted: { zeta: [zeta] }, metadata };
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
  const selected=Array.isArray(file)?file:[file];
  if(selected.length&&selected.every(f=>JODC_TERRAIN_FILE.test(f.name)||/\.zip$/i.test(f.name))&&(selected.length>1||! /\.zip$/i.test(selected[0].name))) {
    if(selected.reduce((sum,f)=>sum+f.size,0)>50e6)throw new Error('地形ファイルは合計50 MB以下にしてください。');
    const texts=[];let expanded=0;for(const f of selected) {
      const bytes=new Uint8Array(await f.arrayBuffer());
      if(/\.zip$/i.test(f.name)) {
        const archive=unzipSync(bytes,{filter:entry=>{expanded+=entry.originalSize;if(expanded>150e6)throw new Error('展開後の地形データが合計150 MBを超えています。');return true;}});
        if(Object.keys(archive).some(name=>/\.shp$/i.test(name)))throw new Error('複数ZIPの読み込みはJDOSSデータ専用です。Shapefile ZIPは1つずつ指定してください。');
        const names=Object.keys(archive).filter(name=>JODC_TERRAIN_FILE.test(name)&&!/(readme|license|format)/i.test(name)&&!name.startsWith('__MACOSX/'));
        if(!names.length)throw new Error(`${f.name}にJ-EGG500テキストがありません。`);
        for(const name of names){const body=archive[name],text=/\.gz$/i.test(name)?await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).text():strFromU8(body);texts.push({name:`${f.name}/${name}`,text});}
        continue;
      }
      const text=/\.gz$/i.test(f.name)?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text():strFromU8(bytes);
      if(text.length>150e6)throw new Error('展開後の地形データが150 MBを超えています。');
      texts.push({name:f.name,text});
    }if(texts.reduce((sum,file)=>sum+file.text.length,0)>150e6)throw new Error('展開後の地形データが合計150 MBを超えています。');const result=jeggTerrain(texts,currentGrid);result.jodcSource.selectedFiles=selected.map(f=>f.name);return result;
  }
  const files = await readShapeFiles(file);
  if(!Object.keys(files).some(name=>/\.shp$/i.test(name))) {
    const names=Object.keys(files).filter(name=>JODC_TERRAIN_FILE.test(name)&&!/(readme|license|format)/i.test(name)&&!name.startsWith('__MACOSX/'));
    if(names.length){const result=jeggTerrain(names.map(name=>({name,text:strFromU8(files[name])})),currentGrid);result.jodcSource.selectedFiles=selected.map(f=>f.name);return result;}
  }
  const metadata = files['webroms-grid.json'] ? JSON.parse(strFromU8(files['webroms-grid.json'])) : null;
  const own = metadata?.format === 'webroms-shape-v1';
  const names = Object.keys(files).filter(name => name.toLowerCase().endsWith('.shp') && (!own || /(^|\/)terrain\.shp$/i.test(name)));
  if (names.length !== 1) throw new Error('ZIPには地形のShapefileを1組だけ入れてください。');
  const base = names[0].slice(0, -4), find = ext => files[Object.keys(files).find(n => n.toLowerCase() === (base + ext).toLowerCase())];
  if (!find('.dbf') || !find('.prj')) throw new Error('.shp、.dbf、.prjを同じ名前でZIPに含めてください。');
  const geo = await shp({ shp: find('.shp'), dbf: find('.dbf'), ...(own ? {} : { prj: strFromU8(find('.prj')) }), cpg: find('.cpg') && strFromU8(find('.cpg')) });
  const g = { ...currentGrid, ...(own ? metadata.grid : {}), edits: {} };
  g.landMaskProvided = own;
  if(!own){delete g.domainCrop;delete g.terrainResampling;}
  if (!own) { delete g.contourInterpolation; delete g.importedUncoveredCells; delete g.coastline; delete g.coastlinePendingReason; }
  if (![g.nx, g.ny].every(n => Number.isInteger(n) && n >= 8 && n <= 100) || ![g.dx, g.dy].every(n => Number.isFinite(n) && n >= 10 && n <= 2500000)) throw new Error('Shapefileの格子情報が範囲外です。');
  g.nz = currentGrid.nz;
  const features = geo.features.map(feature => {
    const props = Object.fromEntries(Object.entries(feature.properties).map(([k, v]) => [k.toUpperCase(), v]));
    const depth = props.DEPTH_M ?? props.DEPTH;
    if (typeof depth !== 'number' || !Number.isFinite(depth) || depth < 0 || depth > 10000) throw new Error('数値属性DEPTH_M（またはDEPTH）が必要です。正の水深m、陸地0、上限10000 mです。');
    return { ...feature, props, depth };
  });
  if (!own && features.length && features.every(f => ['LineString', 'MultiLineString'].includes(f.geometry?.type))) return contourTerrain(features, g);
  if (!own && features.length && features.every(f => ['Point', 'MultiPoint'].includes(f.geometry?.type))) return pointTerrain(features, g);
  if (own) {
    for (const { props: { I: i, J: j }, depth } of features) {
      if (![i, j].every(Number.isInteger) || i < 0 || j < 0 || i >= g.nx || j >= g.ny || Object.hasOwn(g.edits, j * g.nx + i)) throw new Error('Shapefileの格子番号が重複または範囲外です。');
      g.edits[j * g.nx + i] = depth;
    }
    if (features.length !== g.nx * g.ny) throw new Error('格子セルが欠けています。');
  } else {
    if (features.some(f => !['Polygon', 'MultiPolygon'].includes(f.geometry?.type))) throw new Error('外部Shapefileは、水深属性付きの点・等深線・ポリゴンのいずれか1種類を選択してください。');
    g.landMaskProvided = features.some(feature => feature.depth === 0);
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

export async function readLandPolygons(input) {
  const files = await readShapeFiles(input), names = Object.keys(files).filter(name => /\.shp$/i.test(name));
  if (names.length !== 1) throw new Error('陸域のShapefileを1組だけ指定してください。');
  const base = names[0].slice(0, -4), find = ext => files[Object.keys(files).find(name => name.toLowerCase() === (base + ext).toLowerCase())];
  if (!find('.dbf') || !find('.prj')) throw new Error('陸域にも同名の.shp・.dbf・.prjが必要です（水深属性は不要）。');
  return shp({ shp: find('.shp'), dbf: find('.dbf'), prj: strFromU8(find('.prj')), ...(find('.cpg') ? { cpg: strFromU8(find('.cpg')) } : {}) });
}
