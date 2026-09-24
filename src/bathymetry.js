const TIFF_TYPES = { 1: [1, 'u8'], 2: [1, 'ascii'], 3: [2, 'u16'], 4: [4, 'u32'], 5: [8, 'rational'], 11: [4, 'f32'], 12: [8, 'f64'] };

function parseTiff(buffer) {
  const view = new DataView(buffer), order = view.getUint8(0) === 73 ? true : view.getUint8(0) === 77 ? false : null;
  if (order === null || view.getUint16(2, order) !== 42) throw new Error('GeoTIFF形式を判別できません。NOAA Grid Extractの.tifファイルを指定してください。');
  const ifd = view.getUint32(4, order), count = view.getUint16(ifd, order), tags = new Map();
  const read = (type, offset) => {
    if (type === 1 || type === 2) return view.getUint8(offset);
    if (type === 3) return view.getUint16(offset, order);
    if (type === 4) return view.getUint32(offset, order);
    if (type === 5) return view.getUint32(offset, order) / view.getUint32(offset + 4, order);
    if (type === 11) return view.getFloat32(offset, order);
    if (type === 12) return view.getFloat64(offset, order);
    throw new Error(`未対応のGeoTIFFデータ型です: ${type}`);
  };
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12, tag = view.getUint16(entry, order), type = view.getUint16(entry + 2, order), n = view.getUint32(entry + 4, order), typeSize = TIFF_TYPES[type]?.[0];
    if (!typeSize) continue;
    const bytes = n * typeSize, offset = bytes <= 4 ? entry + 8 : view.getUint32(entry + 8, order);
    if (type === 2) { tags.set(tag, new TextDecoder().decode(new Uint8Array(buffer, offset, n)).replace(/\0+$/, '')); continue; }
    tags.set(tag, Array.from({ length: n }, (_, k) => read(type, offset + k * typeSize)));
  }
  const one = tag => tags.get(tag)?.[0], many = tag => tags.get(tag) || [];
  const width = one(256), height = one(257), bits = one(258), compression = one(259) || 1, samples = one(277) || 1, sampleFormat = one(339) || 1;
  if (!width || !height || samples !== 1 || ![8, 16, 32].includes(bits)) throw new Error('このGeoTIFFの格子形式には対応していません。');
  if (sampleFormat === 3 && bits !== 32) throw new Error('GeoTIFFの浮動小数データ形式に対応していません。');
  const tileWidth = one(322), tileHeight = one(323), tiled = Boolean(tileWidth && tileHeight), blockWidth = tiled ? tileWidth : width, blockHeight = tiled ? tileHeight : one(278) || height;
  const offsets = many(tiled ? 324 : 273), byteCounts = many(tiled ? 325 : 279), blocksX = Math.ceil(width / blockWidth), blocksY = Math.ceil(height / blockHeight);
  if (offsets.length !== blocksX * blocksY) throw new Error('GeoTIFFの画像ブロック情報を読み取れません。');
  const output = new Float32Array(width * height), predictor = one(317) || 1, nodataText = tags.get(42113), nodata = nodataText === undefined ? NaN : Number(nodataText);
  const readValues = bytes => {
    const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), result = new Float32Array(Math.floor(bytes.byteLength / (bits / 8)));
    for (let i = 0; i < result.length; i++) {
      const offset = i * (bits / 8);
      result[i] = sampleFormat === 3 ? data.getFloat32(offset, order) : bits === 8 ? data.getUint8(offset) : bits === 16 ? (sampleFormat === 2 ? data.getInt16(offset, order) : data.getUint16(offset, order)) : (sampleFormat === 2 ? data.getInt32(offset, order) : data.getUint32(offset, order));
    }
    if (predictor === 2) {
      if (sampleFormat === 3) throw new Error('GeoTIFFの浮動小数差分圧縮には対応していません。');
      const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
      for (let y = 0; y < blockHeight; y++) for (let x = 1; x < blockWidth; x++) { const p = y * blockWidth + x; if (p < result.length) result[p] = (result[p] + result[p - 1]) & mask; }
    } else if (predictor !== 1) throw new Error(`GeoTIFFの差分方式には対応していません: ${predictor}`);
    return result;
  };
  return (async () => {
    for (let by = 0; by < blocksY; by++) for (let bx = 0; bx < blocksX; bx++) {
      const index = by * blocksX + bx, start = offsets[index], end = start + byteCounts[index];
      let bytes = new Uint8Array(buffer, start, byteCounts[index]);
      if (compression === 8 || compression === 32946) {
        const format = compression === 8 ? 'deflate' : 'deflate-raw';
        try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer()); }
        catch { throw new Error('GeoTIFFのDeflate圧縮を展開できません。'); }
      } else if (compression === 5) bytes = decodeLzw(bytes);
      else if (compression === 32773) bytes = decodePackBits(bytes);
      else if (compression !== 1) throw new Error(`未対応のGeoTIFF圧縮方式です: ${compression}`);
      const values = readValues(bytes);
      for (let y = 0; y < blockHeight && by * blockHeight + y < height; y++) for (let x = 0; x < blockWidth && bx * blockWidth + x < width; x++) {
        const value = values[y * blockWidth + x]; output[(by * blockHeight + y) * width + bx * blockWidth + x] = Number.isFinite(nodata) && value === nodata ? NaN : value;
      }
      void end;
    }
    const scale = many(33550), tie = many(33922);
    let bounds = null;
    if (scale.length >= 2 && tie.length >= 6) {
      const west = tie[3] - tie[0] * scale[0], north = tie[4] + tie[1] * scale[1];
      const east = west + width * scale[0], south = north - height * scale[1];
      if (Math.abs(west) <= 360 && Math.abs(east) <= 360 && Math.abs(south) <= 90 && Math.abs(north) <= 90) bounds = { west, east, south, north };
    }
    return { width, height, values: output, bounds };
  })();
}

