import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { astronomicalArguments, astronomicalBasis, ASTRONOMICAL_TIDE_MODEL } from '../src/tide-astronomy.js';
import { harmonicHeight, rebuildHarmonicPacket, TIDE_SPEEDS } from '../src/japan-tides.js';
import { fitTideHarmonics } from '../src/tide-harmonic-fit.js';
const epoch = '2025-12-31T15:00:00Z';
const atlas = JSON.parse(readFileSync(new URL('../src/data/japan-tides.json', import.meta.url)));

test('astronomical arguments, longitude and nodal factors use UTC', () => {
  const a = astronomicalArguments('2000-01-01T00:00:00Z');
  assert.equal(a.s, 211.728); assert.equal(a.hours, 0);
  const m = astronomicalBasis('M2', epoch, 140);
  assert.equal(m.phaseDegrees - astronomicalBasis('M2', epoch, 0).phaseDegrees, 280);
  assert.ok(m.factor > .95 && m.factor < 1.05);
  assert.equal(astronomicalBasis('S2', epoch).factor, 1);
  assert.equal(astronomicalBasis('unknown', epoch), null);
  assert.throws(() => astronomicalArguments('invalid'), /日時/);
  assert.throws(() => astronomicalArguments('2100-01-01'), /1901/);
});

test('Hakodate four-constituent reconstruction tracks independent JMA hourly prediction', () => {
  // JMA 2026-01-01 JST, 60-constituent tide table, cm above chart datum.
  // https://www.data.jma.go.jp/kaiyou/db/tide/suisan/suisan.php?stn=HK&ys=2026&ms=1&ds=1&ye=2026&me=1&de=3&LV=DL&S_HOUR=on
  const reference = [57,66,71,72,70,67,65,66,69,75,82,90,94,94,88,77,61,43,25,13,7,8,16,30];
  const point = atlas.stations.find(s => s.id === 'HK');
  const packet = { epoch, astronomy: ASTRONOMICAL_TIDE_MODEL };
  const predicted = reference.map((_, h) => 57 + harmonicHeight(packet, point, h * 3600) * 100);
  const rmse = Math.sqrt(reference.reduce((sum, value, i) => sum + (value - predicted[i]) ** 2, 0) / reference.length);
  assert.ok(rmse < 7, `four vs sixty constituents RMSE ${rmse} cm`);
  assert.ok(Math.abs(predicted.indexOf(Math.min(...predicted)) - 20) <= 1);
});

test('calendar changes rebuild wave, JSON round trip and legacy packets preserve their methods', () => {
  const point = structuredClone(atlas.stations.find(s => s.id === 'HK'));
  const packet = { epoch, astronomy: ASTRONOMICAL_TIDE_MODEL, times: [0, 1800, 3600], points: [point] };
  rebuildHarmonicPacket(packet);
  const heights = [...point.height];
  const restored = JSON.parse(JSON.stringify(packet)); rebuildHarmonicPacket(restored);
  assert.deepEqual(restored.points[0].height, heights);
  packet.epoch = '2026-01-08T15:00:00Z'; rebuildHarmonicPacket(packet);
  assert.notDeepEqual(point.height, heights);
  const legacy = { times: [0, 3600], points: [{ harmonics: { S2: { amplitudeCm: 100, lagDegrees: 0 } } }] };
  rebuildHarmonicPacket(legacy); assert.equal(legacy.points[0].height[0], 1);
  const shifted = structuredClone(restored); shifted.points[0].phaseShiftHours = 1;
  rebuildHarmonicPacket(shifted);
  assert.ok(Math.abs(shifted.points[0].height[2] - restored.points[0].height[0]) < 1e-12);
});

test('astronomical harmonic fitting recovers amplitudes and Greenwich phases without mean or trend', () => {
  const point = { lon: 0, harmonics: Object.fromEntries(Object.keys(TIDE_SPEEDS).map((name, i) => [name, { amplitudeCm: 10 * (i + 1), lagDegrees: 30 * i }])) };
  const packet = { epoch, astronomy: ASTRONOMICAL_TIDE_MODEL };
  const samples = Array.from({ length: 721 }, (_, h) => ({ utc: Date.parse(epoch) + h * 3600000, cm: 500 + .1 * h + 100 * harmonicHeight(packet, point, h * 3600) }));
  const fit = fitTideHarmonics(samples, epoch, TIDE_SPEEDS, packet.astronomy);
  for (const [name, h] of Object.entries(point.harmonics)) {
    assert.ok(Math.abs(fit.harmonics[name].amplitudeCm - h.amplitudeCm) < 1e-8);
    assert.ok(Math.abs(Math.sin((fit.harmonics[name].lagDegrees - h.lagDegrees) * Math.PI / 180)) < 1e-8);
  }
  assert.ok(fit.rmseCm < 1e-8);
});
