import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { ensureOcean, boundaryPoints, gridSignature } from '../src/ocean-boundary.js';
import { tideDataRows } from '../src/tide-data-info.js';

function fixture() {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, preset: 'uniform', geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  ensureOcean(config).tideMode = 'auto';
  return { config, fields: buildFields(config) };
}
test('idealized input is not misrepresented as JMA harmonics', () => {
  const { config, fields } = fixture(), rows = Object.fromEntries(tideDataRows(config, fields));
  assert.match(rows['日本の潮汐データの同梱'], /TidalData_jp.csv/);
  assert.match(rows.M2, /30 cm/);
  assert.match(rows['位相の基準'], /調和定数ではありません/);
  config.ocean.tideMode = 'off';
  assert.equal(Object.fromEntries(tideDataRows(config, fields))['使用状態'], '潮汐なし');
});
test('time series reports source, cells and correction without inventing lag', () => {
  const { config, fields } = fixture();
  config.ocean.tides = { gridSignature: gridSignature(config), epoch: config.ocean.startUtc, source: 'user data', times: [0, 3600], points: boundaryPoints(config, fields).map(p => ({ ...p, height: [-.2, .3] })) };
  const rows = tideDataRows(config, fields), named = Object.fromEntries(rows);
  assert.equal(named['出典'], 'user data');
  assert.match(named['分潮・遅角'], /特定できません/);
  assert.equal(rows.filter(([name]) => name.startsWith('セル (')).length, config.ocean.tides.points.length);
});
