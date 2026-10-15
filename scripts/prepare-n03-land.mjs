import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { parseShp } from 'shpjs';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url), raw = new URL('data/coastlines/n03-2026/', root);
const output = new URL('assets/coastlines/n03-2026/', root);
const selected = ['01','52','53','54','55','56','57','58','59'].map(code=>`N03-20260101_${code}_GML.zip`);
await mkdir(raw, { recursive: true }); await mkdir(output, { recursive: true });
const sources = [], tiles = new Map();
let previous = { sources: [] };
try { previous = JSON.parse(await readFile(new URL('index.json',output))); } catch (error) { if(error.code!=='ENOENT')throw error; }
for (const archive of selected) {
  const stem = archive.replace('_GML.zip', ''), folder = new URL(stem + '/', raw);
  await mkdir(folder, { recursive: true });
  let archiveBytes, files;
  try { archiveBytes = await readFile(new URL(archive, root)); }
  catch(error) { if(error.code!=='ENOENT')throw error; }
  if(archiveBytes) files = unzipSync(archiveBytes, { filter: entry => entry.name === `KS-META-${stem}.xml` || new RegExp(`^${stem}\\.(shp|dbf|shx|prj|cpg)$`).test(entry.name) });
  else files = Object.fromEntries(await Promise.all((await readdir(folder)).map(async name=>[name,await readFile(new URL(name,folder))])));
  for (const extension of ['shp', 'dbf', 'shx', 'prj']) if (!files[stem + '.' + extension]) throw new Error('Missing ' + extension);
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(new URL(name, folder), bytes);
    if (!Buffer.from(bytes).equals(await readFile(new URL(name, folder)))) throw new Error('Verification failed: ' + name);
  }
  const prj = new TextDecoder().decode(files[stem + '.prj']);
  if (!/JGD_?2011/i.test(prj)) throw new Error('Unsupported CRS: ' + prj);
  const polygons = parseShp(files[stem + '.shp']);
  sources.push({ id: stem, archiveSha256: archiveBytes ? createHash('sha256').update(archiveBytes).digest('hex') : previous.sources.find(source=>source.id===stem)?.archiveSha256 ?? null, shapeSha256: createHash('sha256').update(files[stem + '.shp']).digest('hex') });
  for (const [index, geometry] of polygons.entries()) {
    if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw new Error('Expected polygons');
    for (const [part, rings] of (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).entries()) {
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      const coordinates = rings.map(ring => ring.map(([x,y]) => {
        if (!Number.isFinite(x+y) || x < 120 || x > 155 || y < 20 || y > 50) throw new Error('Invalid geographic coordinate');
        box[0] = Math.min(box[0],x); box[1] = Math.min(box[1],y); box[2] = Math.max(box[2],x); box[3] = Math.max(box[3],y);
        return [Math.round(x*1e7)/1e7, Math.round(y*1e7)/1e7];
      }));
      const feature = { id: `${stem}:${index}:${part}`, box, rings: coordinates };
      for (let y = Math.floor(box[1]); y <= Math.floor(box[3]); y++) for (let x = Math.floor(box[0]); x <= Math.floor(box[2]); x++) {
        const key = `${x}_${y}`; if (!tiles.has(key)) tiles.set(key, []); tiles.get(key).push(feature);
      }
    }
  }
}
const manifest = { format: 'webroms-land-polygons-v1', source: 'MLIT National Land Numerical Information N03 2026', date: '2026-01-01',
  license: 'CC-BY-4.0', sourceUrl: 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html',
  crs: 'JGD2011', processing: 'Municipal polygons grouped into 1-degree tiles; attributes removed; coordinates rounded to 1e-7 degrees. JGD2011 used on WGS84 grid without epoch-dependent sub-metre correction.', sources, tiles: [] };
for (const [key, polygons] of [...tiles].sort()) {
  const [x,y] = key.split('_').map(Number), file = key + '.json.gz', bytes = gzipSync(JSON.stringify({ polygons }));
  await writeFile(new URL(file, output), bytes);
  manifest.tiles.push({ file, bounds: { west:x,east:x+1,south:y,north:y+1 }, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(new URL('index.json', output), JSON.stringify(manifest,null,2));
// Remove only the user-specified archives after all current datasets are verified.
if (process.argv.includes('--remove-archives')) for (const name of [...selected, 'N03-20250101_52_GML.zip', 'N03-20240101_52_GML.zip']) {
  if ((await readdir(root)).includes(name)) await unlink(new URL(name,root));
}
console.log(`Prepared ${sources.length} N03 sources and ${tiles.size} spatial tiles; original main Shapefile sets retained in data/coastlines/n03-2026/`);
