import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const hashes = {};
for (const name of ['roms.js', 'roms.wasm', 'roms-template.in', 'varinfo.dat', 'roms-worker.js']) {
  hashes[name] = createHash('sha256').update(await readFile(new URL(`runtime/${name}`, root))).digest('hex');
}
await mkdir(new URL('validation/', root), { recursive: true });
for (const name of ['uniform', 'coast', 'diffusion']) {
  const source = new URL(`.tools/case-${name}/`, root);
  const report = JSON.parse(await readFile(new URL('comparison.json', source), 'utf8'));
  if (!report.passed || report.time !== 1000) throw new Error(`Invalid reference report: ${name}`);
  for (const [from, to] of [['config.json', 'config.json'], ['reference.bin', 'reference.bin'], ['comparison.json', 'comparison.json']]) {
    await copyFile(new URL(from, source), new URL(`validation/${name}-${to}`, root));
  }
}
const manifest = {
  schemaVersion: 1,
  roms: { version: '4.3', commit: '57aecf589a408b1e5490d2db7f9bd0196062a44e' },
  toolchain: { image: 'ghcr.io/r-wasm/flang-wasm@sha256:bbaa3dc304de5b10df973cc8c49dbcd52ec815c309c35e9643ffe95d0e85b384', flang: '21.1.8', llvmCommit: '7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c', emscripten: '5.0.7', nativeReference: 'gfortran 15.2' },
  netcdf: { c: '4.9.3', fortran: '4.6.2', format: 'classic', fortranWrappers: 'legacy rank-aware' },
  validation: { cases: ['uniform', 'coast', 'diffusion'], steps: 100, seconds: 1000, scaledTolerance: 1e-8 },
  sha256: hashes
};
await writeFile(new URL('runtime/manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log('Recorded reviewed runtime and native reference validation.');
