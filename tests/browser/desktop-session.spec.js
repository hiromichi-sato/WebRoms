import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { test, expect } from './app-fixture.js';

test('Windows server survives reload and stops only after its last tab closes', async ({ browser }) => {
  test.skip(process.platform !== 'win32', 'Windows launcher lifecycle');
  const shell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
    path.resolve('scripts/windows-launcher/start-webroms.ps1'), '-NoBrowser', '-AutoExit', '-Port', '5390'], { windowsHide: true });
  let output = '', first, second;
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(output || 'Startup timeout')), 30000);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/WebROMS: (http:\/\/127\.0\.0\.1:\d+\/\?desktopSession=[a-f0-9]{32})/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Exited ${code}: ${output}`)); });
    });
    first = await browser.newPage(); second = await browser.newPage();
    await first.goto(url); await second.goto(url);
    await expect(first.locator('#stepTitle')).toBeVisible();
    await first.reload();
    await expect(first.locator('#stepTitle')).toBeVisible();
    await first.close();
    // A closed sibling must not stop a still-open application tab.
    await new Promise(resolve => setTimeout(resolve, 11000));
    expect((await fetch(url)).status).toBe(200);
    await expect(second.locator('#stepTitle')).toBeVisible();
    await second.close();
    expect(await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('timeout'), 20000))])).toBe(0);
    await expect(fetch(url)).rejects.toThrow();
  } finally {
    await first?.close(); await second?.close();
    if (child.exitCode === null && child.pid) execFileSync(path.join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
  }
});
