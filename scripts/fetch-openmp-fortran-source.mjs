import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../.tools/openmp/fortran-runtime-source/', import.meta.url));
const commit = '7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c';
await mkdir(directory, { recursive: true });
function git(...args) {
  const result = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || 'Git command failed');
  return result.stdout.trim();
}
if (!existsSync(new URL('../.tools/openmp/fortran-runtime-source/.git', import.meta.url))) {
  git('init'); git('remote', 'add', 'origin', 'https://github.com/r-wasm/llvm-project.git');
  git('config', 'remote.origin.promisor', 'true');
  git('config', 'remote.origin.partialclonefilter', 'blob:none');
  git('fetch', '--depth=1', '--filter=blob:none', 'origin', commit);
  git('sparse-checkout', 'set', 'flang/include', 'flang/lib/Decimal', 'flang-rt/include', 'flang-rt/lib/runtime', 'llvm/include');
  git('checkout', '--detach', commit);
}
if (git('rev-parse', 'HEAD') !== commit || git('status', '--porcelain')) throw new Error('Fortran runtime source differs from the pinned clean revision; refusing to overwrite it');
console.log(`Pinned Fortran runtime source ready: ${commit}`);
