import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const biologyOnly = process.argv.includes('--biology');
const previous = biologyOnly ? JSON.parse(await readFile(new URL('runtime/manifest.json', root), 'utf8')) : null;
const hashes = {};
const current = JSON.parse(await readFile(new URL('runtime/manifest.json', root), 'utf8'));
if (current.openmp) for (const name of Object.keys(current.sha256).filter(name => name.startsWith('openmp/'))) hashes[name] = createHash('sha256').update(await readFile(new URL('runtime/' + name, root))).digest('hex');
for (const name of ['roms.js', 'roms.wasm', 'roms-template.in', 'varinfo.dat', 'roms-worker.js', 'export-worker.js', 'npzd/roms.js', 'npzd/roms.wasm', 'nemuro/roms.js', 'nemuro/roms.wasm', ...['physical', 'npzd', 'nemuro'].flatMap(model => [`gls/${model}/roms.js`, `gls/${model}/roms.wasm`])]) {
  hashes[name] = createHash('sha256').update(await readFile(new URL(`runtime/${name}`, root))).digest('hex');
}
await mkdir(new URL('validation/', root), { recursive: true });
for (const name of [...(biologyOnly ? [] : ['uniform', 'coast', 'diffusion']), 'npzd', 'nemuro', 'gls-physical']) {
  const source = new URL(`.tools/case-${name}/`, root);
  const report = JSON.parse(await readFile(new URL('comparison.json', source), 'utf8'));
  if (!report.passed || report.time !== (['npzd', 'nemuro'].includes(name) ? 3600 : 1000)) throw new Error(`Invalid reference report: ${name}`);
  for (const [from, to] of [['config.json', 'config.json'], ['reference.bin', 'reference.bin'], ['comparison.json', 'comparison.json']]) {
    await copyFile(new URL(from, source), new URL(`validation/${name}-${to}`, root));
  }
}
const manifest = {
  ...(current.openmp ? { openmp: current.openmp } : {}),
  schemaVersion: 1,
  roms: { version: '4.3', commit: '57aecf589a408b1e5490d2db7f9bd0196062a44e', patches: ['native/nemuro-river-var.h (river tracer metadata IDs)', 'native/ana_stflux.h (exclusive idealized air exchange or prescribed surface heat flux)'] },
  heat: { version: 1, modes: ['off', 'air', 'flux'], air: 'Q = lambda * (Tair - SST), not a meteorological bulk formula', flux: 'W/m2, positive into ocean', kinematicConversion: 'Q / (rho0 * Cp)', default: 'off' },
  toolchain: { image: 'ghcr.io/r-wasm/flang-wasm@sha256:bbaa3dc304de5b10df973cc8c49dbcd52ec815c309c35e9643ffe95d0e85b384', flang: '21.1.8', llvmCommit: '7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c', emscripten: '5.0.7', nativeReference: 'gfortran 15.2' },
  netcdf: { c: '4.9.3', fortran: '4.6.2', format: 'classic', fortranWrappers: 'legacy rank-aware' },
  mixing: { closure: 'GLS k-epsilon / Canuto A', horizontal: 'fixed', background: 0.0001, validation: { cases: ['gls-physical'], steps: 100, seconds: 1000, scaledTolerance: 1e-8 } },
  validation: previous?.validation ?? { cases: ['uniform', 'coast', 'diffusion'], steps: 100, seconds: 1000, scaledTolerance: 1e-8 },
  biology: {
    models: { npzd: { option: 'NPZD_FRANKS', tracers: 4 }, nemuro: { option: 'NEMURO', grazing: 'IVLEV_EXPLICIT', tracers: 11 } },
    validation: { cases: ['npzd', 'nemuro'], steps: 60, seconds: 3600, scaledTolerance: 1e-8 }
  },
  floats: { version: 1, option: 'FLOATS', modes: ['Lagrangian 3D', 'Geopotential constant depth'], maxParticles: 512, integration: 'ROMS Milne predictor / Hamming corrector', randomWalk: false, biology: false, bridge: 'native/floats-bridge.f90', validation: 'tests/particle-runtime.test.mjs (late release, advection, depth, reseeding, pause and NetCDF)' },
  checkpoint: { option: 'PERFECT_RESTART', scope: 'transient in-memory ocean state for additional experiments; not user-saveable restart', bridge: 'native/bridge.f90', validation: 'tests/ocean-checkpoint.test.mjs' },
  sha256: hashes
};
await writeFile(new URL('runtime/manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log('Recorded reviewed runtime and native reference validation.');
