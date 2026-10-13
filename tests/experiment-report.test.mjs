import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/model.js';
import { conditionSheets, conditionsExcel, chunksOfText } from '../src/experiment-report.js';
import { unzipSync, strFromU8 } from '../vendor/fflate.js';
import { exportPlan } from '../src/export-plan.js';

test('conditions include complete settings without mutating them and distinguish exclusive heat modes', () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8 });
  c.heat = { mode: 'air', airTemperature: 22, exchangeCoefficient: 20, netFlux: 999 };
  c.initial.painted.temp = { 0: { 12: 10.123456789 } };
  const original = structuredClone(c), sheets = conditionSheets(c);
  const json = sheets.find(s => s.name === '完全設定JSON').rows.slice(1).map(r => r[1]).join('');
  assert.deepEqual(JSON.parse(json), original);
  assert.deepEqual(c, original);
  assert.equal(sheets.find(s => s.name === '計算方式').rows.find(r => r[0] === '海面正味熱フラックス')[1], 'lambda * (Tair - SST)');
  assert.ok(sheets.find(s => s.name === '実効境界').rows.length > 1);
});

test('UTF-16 chunks preserve astral characters', () => {
  const value = 'abc\u{1F30A}def';
  assert.equal(chunksOfText(value, 4).join(''), value);
  assert.equal(chunksOfText(value, 4)[0], 'abc');
});

test('XLSX is readable XML with typed values, no executable formula in user text', async () => {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8 }); c.name = '=HYPERLINK("https://example.org","name")';
  const bytes = await conditionsExcel(c), files = unzipSync(bytes);
  assert.ok(files['xl/workbook.xml']);
  const xml = Object.entries(files).filter(([name]) => name.endsWith('.xml')).map(([, b]) => strFromU8(b)).join('\n');
  assert.ok(xml.includes('完全設定JSON'));
  assert.ok(xml.includes('HYPERLINK'));
  assert.ok(!xml.includes('<f>'));
  assert.ok(xml.includes('<v>2000</v>'));
});

test('experiment package has streaming export limits', () => {
  const plan = exportPlan(defaults(), 1, 600, 'experiment');
  assert.equal(plan.streaming, true); assert.equal(plan.count, 7);
});
