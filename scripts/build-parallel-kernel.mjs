import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') throw new Error('This entry point requires Windows with WSL');
const root = fileURLToPath(new URL('../', import.meta.url));
const distro = process.env.WEBROMS_PROBE_DISTRO ?? 'Ubuntu-24.04';
const linux = p => p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`).replaceAll('\\', '/');
await import('./fetch-openmp-fortran-source.mjs');
const home = spawnSync('wsl', ['-d', distro, '--', 'printenv', 'HOME'], { encoding: 'utf8' });
if (home.status !== 0) throw new Error('Could not resolve WSL build location');
const cache = `${home.stdout.trim()}/.cache/webroms-openmp`;
const target = process.argv[2] ?? 'physical';
if (!['physical', 'all'].includes(target)) throw new Error('Choose physical or all');
const result = spawnSync('wsl', ['-d', distro, '-u', 'root', '--', 'env',
  `WEBROMS_OPENMP_ROOT=${cache}/roms-root`, `WEBROMS_OPENMP_EMSCRIPTEN=${process.env.WEBROMS_OPENMP_EMSCRIPTEN ?? `${cache}/emscripten-6.0.3`}`,
  `WEBROMS_OPENMP_LINK_ONLY=${process.argv.includes('--link-only') ? 1 : 0}`,
  'bash', `${linux(root).replace(/\/$/, '')}/scripts/prepare-openmp-kernel.sh`, target], { stdio: 'inherit', timeout: 3600000 });
if (result.status !== 0) throw new Error(`Parallel kernel build failed: ${result.error?.message ?? result.status}`);
const directory = path.join(root, '.tools/parallel-kernels');
const manifest = { format: 'webroms-parallel-kernel-v1', experimental: true, model: 'physical', mixing: 'fixed',
  emscripten: '6.0.3', flang: '21.1.8', fortranSourceCommit: '7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c',
  roms: JSON.parse(await readFile(path.join(root, 'runtime/manifest.json'), 'utf8')).roms,
  maximumThreads: 4, threadprivateImplementation: 'native-wasm-tls, limited ROMS module adapter', sha256: {} };
manifest.roms.patches.push('ROMS/Utility/memory.F: matching VMEMORY OpenMP critical names');
manifest.compilation = { fortranIR: 'O0 before native TLS adaptation', wasmBackend: 'O2, pthreads', pthreadPoolSize: 4, stackBytes: 16777216, initialMemoryBytes: 268435456 };
const variants = target === 'all' ? ['physical', 'npzd', 'nemuro', 'gls/physical', 'gls/npzd', 'gls/nemuro'] : ['physical'];
manifest.models = target === 'all' ? ['physical', 'npzd', 'nemuro'] : ['physical'];
manifest.mixing = target === 'all' ? ['fixed', 'gls'] : ['fixed'];
for (const name of variants.flatMap(variant => [`${variant}/roms.js`, `${variant}/roms.wasm`])) {
  manifest.sha256[name] = createHash('sha256').update(await readFile(path.join(directory, name))).digest('hex');
}
await mkdir(path.join(directory, 'licenses'), { recursive: true });
await copyFile(path.join(root, '.tools/parallel-probe/LICENSE.openmp.txt'), path.join(directory, 'licenses/LICENSE.openmp.txt'));
await copyFile(path.join(root, '.tools/sources/LICENSE_LLVM.txt'), path.join(directory, 'licenses/LICENSE.LLVM.txt'));
await copyFile(path.join(root, 'roms/License_ROMS.md'), path.join(directory, 'licenses/License_ROMS.md'));
for (const name of ['NetCDF-C.txt', 'NetCDF-Fortran.txt', 'NetCDF-F03.txt', 'Emscripten.txt', 'utf8proc.txt']) {
  await copyFile(path.join(root, 'licenses', name), path.join(directory, 'licenses', name));
}
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Experimental parallel kernel built; production kernels unchanged.');
