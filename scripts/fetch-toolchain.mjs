import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const repository = 'r-wasm/flang-wasm';
const digest = 'sha256:bbaa3dc304de5b10df973cc8c49dbcd52ec815c309c35e9643ffe95d0e85b384';
const directory = new URL('../.tools/oci/', import.meta.url);
await mkdir(directory, { recursive: true });
async function get(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const { token } = await (await get(`https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`)).json();
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.manifest.v1+json' };
const manifest = await (await get(`https://ghcr.io/v2/${repository}/manifests/${digest}`, { headers })).json();
await writeFile(new URL('manifest.json', directory), JSON.stringify({ repository, digest, ...manifest }, null, 2));
for (const [i, layer] of manifest.layers.entries()) {
  const file = new URL(`layer-${i}.tar.gz`, directory);
  const expected = layer.digest.slice(7);
  const hashFile = async () => {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  };
  try { if (await hashFile() === expected) { console.log(`Layer ${i}: cached`); continue; } } catch {}
  console.log(`Layer ${i}: downloading ${(layer.size / 1e6).toFixed(1)} MB`);
  const response = await get(`https://ghcr.io/v2/${repository}/blobs/${layer.digest}`, { headers });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(file));
  if (await hashFile() !== expected) throw new Error(`Layer ${i}: SHA-256 mismatch`);
  console.log(`Layer ${i}: verified`);
}
