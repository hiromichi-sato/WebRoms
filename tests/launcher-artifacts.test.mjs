import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('the clone contains one visible startup EXE with an icon and no BAT', async () => {
  const exe = await readFile(new URL('../00_WebROMS\u3092\u8d77\u52d5.exe', import.meta.url));
  assert.equal(exe.subarray(0, 2).toString(), 'MZ');
  const pe = exe.readUInt32LE(60); assert.equal(exe.subarray(pe, pe + 4).toString(), 'PE\0\0');
  const icon = await readFile(new URL('../assets/webroms.ico', import.meta.url));
  assert.equal(icon.readUInt16LE(2), 1); assert.equal(icon.readUInt16LE(4), 4);
  assert.ok(icon.length > 1000);
  await access(new URL('../scripts/windows-launcher/start-webroms.ps1', import.meta.url));
  await assert.rejects(access(new URL('../start-webroms.bat', import.meta.url)));
  await assert.rejects(access(new URL('../start-webroms.ps1', import.meta.url)));
});
