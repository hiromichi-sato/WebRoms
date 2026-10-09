import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const BASE = 'https://psl.noaa.gov/thredds/dodsC/Datasets/godas/';
const PHASES = { 'el-nino': [1983, 1998, 2016], 'la-nina': [1989, 2000, 2011] };

export function parseGodasAscii(text, variable) {
  text = text.replace(/\r\n/g, '\n');
  const body = text.split('---------------------------------------------')[1];
  if (!body) throw new Error('Invalid GODAS ASCII response');
  const sections = body.trim().split(/\n\s*\n/);
  const coordinate = key => {
    const section = sections.find(s => s.startsWith(`${variable}.${key}[`));
    if (!section) throw new Error(`Missing GODAS ${key}`);
    const tokens = section.split('\n').slice(1).join('').split(',');
    const values = tokens.map(Number);
    if (tokens.some(t => !t.trim()) || values.some((v, i) => !Number.isFinite(v) || (i && v <= values[i - 1]))) throw new Error(`Invalid GODAS ${key}`);
    return values;
  };
  const levels = coordinate('level'), lat = coordinate('lat'), lon = coordinate('lon'), time = coordinate('time');
  const section = sections.find(s => s.startsWith(`${variable}.${variable}[`));
  if (!section) throw new Error('Missing GODAS data section');
  const rows = new Map();
  for (const line of section.split('\n').slice(1)) {
    const match = line.match(/^\[(\d+)\]\[(\d+)\]\[(\d+)\],\s*(.*)$/);
    if (!match) throw new Error(`Invalid GODAS data row: ${line}`);
    const [, t, k, j, values] = match;
    if (+t >= time.length || +k >= levels.length || +j >= lat.length) throw new Error('GODAS row index outside subset');
    const row = values.split(',').map(Number);
    if (values.split(',').some(v => !v.trim()) || row.length !== lon.length || row.some(v => !Number.isFinite(v))) throw new Error('Invalid GODAS row values');
    const key = `${t},${k},${j}`;
    if (rows.has(key)) throw new Error('Duplicate GODAS row');
    rows.set(key, row);
  }
  if (rows.size !== time.length * levels.length * lat.length) throw new Error('Incomplete GODAS subset');
  return { levels, lat, lon, time, rows };
}

