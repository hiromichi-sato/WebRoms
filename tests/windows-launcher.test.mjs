import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { chromium } from '@playwright/test';
import { defaults } from '../src/model.js';

test('Windows package starts without Node, serves WASM and runs ROMS in Edge', { skip: process.platform !== 'win32', timeout: 120000 }, async () => {
  const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const destination = path.resolve('test-results', `Windows space \u65e5\u672c\u8a9e ${Date.now()}`);
  await mkdir(destination, { recursive: true });
  const quote = s => "'" + s.replaceAll("'", "''") + "'";
  execFileSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory(${quote(path.resolve('releases/WebROMS-windows.zip'))}, ${quote(destination)})`]);
  const root = path.join(destination, 'WebROMS');
  const blocker = net.createServer(socket => socket.destroy());
  await new Promise(resolve => blocker.listen(0, '127.0.0.1', resolve));
  const port = blocker.address().port;
  const child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'start-webroms.ps1'), '-NoBrowser', '-Port', String(port)], {
    cwd: process.env.SystemRoot, windowsHide: true, env: { ...process.env, PATH: process.env.SystemRoot }
  });
  let output = ''; let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Launcher timed out: ${output}`)), 15000);
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/WebROMS: (http:\/\/127\.0\.0\.1:\d+\/)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Launcher exited ${code}: ${output}`)); });
    });
    assert.notEqual(Number(new URL(url).port), port);
    const wasm = await fetch(url + 'runtime/roms.wasm');
    assert.equal(wasm.headers.get('content-type'), 'application/wasm');
    assert.deepEqual(Buffer.from(await wasm.arrayBuffer()), await readFile(path.join(root, 'dist/runtime/roms.wasm')));
    assert.equal((await fetch(url + 'missing-file')).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    assert.equal((await fetch(url + '%2e%2e%2fstart-webroms.ps1')).status, 403);
    browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // External access is disabled: all calculation assets must be inside the ZIP.
    await page.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    await page.goto(url);
    const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
    config.initial.distribution = 'uniform'; Object.assign(config.numerics, { maxSteps: 30, steadyWindow: 5, tolerance: 1e-10 });
    await page.evaluate(config => localStorage.setItem('webroms.project.v1', JSON.stringify(config)), config);
    await page.reload(); await page.locator('[data-step="3"]').click(); await page.locator('#calculateButton').click();
    await page.waitForFunction(() => document.querySelector('#convergence').textContent === '\u5b9a\u5e38\u5224\u5b9a\u9054\u6210', null, { timeout: 60000 });
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); child.kill(); blocker.close();
  }
});
