import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaults, buildFields } from '../src/model.js';
import { ensureOcean } from '../src/ocean-boundary.js';
import { japanTidePacket, rebuildHarmonicPacket, csvRows } from '../src/japan-tides.js';
import { tideExportRows, tideCsv, parseTideRows, correctBoundaryTideSeries, coversCorrectionMonth } from '../src/tide-spreadsheet.js';
const atlas = JSON.parse(await readFile(new URL('../src/data/japan-tides.json', import.meta.url), 'utf8'));
function setup() {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', geoBounds: { west: 135.1, east: 135.4, south: 34.3, north: 34.6 } });
  Object.assign(ensureOcean(config), { tideMode: 'auto', predictionDays: 2 });
  const fields = buildFields(config); config.ocean.tides = japanTidePacket(atlas, config, fields);
  return { config, fields };
}
test('exported tide rows contain the displayed period, shifted waveform and explicit cm columns', () => {
  const { config, fields } = setup(); config.ocean.tides.phaseShiftHours = 3; rebuildHarmonicPacket(config.ocean.tides);
  const rows = tideExportRows(config, fields, 'west', 6, 7);
  assert.equal(rows.length, 4); assert.equal(rows[1][0], '2026-01-01T06:00:00.000Z');
  assert.equal(rows.at(-1)[0], '2026-01-01T07:00:00.000Z');
  const points = config.ocean.tides.points.filter(p => p.cell % 8 === 0);
  assert.ok(Math.abs(rows[1][1] - points.reduce((sum, p) => sum + p.height[12], 0) / points.length * 100) < 1e-8);
  assert.equal(parseTideRows(csvRows(tideCsv(rows)), 'absolute').length, 3);
});
test('CSV correction changes only its selected side and time window and survives harmonic rebuilding', () => {
  const { config, fields } = setup(), original = structuredClone(config.ocean.tides);
  const samples = parseTideRows([['time_utc', 'correction_cm'], ['2026-01-01T06:00:00Z', 10], ['2026-01-01T07:00:00Z', 10]]);
  const packet = correctBoundaryTideSeries(config, fields, 'west', samples, 'residual', 'test.csv');
  const west = packet.points.find(p => p.cell === 8), before = original.points.find(p => p.cell === 8);
  assert.ok(Math.abs(west.height[12] - before.height[12] - .1) < 1e-10);
  assert.equal(west.height[11], before.height[11]); assert.equal(west.height[15], before.height[15]);
  assert.deepEqual(packet.points.find(p => p.cell === 15).height, original.points.find(p => p.cell === 15).height);
  const saved = JSON.parse(JSON.stringify(packet)); rebuildHarmonicPacket(saved);
  assert.deepEqual(saved.points.find(p => p.cell === 8).height, west.height);
  assert.throws(() => correctBoundaryTideSeries(config, fields, 'west', samples.map(sample => ({ ...sample, cm: 1000 })), 'residual', 'bad.csv'), /許容幅/);
});
test('spreadsheet parser rejects wrong headers, missing values and reversed UTC times', () => {
  assert.throws(() => parseTideRows([['time_utc', 'tide_cm'], ['2026-01-01T00:00:00Z', 0], ['2026-01-01T01:00:00Z', 0]]), /correction_cm/);
  assert.throws(() => parseTideRows([['time_utc', 'correction_cm'], ['2026-01-01T01:00:00Z', 0], ['2026-01-01T00:00:00Z', 0]]), /昇順/);
  assert.throws(() => parseTideRows([['time_utc', 'correction_cm'], ['2026-01-01T00:00:00Z', ''], ['2026-01-01T01:00:00Z', 0]]), /不正/);
});
test('JMA-style JST observation columns convert to UTC and full February hourly coverage counts as a month', () => {
  const samples = parseTideRows([['time_jst', 'observed_cm'], ['2026-02-01 00:00', 100], ['2026-02-28 23:00', 101]], 'observed');
  assert.equal(samples[0].utc, Date.parse('2026-01-31T15:00:00Z'));
  assert.equal(coversCorrectionMonth(samples), true);
  assert.equal(coversCorrectionMonth([{ utc: 0 }, { utc: 86400000 }]), false);
});
test('relative observed-water-level correction removes the arbitrary gauge offset, while absolute mode requires an offset', () => {
  const { config, fields } = setup();
  const rows = tideExportRows(config, fields, 'west', 0, 3);
  const samples = rows.slice(1).map(row => ({ utc: Date.parse(row[0]), cm: row[1] + 500 }));
  const corrected = correctBoundaryTideSeries(config, fields, 'west', samples, 'observed', 'jma.xlsx', { mode: 'relative' });
  corrected.points.filter(point => point.cell % 8 === 0).forEach(point => point.heightCorrections.forEach(value => assert.ok(Math.abs(value) < 1e-10)));
  assert.equal(corrected.seriesCorrectionFiles[0].observationMode, 'relative');
  assert.throws(() => correctBoundaryTideSeries(config, fields, 'west', samples, 'observed', 'jma.xlsx', { mode: 'offset' }), /加算値/);
  const absolute = correctBoundaryTideSeries(config, fields, 'west', samples, 'observed', 'jma.xlsx', { mode: 'offset', datumOffsetCm: -500 });
  absolute.points.filter(point => point.cell % 8 === 0).forEach(point => point.heightCorrections.forEach(value => assert.ok(Math.abs(value) < 1e-10)));
  config.ocean.corrections = [{}];
  assert.throws(() => correctBoundaryTideSeries(config, fields, 'west', samples, 'observed', 'jma.xlsx', { mode: 'relative' }), /二重補正/);
});
