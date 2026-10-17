import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const sha = async name => createHash('sha256').update(await readFile(new URL(name, root))).digest('hex');
const comparison = JSON.parse(await readFile(new URL('.tools/parallel-kernels/comparison.json', root), 'utf8'));
if (!comparison.passed || comparison.cases.length < 6 || comparison.openmpSha256 !== await sha('.tools/parallel-kernels/physical/roms.wasm') || comparison.serialSha256 !== await sha('runtime/roms.wasm')) throw new Error('Re-run the full numerical comparison before installing this kernel');
const models = JSON.parse(await readFile(new URL('.tools/parallel-kernels/comparison-models.json', root), 'utf8'));
if (!models.passed || new Set(models.cases.map(c => c.model + '-' + c.mixing)).size !== 6) throw new Error('All six model comparisons are required');
for (const c of models.cases) {
  if (!c.passed || !['physical', 'npzd', 'nemuro'].includes(c.model) || !['fixed', 'gls'].includes(c.mixing)) throw new Error('Invalid model comparison');
  const suffix = `${c.mixing === 'gls' ? 'gls/' : ''}${c.model}/`;
  const serial = c.mixing === 'gls' ? suffix : c.model === 'physical' ? '' : suffix;
  if (c.sha256.parallel !== await sha('.tools/parallel-kernels/' + suffix + 'roms.wasm') || c.sha256.serial !== await sha('runtime/' + serial + 'roms.wasm')) throw new Error('Compared model binaries changed');
}
for (const c of models.cases) {
  const suffix = `${c.mixing === 'gls' ? 'gls/' : ''}${c.model}/`;
  await mkdir(new URL('runtime/openmp/' + suffix, root), { recursive: true });
  for (const file of ['roms.js', 'roms.wasm']) await copyFile(new URL('.tools/parallel-kernels/' + suffix + file, root), new URL('runtime/openmp/' + suffix + file, root));
}
await copyFile(new URL('.tools/parallel-kernels/licenses/LICENSE.openmp.txt', root), new URL('licenses/OpenMP.txt', root));
const manifest = JSON.parse(await readFile(new URL('runtime/manifest.json', root), 'utf8'));
manifest.openmp = { emscripten: '6.0.3', models: ['physical', 'npzd', 'nemuro'], mixing: ['fixed', 'gls'], threads: [2, 4], default: 'serial', fallback: 'serial',
  fortranSourceCommit: '7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c', threadprivate: 'native WASM TLS adapter',
  validation: { cases: [...comparison.cases.map(c => c.name), ...models.cases.map(c => c.model + '-' + c.mixing)], relativeTolerance: .01, scope: 'short integrations, all tracers and GLS coefficients; not a long-term validation' },
  additionalExperiments: 'serial checkpoint branch' };
for (const file of [...models.cases.flatMap(c => ['roms.js', 'roms.wasm'].map(f => `openmp/${c.mixing === 'gls' ? 'gls/' : ''}${c.model}/${f}`)), 'roms-worker.js']) manifest.sha256[file] = await sha('runtime/' + file);
await writeFile(new URL('runtime/manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log('Installed all six numerically compared OpenMP kernels.');
