// Refresh the checked-in browser dependencies after installing locked packages.
import { mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('vendor/three/addons/controls/', root), { recursive: true });
for (const [source, target] of [
  ['three/build/three.module.js', 'vendor/three/three.module.js'],
  ['three/build/three.core.js', 'vendor/three/three.core.js'],
  ['three/examples/jsm/controls/OrbitControls.js', 'vendor/three/addons/controls/OrbitControls.js'],
  ['lucide/dist/umd/lucide.js', 'vendor/lucide.js'],
  ['three/LICENSE', 'licenses/three.txt'],
  ['lucide/LICENSE', 'licenses/lucide.txt']
]) await copyFile(new URL('node_modules/' + source, root), new URL(target, root));
console.log('Browser dependencies and licenses refreshed. Include them in Git with dependency updates.');
