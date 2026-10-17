import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.tools/parallel-kernels');
const comparison = JSON.parse(await readFile(path.join(directory, 'comparison.json'), 'utf8'));
if (!comparison.passed || !comparison.cases.some(c => c.name === 'large' && c.passed)) throw new Error('Run the complete numerical comparison before benchmarking');
for (const [key, file] of [['serialSha256', 'runtime/roms.wasm'], ['openmpSha256', '.tools/parallel-kernels/physical/roms.wasm']]) {
  const actual = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  if (actual !== comparison[key]) throw new Error('Kernel changed: rerun the numerical comparison before benchmarking');
}
const runs = [];
for (const order of [[0, 1, 2, 4], [4, 2, 1, 0], [2, 0, 4, 1]]) {
  for (const threads of order) {
    const processResult = spawnSync(process.execPath, [path.join(root, 'scripts/compare-openmp-kernel.mjs'), '--run', 'large', String(threads)], { encoding: 'utf8', timeout: 600000, maxBuffer: 4 * 1024 * 1024 });
    if (processResult.status !== 0) throw new Error(processResult.stderr || 'Benchmark failed');
    const timing = JSON.parse(processResult.stdout.trim());
    runs.push({ round: runs.length / 4 | 0, ...timing });
    console.log(processResult.stdout.trim());
  }
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const mediansMs = Object.fromEntries([0, 1, 2, 4].map(threads => [threads, median(runs.filter(r => r.threads === threads).map(r => r.integrationMs))]));
const report = { grid: '100x100x15', steps: 40, repeats: 3, cpu: comparison.cpu, runs, mediansMs,
  policy: comparison.timingPolicy, speedupAgainstSerial: Object.fromEntries([1, 2, 4].map(n => [n, mediansMs[0] / mediansMs[n]])) };
await writeFile(path.join(directory, 'benchmark.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mediansMs, speedup: report.speedupAgainstSerial }, null, 2));
