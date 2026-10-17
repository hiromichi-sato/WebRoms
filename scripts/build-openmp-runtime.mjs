import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Developer-only toolchain: never replaces a released ROMS kernel.
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
if (process.platform !== 'win32') throw new Error('This developer build entry point requires Windows with WSL Ubuntu-24.04');
const out = path.join(root, '.tools/parallel-probe');
await mkdir(out, { recursive: true });
const linux = p => p.replace(/^([A-Za-z]):[\\/]/, (_, d) => `/mnt/${d.toLowerCase()}/`).replaceAll('\\', '/');
const base = linux(root);
const sdk = `${base}/.tools/flang-root/opt/emsdk`;
const archive = path.join(root, '.tools/openmp/emscripten-6.0.3.tar.gz');
const archiveSha256 = '033241f96a5c50993b43d8383c3356d2804932f5b3548e94c9839c4f68e8b5bd';
await mkdir(path.dirname(archive), { recursive: true });
let archiveBytes;
try { archiveBytes = await readFile(archive); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch('https://codeload.github.com/emscripten-core/emscripten/tar.gz/refs/tags/6.0.3');
  if (!response.ok) throw new Error(`Emscripten download failed: ${response.status}`);
  archiveBytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archiveBytes).digest('hex') !== archiveSha256) throw new Error('Emscripten archive checksum mismatch');
  await writeFile(archive, archiveBytes);
}
if (createHash('sha256').update(archiveBytes).digest('hex') !== archiveSha256) throw new Error('Emscripten archive checksum mismatch');
const distro = process.env.WEBROMS_PROBE_DISTRO ?? 'Ubuntu-24.04';
const home = spawnSync('wsl', ['-d', distro, '--', 'printenv', 'HOME'], { encoding: 'utf8' });
if (home.status !== 0) throw new Error('WSL HOME could not be resolved');
const source = process.env.WEBROMS_OPENMP_EMSCRIPTEN ?? `${home.stdout.trim()}/.cache/webroms-openmp/emscripten-6.0.3`;
if ([base, source].some(value => /['\r\n]/.test(value))) throw new Error('Build paths must not contain single quotes or newlines');
const config = path.join(out, 'emscripten-openmp.config');
await writeFile(config, `LLVM_ROOT = ${JSON.stringify(`${sdk}/upstream/bin`)}\nBINARYEN_ROOT = ${JSON.stringify(`${sdk}/upstream`)}\nNODE_JS = [${JSON.stringify(`${sdk}/node/22.16.0_64bit/bin/node`)}]\nCACHE = ${JSON.stringify(`${source}/cache`)}\n`);
const toolchain = `${base}/.tools/parallel-probe/toolchain`;
const flang = `${toolchain}/opt/flang/host/bin/flang`;
const loader = `${toolchain}/usr/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2`;
const env = `export EM_CONFIG='${linux(config)}'; export PATH="${sdk}/node/22.16.0_64bit/bin:$PATH";`;
const commands = [
  `if [ ! -f '${source}/tools/system_libs.py' ]; then mkdir -p '${source}' && tar -xzf '${linux(archive)}' -C '${source}' --strip-components=1 --exclude=emscripten-6.0.3/test --exclude=emscripten-6.0.3/site; fi`,
  `if [ ! -f '${sdk}/upstream/lib/clang/23/include/stdatomic.h' ]; then tar -xzf '${base}/.tools/oci/layer-2.tar.gz' -C '${base}/.tools/flang-root' opt/emsdk/upstream/lib/clang/23; fi`,
  `${env} cd '${source}' && mkdir -p test && python3 tools/maint/create_entry_points.py && if [ ! -d node_modules/acorn ]; then node '${sdk}/node/22.16.0_64bit/lib/node_modules/npm/bin/npm-cli.js' ci --ignore-scripts --no-audit --no-fund; fi`,
  `${env} python3 '${source}/emcc.py' --version`,
  `${env} '${loader}' --argv0 '${flang}' --library-path '${toolchain}/usr/lib/x86_64-linux-gnu' '${flang}' -fc1 -triple wasm32-unknown-emscripten -O2 -fopenmp -emit-llvm '${base}/native/openmp-runtime-check.f90' -o '${linux(out)}/openmp.ll'`,
  `${env} python3 '${source}/emcc.py' '${linux(out)}/openmp.ll' -O2 -fopenmp -pthread -sPTHREAD_POOL_SIZE=4 -sEXIT_RUNTIME=1 -sEXPORTED_FUNCTIONS=_webroms_omp_threads,_webroms_omp_sum,_webroms_omp_thread_mask -sEXPORTED_RUNTIME_METHODS=ccall -sMODULARIZE=1 -sEXPORT_NAME=createOpenMPProbe -o '${linux(out)}/openmp.cjs'`,
  `${env} node '${base}/scripts/run-openmp-probe.cjs' '${linux(out)}/openmp.cjs'`,
];
const report = { format: 'webroms-openmp-runtime-v1', emscripten: '6.0.3', archiveSha256, stages: [], supported: false, romsParallelEnabled: false };
for (const command of commands) {
  const result = spawnSync('wsl', ['-d', process.env.WEBROMS_PROBE_DISTRO ?? 'Ubuntu-24.04', '--', 'bash', '-lc', command], { encoding: 'utf8', timeout: 900000, maxBuffer: 4 * 1024 * 1024 });
  const diagnostics = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
  console.log(diagnostics);
  report.stages.push({ command, exitCode: result.status, diagnostics });
  if (result.status !== 0) break;
}
report.supported = report.stages.length === commands.length && report.stages.every(s => s.exitCode === 0);
if (report.supported) {
  // Keep the archive and its license together, outside the production runtime.
  const cacheFile = `${source}/cache/sysroot/lib/wasm32-emscripten/libopenmp.a`;
  const copy = spawnSync('wsl', ['-d', distro, '--', 'cp', cacheFile, `${linux(out)}/libopenmp.a`], { encoding: 'utf8' });
  if (copy.status !== 0) throw new Error(copy.stderr || 'Could not retain libopenmp.a');
  const license = spawnSync('wsl', ['-d', distro, '--', 'cat', `${source}/system/lib/openmp/LICENSE.TXT`], { encoding: 'utf8' });
  if (license.status !== 0) throw new Error('OpenMP license could not be read');
  await writeFile(path.join(out, 'LICENSE.openmp.txt'), license.stdout);
  report.librarySha256 = createHash('sha256').update(await readFile(path.join(out, 'libopenmp.a'))).digest('hex');
  report.artifactSha256 = {};
  for (const name of ['openmp.cjs', 'openmp.wasm']) {
    report.artifactSha256[name] = createHash('sha256').update(await readFile(path.join(out, name))).digest('hex');
  }
}
await writeFile(path.join(out, 'runtime-report.json'), JSON.stringify(report, null, 2));
if (!report.supported) process.exitCode = 1;
