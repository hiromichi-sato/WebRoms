const endpoint = 'https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.json';
export function etopoProxyUrl(path) {
  const match = /^\/__webroms_etopo\?y0=(\d+)&y1=(\d+)&x0=(\d+)&x1=(\d+)&stride=(\d+)$/.exec(path);
  if (!match) throw new Error('Invalid ETOPO request');
  const [y0,y1,x0,x1,stride] = match.slice(1).map(Number);
  if (![y0,y1,x0,x1,stride].every(Number.isSafeInteger) || y0 < 0 || y1 > 43199 || x0 < 0 || x1 > 86399 || y1 <= y0 || x1 <= x0 || stride < 1 || stride > 1000 || (Math.floor((y1-y0)/stride)+1)*(Math.floor((x1-x0)/stride)+1) > 400000) throw new Error('ETOPO request exceeds limits');
  return `${endpoint}?z[${y0}:${stride}:${y1}][${x0}:${stride}:${x1}]`;
}
const cache = new Map();
export async function proxyEtopo(path) {
  const url = etopoProxyUrl(path);
  if (cache.has(url)) return cache.get(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`NOAA HTTP ${response.status}`);
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > 48e6) throw new Error('ETOPO response too large'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks); JSON.parse(bytes.toString('utf8'));
  if (cache.size >= 2) cache.delete(cache.keys().next().value);
  cache.set(url,bytes); return bytes;
}
