import { mkdir, cp, copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(new URL('vendor/three/addons/controls/', dist), { recursive: true });
for (const name of ['index.html', 'styles.css', 'app.js']) await copyFile(new URL(name, root), new URL(name, dist));
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(new URL(name, root), new URL(name, dist));
for (const name of ['src', 'runtime']) await cp(new URL(name, root), new URL(`${name}/`, dist), { recursive: true });
await copyFile(new URL('node_modules/three/build/three.module.js', root), new URL('vendor/three/three.module.js', dist));
await copyFile(new URL('node_modules/three/build/three.core.js', root), new URL('vendor/three/three.core.js', dist));
await copyFile(new URL('node_modules/three/examples/jsm/controls/OrbitControls.js', root), new URL('vendor/three/addons/controls/OrbitControls.js', dist));
await copyFile(new URL('node_modules/lucide/dist/umd/lucide.js', root), new URL('vendor/lucide.js', dist));
await mkdir(new URL('licenses/', dist), { recursive: true });
await cp(new URL('licenses/', root), new URL('licenses/', dist), { recursive: true });
await copyFile(new URL('node_modules/three/LICENSE', root), new URL('licenses/three.txt', dist));
await copyFile(new URL('node_modules/lucide/LICENSE', root), new URL('licenses/lucide.txt', dist));
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
