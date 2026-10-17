import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--raw-link')) {
  await import('./build-openmp-runtime.mjs');
  process.exit(process.exitCode ?? 0);
}

// An isolated capability check: never overwrites a released ROMS kernel.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const out = path.join(root, '.tools/parallel-probe');
await mkdir(out, { recursive: true });
const linux = value => value.replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/mnt/${drive.toLowerCase()}/`).replaceAll('\\', '/');
const toolchain = linux(path.join(out, 'toolchain'));
const flang = process.env.WEBROMS_PROBE_FLANG ?? `${toolchain}/opt/flang/host/bin/flang`;
const linker = process.env.WEBROMS_PROBE_LD ?? linux(path.join(root, '.tools/flang-root/opt/emsdk/upstream/bin/wasm-ld'));
const loader = process.env.WEBROMS_PROBE_LOADER ?? `${toolchain}/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`;
const report = { format: 'webroms-openmp-probe-v1', date: new Date().toISOString(), flang, linker, stages: [], supported: false, romsParallelEnabled: false };
function execute(stage, command, args) {
  const invocation = process.platform === 'win32'
    ? ['wsl', ['-d', process.env.WEBROMS_PROBE_DISTRO ?? 'Ubuntu-24.04', '--', loader, '--argv0', command, '--library-path', `${toolchain}/usr/lib/x86_64-linux-gnu`, command, ...args]]
    : [command, args];
  const result = spawnSync(...invocation, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
  report.stages.push({ stage, exitCode: result.status, diagnostics: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`.slice(-16000) });
  return result.status === 0;
}
try {
  for (const parallel of [false, true]) {
    const name = parallel ? 'openmp' : 'serial';
    const object = linux(path.join(out, `${name}.o`)), wasm = linux(path.join(out, `${name}.wasm`));
    if (!execute(`${name}-compile`, flang, ['-fc1', '-triple', 'wasm32-unknown-emscripten', '-O2', ...(parallel ? ['-fopenmp'] : []), '-emit-obj', linux(path.join(root, 'native/openmp-probe.f90')), '-o', object])) break;
    if (!execute(`${name}-link`, linker, ['--no-entry', '--export=webroms_omp_probe', object, '-o', wasm])) break;
    const { instance } = await WebAssembly.instantiate(await readFile(path.join(out, `${name}.wasm`)));
    const threads = instance.exports.webroms_omp_probe();
    report.stages.push({ stage: `${name}-execute`, expectedThreads: parallel ? 2 : 1, actualThreads: threads });
    if (threads !== (parallel ? 2 : 1)) break;
    if (parallel) report.supported = true;
  }
} catch (error) { report.error = error.message; }
await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.supported) process.exitCode = 1;
