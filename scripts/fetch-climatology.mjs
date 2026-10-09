import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const DEPTHS = [0, 10, 20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500,
  ...Array.from({ length: 30 }, (_, i) => 550 + i * 50),
  ...Array.from({ length: 35 }, (_, i) => 2100 + i * 100)];
export const REGIONS = [
  { id: 'japan-pacific', label: 'Pacific Japan (south)', west: 132, east: 142, south: 30, north: 36 },
  { id: 'japan-north', label: 'Pacific Japan (north)', west: 140, east: 148, south: 38, north: 45 },
  { id: 'japan-sea', label: 'Sea of Japan', west: 130, east: 140, south: 35, north: 44 },
  { id: 'north-pacific', label: 'North Pacific', west: 150, east: 230, south: 20, north: 55 },
  { id: 'california', label: 'California', west: 228, east: 242, south: 25, north: 45 },
  { id: 'south-pacific', label: 'South Pacific', west: 150, east: 290, south: -55, north: 0 },
  { id: 'north-atlantic', label: 'North Atlantic', west: 280, east: 350, south: 0, north: 60 },
  { id: 'south-atlantic', label: 'South Atlantic', west: 300, east: 360, south: -55, north: 0 }
];
const VARIABLES = {
  temperature: { code: 't', span: 'decav91C0', period: '1991-2020', unit: 'degree_Celsius', doi: '10.25923/54bh-1613' },
  salinity: { code: 's', span: 'decav91C0', period: '1991-2020', unit: '1 (practical salinity)', doi: '10.25923/70qt-9574' },
  nitrate: { code: 'n', span: 'all', period: '1965-2022', unit: 'umol/kg', doi: '10.25923/39qw-7j08' },
  phosphate: { code: 'p', span: 'all', period: '1965-2022', unit: 'umol/kg', doi: '10.25923/39qw-7j08' },
  silicate: { code: 'i', span: 'all', period: '1965-2022', unit: 'umol/kg', doi: '10.25923/39qw-7j08' }
};
const SEASONS = { annual: [0], JJA: [6, 7, 8], DJF: [12, 1, 2] };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// NOAA's CSV is an unquoted numeric format; short rows omit missing deep levels.
export function parseWoaCsv(text, depths = DEPTHS, { allowAbsentDepths = false } = {}) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines[0]?.startsWith('#WOA23') || !lines[1]?.includes('DEPTHS (M):')) throw new Error('Unexpected WOA23 CSV header');
  const sourceDepths = lines[1].split(':')[1].split(',').map(Number);
  const indices = depths.map(d => sourceDepths.indexOf(d));
  if (sourceDepths.some((d, i) => !Number.isFinite(d) || d < 0 || (i && d <= sourceDepths[i - 1]))) throw new Error('Invalid source depths');
  if (!allowAbsentDepths && indices.some(i => i < 0)) throw new Error('Requested depth absent from source');
  const cells = new Map();
  for (const line of lines.slice(2)) {
    if (!line.trim()) continue;
    const row = line.split(','), lat = Number(row[0]), lon = (Number(row[1]) + 360) % 360;
    if (!row[0]?.trim() || !row[1]?.trim() || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lon)) throw new Error('Invalid coordinate');
    if (!REGIONS.some(r => lat >= r.south && lat < r.north && lon >= r.west && lon < r.east)) continue;
    const values = indices.map(i => {
      if (i < 0) return null;
      const token = row[i + 2]?.trim();
      if (!token) return null;
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error(`Invalid WOA number: ${token}`);
      return Math.abs(value) >= 1e20 || value <= -999 ? null : value;
    });
    if (cells.has(`${lat},${lon}`)) throw new Error('Duplicate WOA cell');
    cells.set(`${lat},${lon}`, { lat, lon, values });
  }
  return cells;
}

export function reduceRegion(months, region, depths = DEPTHS) {
  const sums = depths.map(() => 0), weights = depths.map(() => 0), validCells = depths.map(() => 0);
  for (const [key, cell] of months[0]) {
    if (cell.lat < region.south || cell.lat >= region.north || cell.lon < region.west || cell.lon >= region.east) continue;
    const weight = Math.cos(cell.lat * Math.PI / 180);
    depths.forEach((_, k) => {
      const values = months.map(m => m.get(key)?.values[k] ?? null);
      // All three months must be valid at the same cell and depth.
      if (values.some(v => v === null)) return;
      sums[k] += values.reduce((a, b) => a + b, 0) / values.length * weight;
      weights[k] += weight;
      validCells[k]++;
    });
  }
  return {
    values: sums.map((s, k) => weights[k] ? Number((s / weights[k]).toFixed(6)) : null),
    missing: validCells.map(n => n === 0), validCells,
    totalGridCells: (region.east - region.west) * (region.north - region.south)
  };
}

