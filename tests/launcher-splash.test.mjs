import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

test('startup splash renders and closes when the browser connects', { skip: process.platform !== 'win32' }, async () => {
  await mkdir('test-results', { recursive: true });
  const compiler = path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  const output = path.resolve('test-results/launcher-splash-test.exe');
  execFileSync(compiler, ['/nologo', '/target:winexe', '/main:SplashTest', `/win32icon:${path.resolve('assets/webroms.ico')}`, '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll',
    `/out:${output}`, path.resolve('scripts/windows-launcher/Launcher.cs'), path.resolve('tests/fixtures/launcher-splash.cs')]);
  assert.doesNotThrow(() => execFileSync(output, [path.resolve('test-results/launcher-splash.png')], { windowsHide: true, timeout: 10000 }));
});
