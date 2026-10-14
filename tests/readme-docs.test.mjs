import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

test('README and its explanation pages have valid local links', async () => {
  for (const name of ['README.md', 'docs/TECHNICAL_OVERVIEW.md', 'docs/README_EXAMPLES.md']) {
    const url = new URL('../' + name, import.meta.url), source = await readFile(url, 'utf8');
    for (const match of source.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
      if (/^https?:|^#/.test(match[1])) continue;
      await assert.doesNotReject(access(new URL(match[1].split('#')[0], url)), `${name}: ${match[1]}`);
    }
  }
});

test('README figures are rendered PNGs and examples describe an actual completed run', async () => {
  for (const name of ['readme-workflow.png', 'readme-architecture.png', 'readme-files.png', 'readme/results-temperature.png', 'readme/results-biology.png']) {
    const bytes = await readFile(new URL('../docs/images/' + name, import.meta.url));
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok(bytes.readUInt32BE(16) >= 1000); assert.ok(bytes.readUInt32BE(20) >= 300);
  }
  const config = JSON.parse(await readFile(new URL('../docs/examples/readme-wind-npzd.json', import.meta.url)));
  const metadata = JSON.parse(await readFile(new URL('../docs/images/readme/metadata.json', import.meta.url)));
  assert.equal(config.numerics.dt * config.numerics.maxSteps / 3600, metadata.modelHours);
  assert.deepEqual([config.grid.nx, config.grid.ny, config.grid.nz], metadata.grid);
  assert.equal(metadata.steadyStateClaim, false);
});

test('the entry README separates conceptual content from operation and build instructions', async () => {
  const source = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(source.includes('何が変わるのか')); assert.ok(source.includes('使う場面')); assert.ok(source.includes('構成とワークフロー'));
  assert.ok(!source.includes('```')); assert.ok(!source.includes('pnpm install'));
});

test('README describes all eight current stages and distinguishes particle positions from saved tracks', async () => {
  const source = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  for (const title of ['01 海底地形', '02 生態系モデル', '03 初期条件', '04 境界条件', '05 河川の設定', '06 風の強制力', '07 定常計算', '08 追加実験']) assert.ok(source.includes(title));
  assert.ok(!source.includes('7工程それぞれ'));
  assert.ok(source.includes('時系列の軌跡はNetCDFで保存'));
  assert.ok(source.includes('４境界の平均潮位'));
});