function decodePackBits(input) {
  const out = [];
  for (let i = 0; i < input.length;) {
    const n = input[i++] << 24 >> 24;
    if (n >= 0) for (let j = 0; j <= n && i < input.length; j++) out.push(input[i++]);
    else if (n >= -127) { const value = input[i++]; for (let j = 0; j < 1 - n; j++) out.push(value); }
  }
  return Uint8Array.from(out);
}

function decodeLzw(input) {
  let bit = 0, codeSize = 9, next = 258;
  const dict = Array.from({ length: 258 }, (_, i) => i < 256 ? [i] : null), output = [];
  const code = () => { let value = 0; for (let i = 0; i < codeSize; i++, bit++) value = (value << 1) | ((input[bit >> 3] >> (7 - (bit & 7))) & 1); return value; };
  let previous = null;
  while (bit + codeSize <= input.length * 8) {
    const current = code();
    if (current === 256) { dict.length = 258; for (let i = 0; i < 256; i++) dict[i] = [i]; codeSize = 9; next = 258; previous = null; continue; }
    if (current === 257) break;
    const entry = dict[current] || (current === next && previous ? [...previous, previous[0]] : null);
    if (!entry) throw new Error('GeoTIFFのLZWデータを展開できません。');
    output.push(...entry);
    if (previous && next < 4096) { dict[next++] = [...previous, entry[0]]; if (next === (1 << codeSize) - 1 && codeSize < 12) codeSize++; }
    previous = entry;
  }
  return Uint8Array.from(output);
}

export async function readEtopo(file) {
  if (file.size > 100e6) throw new Error('GeoTIFFは100 MB以下のファイルを指定してください。');
  return parseTiff(await file.arrayBuffer());
}

export async function readJodc(file) {
  if (file.size > 100e6) throw new Error('JODCデータは100 MB以下のファイルを指定してください。');
  const text = await file.text(), points = [];
  for (const line of text.split(/\r?\n/)) {
    const fixed = [Number(line.slice(1, 11)), Number(line.slice(11, 21)), Number(line.slice(21, 27))];
    let [lat, lon, depth] = fixed;
    if (!fixed.every(Number.isFinite)) {
      const values = line.trim().split(/[\s,;]+/).map(Number);
      if (values.length < 4 || !values.slice(0, 4).every(Number.isFinite)) continue;
      [, lat, lon, depth] = values;
    }
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && depth > 0 && depth <= 12000) points.push({ lat, lon, depth });
  }
  if (!points.length) throw new Error('JODC水深ファイルから緯度・経度・水深を読み取れません。');
  return points;
}

function interpolatePoints(points, bounds, nx, ny) {
  const step = 0.02, buckets = new Map(), key = (x, y) => `${Math.floor(x / step)},${Math.floor(y / step)}`;
  for (const point of points) {
    if (point.lon < bounds.west || point.lon > bounds.east || point.lat < bounds.south || point.lat > bounds.north) continue;
    const bucket = key(point.lon, point.lat); if (!buckets.has(bucket)) buckets.set(bucket, []); buckets.get(bucket).push(point);
  }
  const output = new Float32Array(nx * ny); output.fill(NaN);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const lon = bounds.west + (bounds.east - bounds.west) * i / (nx - 1), lat = bounds.south + (bounds.north - bounds.south) * j / (ny - 1), candidates = [];
    const bx = Math.floor(lon / step), by = Math.floor(lat / step);
    for (let radius = 0; radius <= 3 && candidates.length < 4; radius++) for (let y = by - radius; y <= by + radius; y++) for (let x = bx - radius; x <= bx + radius; x++) {
      if (radius && Math.abs(x - bx) < radius && Math.abs(y - by) < radius) continue;
      for (const point of buckets.get(`${x},${y}`) || []) {
      const dx = (point.lon - lon) * Math.cos(lat * Math.PI / 180), dy = point.lat - lat;
      candidates.push({ depth: point.depth, distance: dx * dx + dy * dy });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    if (candidates.length) {
      const nearest = candidates.slice(0, 4), cutoff = (Math.max(bounds.east - bounds.west, bounds.north - bounds.south) / Math.min(nx, ny) * 1.8) ** 2;
      if (nearest[0].distance <= cutoff) {
        const exact = nearest.find(point => point.distance < 1e-14);
        output[j * nx + i] = exact ? exact.depth : nearest.reduce((sum, point) => sum + point.depth / point.distance, 0) / nearest.reduce((sum, point) => sum + 1 / point.distance, 0);
      }
    }
  }
  return output;
}

export function resampleBathymetry(source, bounds, nx, ny, raster = false) {
  if (raster) {
    const actual = source.bounds || bounds, values = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const lon = bounds.west + (bounds.east - bounds.west) * i / (nx - 1), lat = bounds.south + (bounds.north - bounds.south) * j / (ny - 1);
      const x = (lon - actual.west) / (actual.east - actual.west) * (source.width - 1), y = (actual.north - lat) / (actual.north - actual.south) * (source.height - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(source.width - 1, x0 + 1), y1 = Math.min(source.height - 1, y0 + 1), tx = x - x0, ty = y - y0;
      const samples = [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]];
      let value = 0, weight = 0;
      for (const [sx, sy, w] of samples) { const z = source.values[sy * source.width + sx]; if (Number.isFinite(z)) { value += z * w; weight += w; } }
      values[j * nx + i] = weight ? value / weight : NaN;
    }
    return values;
  }
  return interpolatePoints(source, bounds, nx, ny);
}
