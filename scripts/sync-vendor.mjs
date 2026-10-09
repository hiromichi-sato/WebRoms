// Refresh the checked-in browser dependencies after installing locked packages.
import { mkdir, copyFile, readdir, readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
await mkdir(new URL('vendor/three/addons/controls/', root), { recursive: true });
for (const [source, target] of [
  ['three/build/three.module.js', 'vendor/three/three.module.js'],
  ['three/build/three.core.js', 'vendor/three/three.core.js'],
  ['three/examples/jsm/controls/OrbitControls.js', 'vendor/three/addons/controls/OrbitControls.js'],
  ['lucide/dist/umd/lucide.js', 'vendor/lucide.js'],
  ['three/LICENSE', 'licenses/three.txt'],
  ['lucide/LICENSE', 'licenses/lucide.txt'],
  ['shpjs/dist/shp.esm.js', 'vendor/shp.esm.js'],
  ['shpjs/LICENSE.md', 'licenses/shpjs.txt'],
  ['@mapbox/shp-write/LICENSE', 'licenses/shp-write.txt'],
  ['fflate/esm/browser.js', 'vendor/fflate.js'],
  ['fflate/LICENSE', 'licenses/fflate.txt']
]) await copyFile(new URL('node_modules/' + source, root), new URL(target, root));
console.log('Browser dependencies and licenses refreshed. Include them in Git with dependency updates.');
await build({ entryPoints: [fileURLToPath(new URL('node_modules/@mapbox/shp-write/src/write.js', root))], bundle: true, format: 'esm', platform: 'browser', outfile: fileURLToPath(new URL('vendor/shpwrite.js', root)), legalComments: 'inline' });
const bundledDependencies = ['but-unzip', 'dbf', 'jdataview', 'mgrs', 'parsedbf', 'proj4', 'wkt-parser'];
const store = new URL('node_modules/.pnpm/', root), installed = await readdir(store);
for (const name of bundledDependencies) {
  const directory = installed.find(entry => entry.startsWith(name + '@'));
  if (!directory) throw new Error('Missing bundled dependency license: ' + name);
  const packageRoot = new URL(directory + '/node_modules/' + name + '/', store);
  const licenses = (await readdir(packageRoot)).filter(file => /^(licen[cs]e|copying|copyright)/i.test(file));
  if (!licenses.length) {
    const readme = (await readdir(packageRoot)).find(file => /^readme/i.test(file));
    if (!readme || !/Permission is hereby granted|Do What The Fuck You Want To Public License/.test(await readFile(new URL(readme, packageRoot), 'utf8'))) throw new Error('No license found: ' + name);
    licenses.push(readme);
  }
  for (const file of licenses) await copyFile(new URL(file, packageRoot), new URL('licenses/' + name + '-' + file.replaceAll('.', '_') + '.txt', root));
}
