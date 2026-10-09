import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function parseWindAscii(text, variable) {
  const body = text.split('---------------------------------------------')[1];
  if (!body) throw new Error('Invalid OPeNDAP ASCII response');
  const section = name => body.split(`${variable}.${name}[`)[1]?.split('\n\n')[0].split('\n').slice(1).join('\n');
  const numbers = value => value?.split(',').map(s => Number(s.trim()));
  const lat = numbers(section('lat')), lon = numbers(section('lon')), time = numbers(section('time'));
  const data = section(variable)?.trim().split('\n').map(line => {
    const match = line.match(/^\[(\d+)\]\[(\d+)\], (.*)$/);
    if (!match) throw new Error('Invalid wind row');
    return { t: +match[1], j: +match[2], values: numbers(match[3]) };
  });
  if (!lat?.length || !lon?.length || !time?.length || data?.length !== lat.length * time.length) throw new Error('Incomplete wind grid');
  const values = new Float32Array(time.length * lat.length * lon.length), seen = new Set();
  for (const row of data) {
    if (row.t >= time.length || row.j >= lat.length || row.values.length !== lon.length || row.values.some(v => !Number.isFinite(v) || Math.abs(v) > 150) || seen.has(`${row.t},${row.j}`)) throw new Error('Invalid/missing wind values');
    seen.add(`${row.t},${row.j}`); values.set(row.values, (row.t * lat.length + row.j) * lon.length);
  }
  return { lat, lon, time, values };
}

async function main() {
  const cache = new URL('../.tools/wind/', import.meta.url); await mkdir(cache, { recursive: true });
  const fields = {}, sources = [];
  for (const variable of ['uwnd', 'vwnd']) {
    // 1982-2020, native T62 grid retained, no spatial averaging.
    const chunks = [];
    for (let start = 408; start <= 875; start += 24) {
      const end = Math.min(875, start + 23);
      const url = `https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis/Monthlies/surface_gauss/${variable}.10m.mon.mean.nc.ascii?${variable}[${start}:1:${end}][0:1:93][0:1:191]`;
      const path = new URL(`${variable}-${start}-${end}.txt`, cache);
      let bytes;
      try { bytes = await readFile(path); } catch {
        const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        bytes = Buffer.from(await r.arrayBuffer()); await writeFile(path, bytes);
      }
      chunks.push(parseWindAscii(bytes.toString(), variable));
      sources.push({ url, sha256: createHash('sha256').update(bytes).digest('hex') });
      console.log(variable, start, end);
    }
    const values = new Float32Array(chunks.reduce((n, c) => n + c.values.length, 0)); let offset = 0;
    for (const c of chunks) { values.set(c.values, offset); offset += c.values.length; }
    fields[variable] = { ...chunks[0], time: chunks.flatMap(c => c.time), values };
  }
  const u = fields.uwnd, v = fields.vwnd, size = u.lat.length * u.lon.length;
  for (const axis of ['lat', 'lon', 'time']) if (JSON.stringify(u[axis]) !== JSON.stringify(v[axis])) throw new Error('Wind component axes differ');
  const groups = { annual: [], JJA: [], DJF: [], elnino: [], lanina: [] };
  for (let t = 0; t < u.time.length; t++) {
    const date = new Date(Date.UTC(1800, 0, 1) + u.time[t] * 3600000), year = date.getUTCFullYear(), month = date.getUTCMonth() + 1;
    if (year !== 1982 + Math.floor(t / 12) || month !== t % 12 + 1) throw new Error('Unexpected time axis');
    if (year >= 1991) { groups.annual.push(t); if ([6, 7, 8].includes(month)) groups.JJA.push(t); if ([12, 1, 2].includes(month)) groups.DJF.push(t); }
    const winterYear = month === 12 ? year + 1 : year;
    if ([12, 1, 2].includes(month)) {
      if ([1983, 1998, 2016].includes(winterYear)) groups.elnino.push(t);
      if ([1989, 2000, 2011].includes(winterYear)) groups.lanina.push(t);
    }
  }
  const products = {};
  for (const [id, times] of Object.entries(groups)) {
    const arrays = Object.fromEntries(['u', 'v', 'tx', 'ty'].map(k => [k, new Float64Array(size)])); let total = 0;
    for (const t of times) {
      const date = new Date(Date.UTC(1800, 0, 1) + u.time[t] * 3600000);
      const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); total += days;
      for (let p = 0; p < size; p++) {
        const a = u.values[t * size + p], b = v.values[t * size + p], drag = 1.225 * 0.0013 * Math.hypot(a, b);
        arrays.u[p] += a * days; arrays.v[p] += b * days; arrays.tx[p] += drag * a * days; arrays.ty[p] += drag * b * days;
      }
    }
    products[id] = { months: times.length, ...Object.fromEntries(Object.entries(arrays).map(([k, a]) => [k, Array.from(a, v => Math.round(v / total * 1e6) / 1e6)])) };
  }
  const data = { product: 'NCEP/NCAR Reanalysis 1', height: '10 m', period: '1991-2020', latitude: u.lat, longitude: u.lon, sources,
    enso: { elnino: [1983, 1998, 2016], lanina: [1989, 2000, 2011], season: 'DJF (December of preceding year)' }, airDensity: 1.225, dragCoefficient: 0.0013, products };
  const payload = JSON.stringify(data);
  await writeFile(new URL('../src/data/wind-ncep.js', import.meta.url), `// Generated by scripts/fetch-wind.mjs. NOAA PSL NCEP/NCAR Reanalysis 1.\nexport const WIND_SHA256 = '${createHash('sha256').update(payload).digest('hex')}';\nexport const WIND_DATA = ${payload};\n`);
  console.log('Wind climatology written', payload.length);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
