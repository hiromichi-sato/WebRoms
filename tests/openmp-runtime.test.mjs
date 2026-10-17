import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const directory = new URL('../.tools/parallel-probe/', import.meta.url);
test('Flang OpenMP runtime executes 1, 2 and 4 threads inside a browser Worker', { timeout: 60000 }, async () => {
  await assert.doesNotReject(readFile(new URL('openmp.cjs', directory)), 'Run npm run build:openmp before this test');
  const server = http.createServer(async (request, response) => {
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    try {
      const name = request.url.slice(1);
      if (!['openmp.cjs', 'openmp.wasm'].includes(name)) {
        response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>OpenMP runtime check</title>'); return;
      }
      response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
      response.end(await readFile(new URL(name, directory)));
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.equal(await page.evaluate(() => crossOriginIsolated), true);
    const results = await page.evaluate(() => new Promise((resolve, reject) => {
      const script = `importScripts('${location.origin}/openmp.cjs');
        createOpenMPProbe({locateFile: name => '${location.origin}/' + name}).then(m => {
          postMessage([1,2,4].map(n => ({requested:n, threads:m._webroms_omp_threads(n), mask:m._webroms_omp_thread_mask(n), sum:m._webroms_omp_sum(n)})));
        }).catch(e => postMessage({error:String(e)}));`;
      const url = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
      const worker = new Worker(url);
      const cleanup = () => { clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('OpenMP browser probe timed out')); }, 30000);
      worker.onmessage = event => { cleanup(); resolve(event.data); };
      worker.onerror = event => { cleanup(); reject(new Error(event.message)); };
    }));
    assert.deepEqual(results, [1, 2, 4].map(n => ({ requested: n, threads: n, mask: (1 << n) - 1, sum: 250250 })));
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
