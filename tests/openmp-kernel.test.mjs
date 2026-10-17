import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { fixture } from './runtime-helper.mjs';

test('browser Worker runs the real physical ROMS kernel with 2 and 4 OpenMP threads', { timeout: 120000 }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await assert.doesNotReject(readFile(path.join(root, '.tools/parallel-kernels/physical/roms.wasm')), 'Build the OpenMP kernel first');
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>ROMS OpenMP test</title>'); return; }
      const name = decodeURIComponent(url.pathname).slice(1);
      if (!['runtime/', 'src/', 'vendor/', '.tools/parallel-kernels/physical/'].some(prefix => name.startsWith(prefix))) throw new Error('Not allowed');
      const file = path.resolve(root, name), relative = path.relative(root, file);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Not allowed');
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
      response.end(await readFile(file));
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const config = fixture('coast');
    Object.assign(config.grid, { nx: 16, ny: 16 });
    Object.assign(config.numerics, { dt: 1, maxSteps: 50 });
    const result = await page.evaluate(async config => {
      if (!crossOriginIsolated) throw new Error('Shared memory isolation is missing');
      async function run(threads) {
        const code = `import createRoms from '${location.origin}/${threads ? '.tools/parallel-kernels/physical' : 'runtime'}/roms.js';
          import {writeInputs} from '${location.origin}/src/roms-input.js';
          import {snapshot} from '${location.origin}/src/runtime-state.js';
          self.onmessage=async ({data: config})=>{
            let runtime, initialized=false; const logs=[];
            try {
              runtime=await createRoms({print:s=>logs.push(s),printErr:s=>logs.push(s)});
              if(${threads}) runtime._webroms_set_threads(${threads});
              runtime.FS.writeFile('varinfo.dat',new Uint8Array(await (await fetch('${location.origin}/runtime/varinfo.dat')).arrayBuffer()));
              const masks=writeInputs(runtime,config,await (await fetch('${location.origin}/runtime/roms-template.in')).text());
              if(${threads}>1) {
                const input=runtime.FS.readFile('roms.in',{encoding:'utf8'}).replace(/(NtileI\\s*==)\\s*1/, '$1 2').replace(/(NtileJ\\s*==)\\s*1/,'$1 '+(${threads}===4?2:1));
                runtime.FS.writeFile('roms.in',input);
              }
              const code=runtime._webroms_init(); if(code) throw new Error('ROMS init '+code);
              initialized=true;
              if(${threads} && runtime._webroms_roms_threads()!==${threads}) throw new Error('ROMS threads mismatch');
              for(let i=0;i<config.numerics.maxSteps;i++) if(runtime._webroms_step()) throw new Error('ROMS step '+i);
              postMessage({state:snapshot(runtime,config),mask:masks.mask,maskU:masks.maskU,maskV:masks.maskV,time:runtime._webroms_time()});
            } catch(e) {postMessage({error:String(e),logs:logs.slice(-20)});}
            finally {if(initialized) runtime._webroms_finalize();}
          };`;
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
          const worker = new Worker(url, { type: 'module' });
          const cleanup = () => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); };
          const timer = setTimeout(() => { cleanup(); reject(new Error('ROMS browser test timed out')); }, 60000);
          worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(JSON.stringify(data))) : resolve(data); };
          worker.onerror = event => { cleanup(); reject(new Error(event.message)); };
          worker.postMessage(config);
        });
      }
      const { compareNumericalField } = await import('/src/numerical-comparison.js');
      const reference = await run(0), metrics = [];
      for (const threads of [2, 4]) {
        const candidate = await run(threads);
        if (candidate.time !== reference.time) throw new Error('Times differ');
        for (const [name, values] of Object.entries(reference.state)) {
          const base = ['u', 'ubar'].includes(name) ? reference.maskU : ['v', 'vbar'].includes(name) ? reference.maskV : reference.mask;
          const scale = ({ temp: 10, salt: 1, h: 100, z_r: 100 })[name] ?? .1;
          metrics.push({ threads, field: name, ...compareNumericalField(values, candidate.state[name], { scale, mask: Uint8Array.from(values, (_, i) => base[i % base.length]) }) });
        }
      }
      return metrics;
    }, config);
    assert.equal(result.length, 18);
    assert(result.every(m => m.passed), JSON.stringify(result.filter(m => !m.passed)));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
