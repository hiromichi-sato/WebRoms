import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseJapanTides } from '../src/japan-tides.js';
const root = new URL('../', import.meta.url);
const stations = parseJapanTides(await readFile(new URL('roms/sample/TidalData_jp.csv', root), 'utf8'));
await mkdir(new URL('src/data/', root), { recursive: true });
await writeFile(new URL('src/data/japan-tides.json', root), JSON.stringify({ source: '気象庁公開の主要4分潮調和定数（TidalData_jp.csvに転記）', reference: 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station.php', stations }, null, 2));
console.log(`Bundled ${stations.length} tide stations`);