async function main() {
  const cache = process.env.CLIMATOLOGY_CACHE || join(tmpdir(), 'webroms-climatology-woa23');
  await mkdir(cache, { recursive: true });
  const output = new URL('../src/data/climatology-enso.js', import.meta.url);
  let pinned = {};
  try { pinned = (await import(output.href)).ENSO_DATA.sources; }
  catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
  const sources = {};
  async function download(url) {
    const key = sha256(url), path = join(cache, `${key}.txt`);
    let bytes;
    try { bytes = await readFile(path); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await writeFile(path, bytes);
    }
    const digest = sha256(bytes);
    if (pinned[key] && pinned[key].sha256 !== digest) throw new Error(`Source changed: ${url}`);
    sources[key] = { url, sha256: digest, bytes: bytes.length };
    return bytes.toString('utf8');
  }
  const oniUrl = 'https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt';
  const oni = await download(oniUrl);
  const oniRows = oni.trim().split(/\r?\n/).slice(1).map(line => line.trim().split(/\s+/));
  // Retain original units and missing-value definitions from each variable's DAS.
  for (const variable of ['pottmp', 'salt']) await download(`${BASE}${variable}.1998.nc.das`);
  const profiles = [];
  let depthsM;
  for (const [phase, years] of Object.entries(PHASES)) {
    const profile = { id: `north-pacific-${phase}-djf`, phase, season: 'DJF', winterYears: years, oniDJF: [], fields: {} };
    for (const year of years) {
      const row = oniRows.find(r => r[0] === 'DJF' && Number(r[1]) === year);
      if (!row || (phase === 'el-nino' ? Number(row[3]) < 0.5 : Number(row[3]) > -0.5)) throw new Error(`ONI classification failed for ${year}`);
      profile.oniDJF.push({ year, anomalyC: Number(row[3]) });
    }
    for (const variable of ['pottmp', 'salt']) {
      const subsets = [];
      for (const year of years) {
        for (const [y, first, last] of [[year - 1, 11, 11], [year, 0, 1]]) {
          // A documented ~1-degree latitude subsample, all longitudes, 5-459 m.
          const url = `${BASE}${variable}.${y}.nc.ascii?${variable}[${first}:1:${last}][0:1:27][284:3:386][150:1:229]`;
          const data = parseGodasAscii(await download(url), variable);
          if (depthsM && JSON.stringify(depthsM) !== JSON.stringify(data.levels)) throw new Error('GODAS depth grid changed');
          depthsM = data.levels;
          if (data.lat.length !== 35 || data.lon.length !== 80 || data.time.length !== last - first + 1) throw new Error('GODAS subset shape changed');
          data.time.forEach((days, t) => {
            const date = new Date(Date.UTC(1800, 0, 1) + days * 86400000);
            if (date.getUTCFullYear() !== y || date.getUTCMonth() !== first + t) throw new Error('GODAS time mismatch');
          });
          if (subsets.length && (JSON.stringify(subsets[0].lat) !== JSON.stringify(data.lat) || JSON.stringify(subsets[0].lon) !== JSON.stringify(data.lon))) throw new Error('GODAS horizontal grid changed');
          subsets.push(data);
          console.log(`${phase} ${variable} ${y} months ${first + 1}-${last + 1}`);
        }
      }
      const values = [], validCells = [];
      for (let k = 0; k < depthsM.length; k++) {
        let sum = 0, weights = 0, count = 0;
        for (let j = 0; j < 35; j++) for (let i = 0; i < 80; i++) {
          const samples = subsets.flatMap(s => s.time.map((_, t) => s.rows.get(`${t},${k},${j}`)[i]));
          if (samples.some(v => Math.abs(v) >= 1e20)) continue;
          if (samples.some(v => variable === 'pottmp' ? v < 260 || v > 310 : v < 0 || v > 0.1)) throw new Error('GODAS value outside declared valid range');
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          const converted = variable === 'pottmp' ? mean - 273.15 : mean * 1000;
          const weight = Math.cos(subsets[0].lat[j] * Math.PI / 180);
          sum += converted * weight; weights += weight; count++;
        }
        values.push(weights ? Number((sum / weights).toFixed(6)) : null); validCells.push(count);
      }
      profile.fields[variable === 'pottmp' ? 'potentialTemperature' : 'salinityMassFraction'] = {
        values, missing: values.map(v => v === null), validCells, totalGridCells: 2800, monthsPerCell: 9
      };
    }
    profiles.push(profile);
  }
  const payload = { depthsM, profiles };
  const data = {
    schemaVersion: 1, product: 'NOAA NCEP GODAS selected-event composites',
    sourcePage: 'https://psl.noaa.gov/data/gridded/data.godas.html', oniUrl,
    eventSelection: 'Three illustrative historical winters per phase, checked against archived ERSSTv5 ONI DJF signs; not every ENSO event, not an anomaly, not current official RONI classification.',
    region: { west: 150, east: 230, south: 20, north: 55, longitudeConvention: '0-360 degrees east' },
    sampling: 'GODAS latitude indices 284:3:386 (~20.166 to 54.166 N), longitude 150:1:229 (150.5 to 229.5 E), levels 0:1:27. Latitude subsampling, not block averaging.',
    reduction: 'Equal weight for nine months (December of prior year, January, February for three winters), then cos(latitude) spatial mean; all nine months required per cell/depth. Six decimal places.',
    units: { potentialTemperature: 'degree_Celsius (source K minus 273.15)', salinityMassFraction: 'g/kg (source kg/kg times 1000)' },
    missingValue: -9.96921e36, nutrientDataAvailable: false,
    acknowledgement: 'GODAS data provided by NOAA PSL, Boulder, Colorado, USA, https://psl.noaa.gov/',
    payloadSha256: sha256(JSON.stringify(payload)), sources, ...payload
  };
  await mkdir(new URL('../src/data/', import.meta.url), { recursive: true });
  await writeFile(output, '// Generated by scripts/fetch-climatology-enso.mjs.\nexport const ENSO_DATA = ' + JSON.stringify(data, null, 2) + ';\n');
  console.log(`Wrote ${fileURLToPath(output)}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