async function main() {
  const cache = process.env.CLIMATOLOGY_CACHE || join(tmpdir(), 'webroms-climatology-woa23');
  await mkdir(cache, { recursive: true });
  const output = new URL('../src/data/climatology-woa23.js', import.meta.url);
  let pinned = {};
  try { pinned = (await import(output.href)).CLIMATOLOGY_DATA.sources; }
  catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
  const sources = {}, profiles = REGIONS.flatMap(region => Object.keys(SEASONS).map(season => ({
    id: `${region.id}-${season.toLowerCase()}`, region: region.id, season, months: SEASONS[season], fields: {}
  })));
  for (const [variable, meta] of Object.entries(VARIABLES)) {
    const months = new Map();
    for (const month of [0, 1, 2, 6, 7, 8, 12]) {
      const filename = `woa23_${meta.span}_${meta.code}${String(month).padStart(2, '0')}an01.csv.gz`;
      const url = `https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DATA/${variable}/csv/${meta.span}/1.00/${filename}`;
      const path = join(cache, filename);
      let bytes;
      try { bytes = await readFile(path); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            response = await fetch(url, { signal: AbortSignal.timeout(120000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
            bytes = Buffer.from(await response.arrayBuffer());
            break;
          } catch (failure) { if (attempt === 2) throw failure; }
        }
        gunzipSync(bytes);
        await writeFile(path, bytes);
      }
      const digest = sha256(bytes);
      if (pinned[filename] && pinned[filename].sha256 !== digest) throw new Error(`Source changed: ${filename}; inspect NOAA revision before updating pinned data`);
      const csv = gunzipSync(bytes).toString('utf8');
      months.set(month, parseWoaCsv(csv, DEPTHS, { allowAbsentDepths: month !== 0 }));
      sources[filename] = { url, sha256: digest, bytes: bytes.length, header: csv.split('\n')[0].trim() };
      console.log(`${filename}: ${bytes.length} bytes, sha256 ${digest}`);
    }
    for (const profile of profiles) {
      const region = REGIONS.find(r => r.id === profile.region);
      profile.fields[variable] = reduceRegion(SEASONS[profile.season].map(m => months.get(m)), region);
      const field = profile.fields[variable];
      const seasonalMax = ['temperature', 'salinity'].includes(variable) ? 1500 : 500;
      const annual = reduceRegion([months.get(0)], region);
      field.sourceSeason = DEPTHS.map((d, k) => {
        if (profile.season === 'annual' || d > seasonalMax) {
          for (const key of ['values', 'missing', 'validCells']) field[key][k] = annual[key][k];
          return 'annual';
        }
        return profile.season;
      });
      if (profile.fields[variable].missing.every(Boolean)) throw new Error(`Empty profile: ${profile.id}/${variable}`);
    }
  }
  const payload = { depthsM: DEPTHS, regions: REGIONS, variables: VARIABLES, profiles };
  const data = {
    schemaVersion: 1, product: 'NOAA World Ocean Atlas 2023',
    sourcePage: 'https://www.ncei.noaa.gov/access/world-ocean-atlas-2023/',
    documentation: 'https://www.ncei.noaa.gov/data/oceans/woa/WOA23/DOCUMENTATION/WOA23_Product_Documentation.pdf',
    gridDegrees: 1, field: 'objectively analyzed climatological mean (an)',
    reduction: 'cos(latitude) weighted mean of valid 1-degree cells; JJA/DJF equal-month mean requiring all three months per cell/depth. Annual values below monthly coverage (T/S 1500 m, nutrients 500 m), through 5500 m; missing regional depths remain null. Six decimal places.',
    payloadSha256: sha256(JSON.stringify(payload)), sources, ...payload
  };
  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(output, '// Generated by scripts/fetch-climatology.mjs. Do not hand-edit NOAA values.\nexport const CLIMATOLOGY_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
  console.log(`Wrote ${fileURLToPath(output)} (${profiles.length} profiles).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
