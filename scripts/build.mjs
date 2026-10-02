import { mkdir, cp, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(new URL('vendor/three/addons/controls/', dist), { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js']) await copyFile(new URL(name, root), new URL(name, dist));
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(new URL(name, root), new URL(name, dist));
for (const name of ['src', 'runtime', 'vendor']) await cp(new URL(name, root), new URL(`${name}/`, dist), { recursive: true });
await mkdir(new URL('licenses/', dist), { recursive: true });
await cp(new URL('licenses/', root), new URL('licenses/', dist), { recursive: true });
// The Windows launcher verifies the complete offline bundle before opening it.
const files = {};
async function inventory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await inventory(new URL(entry.name + '/', directory), name + '/');
    else if (name !== 'asset-manifest.json') {
      files[name] = createHash('sha256').update(await readFile(new URL(entry.name, directory))).digest('hex');
    }
  }
}
await inventory(dist);
await writeFile(new URL('asset-manifest.json', dist), JSON.stringify({ version: 1, files }, null, 2) + '\n');
console.log('Static site assembled in dist/');
