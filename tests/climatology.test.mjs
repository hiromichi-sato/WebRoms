import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaults, buildFields } from '../src/model.js';
import * as c from '../src/climatology.js';
import { parseWoaCsv, reduceRegion } from '../scripts/fetch-climatology.mjs';
import { parseGodasAscii } from '../scripts/fetch-climatology-enso.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
function config() {
  const value = defaults();
  Object.assign(value.grid, { nx: 8, ny: 8, preset: 'bay', minDepth: 60, maxDepth: 240 });
  value.ecosystem.enabled = true;
  return value;
}

test('bundled payload hashes and all field dimensions are consistent', () => {
  const w = c.CLIMATOLOGY_DATA, e = c.ENSO_DATA;
  assert.equal(hash(JSON.stringify({ depthsM: w.depthsM, regions: w.regions, variables: w.variables, profiles: w.profiles })), w.payloadSha256);
  assert.equal(hash(JSON.stringify({ depthsM: e.depthsM, profiles: e.profiles })), e.payloadSha256);
  assert.equal(e.payloadSha256, '29bbb29105ede297be36344edf1e12b6e2ecf844c13706912c044dc784f6d50f');
  for (const data of [w, e]) {
    for (const source of Object.values(data.sources)) {
      assert.match(new URL(source.url).hostname, /\.noaa\.gov$/);
      assert.match(source.sha256, /^[0-9a-f]{64}$/);
      assert.ok(source.bytes > 0);
    }
    for (const profile of data.profiles) for (const field of Object.values(profile.fields)) {
      assert.equal(field.values.length, data.depthsM.length);
      assert.deepEqual(field.missing, field.values.map(v => v === null));
      assert.deepEqual(field.missing, field.validCells.map(n => n === 0));
    }
  }
});

test('optional archived source byte hashes match every manifest entry', { skip: !process.env.CLIMATOLOGY_CACHE }, async () => {
  for (const data of [c.CLIMATOLOGY_DATA, c.ENSO_DATA]) for (const [key, source] of Object.entries(data.sources)) {
    const path = join(process.env.CLIMATOLOGY_CACHE, data === c.ENSO_DATA ? `${key}.txt` : key);
    const bytes = await readFile(path);
    assert.equal(bytes.length, source.bytes, path);
    assert.equal(hash(bytes), source.sha256, path);
  }
});

test('WOA parser preserves missing values, wraps longitude, and rejects invalid records', () => {
  const header = '#WOA23 test\n#DEPTHS (M):0,10,500\n';
  const parsed = parseWoaCsv(header + '30.5,132.5,10,,2\n30.5,-226.5,20,-999\n', [0, 10, 500]);
  assert.deepEqual(parsed.get('30.5,132.5').values, [10, null, 2]);
  assert.deepEqual(parsed.get('30.5,133.5').values, [20, null, null]);
  assert.throws(() => parseWoaCsv('', [0]), /header/);
  assert.throws(() => parseWoaCsv(header, [550]), /absent/);
  assert.deepEqual(parseWoaCsv(header + '30.5,132.5,1,2,3', [550], { allowAbsentDepths: true }).get('30.5,132.5').values, [null]);
  assert.throws(() => parseWoaCsv(header + ',132.5,1', [0]), /coordinate/);
  assert.throws(() => parseWoaCsv(header + '30.5,132.5,NaN', [0]), /number/);
  assert.throws(() => parseWoaCsv(header + '30.5,132.5,1\n30.5,132.5,2', [0]), /Duplicate/);
});

test('regional reduction requires common monthly cells and cosine weights', () => {
  const a = new Map([['a', { lat: 0, lon: 150, values: [10, 1] }], ['b', { lat: 60, lon: 150, values: [20, 2] }]]);
  const b = new Map([['a', { lat: 0, lon: 150, values: [30, null] }], ['b', { lat: 60, lon: 150, values: [40, 4] }]]);
  const result = reduceRegion([a, b], { south: 0, north: 61, west: 150, east: 151 }, [0, 10]);
  assert.deepEqual(result.values, [23.333333, 3]);
  assert.deepEqual(result.validCells, [2, 1]);
});

const godas = 'Dataset\n---------------------------------------------\npottmp.pottmp[1][1][1][2]\n[0][0][0], 280, -9.96921E36\n\npottmp.time[1]\n72318\n\npottmp.level[1]\n5\n\npottmp.lat[1]\n20.166\n\npottmp.lon[2]\n150.5,151.5\n';
test('GODAS parser handles actual ASCII shape and rejects corrupt subsets', () => {
  assert.deepEqual(parseGodasAscii(godas.replaceAll('\n', '\r\n'), 'pottmp').rows.get('0,0,0'), [280, -9.96921e36]);
  assert.throws(() => parseGodasAscii(godas.replace('[0][0][0]', '[1][0][0]'), 'pottmp'), /index/);
  assert.throws(() => parseGodasAscii(godas.replace('280,', ','), 'pottmp'), /values/);
  assert.throws(() => parseGodasAscii(godas.replace('150.5,151.5', 'NaN,151.5'), 'pottmp'), /lon/);
  assert.throws(() => parseGodasAscii(godas.replace('[0][0][0], 280, -9.96921E36\n', ''), 'pottmp'), /Incomplete/);
});

test('seasonal composites use annual data only below monthly coverage', () => {
  assert.equal(c.CLIMATOLOGY_DATA.depthsM.at(-1), 5500);
  for (const region of c.CLIMATOLOGY_DATA.regions) for (const season of ['jja', 'djf']) {
    const seasonal = c.getClimatologyProfile(`${region.id}-${season}`);
    const annual = c.getClimatologyProfile(`${region.id}-annual`);
    for (const [key, field] of Object.entries(seasonal.fields)) c.CLIMATOLOGY_DATA.depthsM.forEach((depth, k) => {
      const deep = depth > (['temperature', 'salinity'].includes(key) ? 1500 : 500);
      assert.equal(field.sourceSeason[k], deep ? 'annual' : season.toUpperCase());
      if (deep) assert.equal(field.values[k], annual.fields[key].values[k]);
    });
  }
  assert.equal(c.sampleClimatology('japan-sea-annual', 4000).temperature, null);
  assert.equal(c.sampleClimatology('japan-sea-annual', 4000, { outOfRange: 'clamp' }).temperature,
    c.sampleClimatology('japan-sea-annual', 3700).temperature);
});

test('sampling policies and nutrient conversions are explicit', () => {
  assert.equal(c.sampleProfile([0, 10], [1, 3], 5), 2);
  assert.equal(c.sampleProfile([0, 10], [1, null], 5), null);
  assert.equal(c.sampleProfile([0, 10], [1, 3], 20), null);
  assert.equal(c.sampleProfile([0, 10], [1, 3], 20, { outOfRange: 'clamp' }), 3);
  assert.throws(() => c.sampleProfile([0, 10], [1, 3], 20, { outOfRange: 'error' }), RangeError);
  close(c.micromolKgToMmolM3(10), 10.25);
  close(c.mmolM3ToMicromolKg(10.25), 10);
  assert.throws(() => c.micromolKgToMmolM3(1, 0), RangeError);
});

test('terrain metadata allows northern JJA and restricts ENSO to Japan/North Pacific', () => {
  const value = config();
  assert.ok(c.getClimatologyOptions(value).filter(o => o.season === 'JJA').every(o => o.available));
  assert.ok(c.getEnsoOptions(value).every(o => o.available));
  value.grid.preset = 'south-pacific';
  assert.ok(c.getClimatologyOptions(value).filter(o => o.requiresNorthernTerrain).every(o => !o.available));
  assert.ok(c.getClimatologyOptions(value).filter(o => o.region.startsWith('south-') && o.season === 'JJA').every(o => o.available && o.label.includes('冬季')));
  assert.throws(() => c.applyClimatology(value, 'north-pacific-jja'), RangeError);
  assert.throws(() => c.applyEnsoComposite(value, c.ENSO_OPTIONS[0].id), RangeError);
  value.grid.preset = 'japan';
  value.grid.geoBounds = { south: -30, north: -10 };
  assert.ok(c.getClimatologyOptions(value).filter(o => o.requiresNorthernTerrain).every(o => !o.available));
});

test('WOA paints wet sigma centers and boundaries without mutating unrelated biology or config', () => {
  const value = config();
  value.ecosystem.model = 'nemuro';
  value.initial.zeta = 2;
  value.boundary.east.zeta = 4;
  const before = structuredClone(value);
  const next = c.applyClimatology(value, 'japan-north-jja');
  assert.deepEqual(value, before);
  const fields = buildFields(next), n = next.grid.nx * next.grid.ny;
  for (let p = 0; p < n; p++) for (let k = 0; k < next.grid.nz; k++) {
    if (!fields.mask[p]) { assert.equal(next.initial.painted.temp[k][p], undefined); continue; }
    const depth = (fields.h[p] + 2) * (1 - (k + 0.5) / next.grid.nz);
    const expected = c.sampleClimatology('japan-north-jja', depth, { nutrientUnits: 'mmol/m3' });
    close(fields.temp[k * n + p], expected.temperature);
    close(fields.biology.nemuro_NO3_[k * n + p], expected.nitrate);
    close(fields.biology.nemuro_SiOH[k * n + p], expected.silicate);
  }
  for (const [along, temp] of Object.entries(next.boundary.east.painted.temp[0])) {
    const p = +along * next.grid.nx + next.grid.nx - 1;
    close(temp, c.sampleClimatology('japan-north-jja', (fields.h[p] + 4) * (1 - 0.5 / next.grid.nz)).temperature);
  }
  for (const key of ['nemuro_Sphy', 'nemuro_Lphy', 'nemuro_Szoo', 'nemuro_PON_']) {
    assert.ok(Number.isFinite(before.ecosystem.initial[key]));
    assert.equal(next.ecosystem.initial[key], before.ecosystem.initial[key]);
    assert.deepEqual(fields.biology[key], buildFields(before).biology[key]);
  }
  assert.deepEqual(c.applyClimatology(value, 'japan-north-annual', { boundaries: false }).boundary, before.boundary);
});

test('deep WOA applies and ENSO clamp explicitly handles shallow/deep layers', () => {
  const value = config();
  Object.assign(value.grid, { preset: 'north-pacific', minDepth: 100, maxDepth: 5000 });
  assert.doesNotThrow(() => buildFields(c.applyClimatology(value, 'north-pacific-jja')));
  const before = structuredClone(value), id = c.ENSO_OPTIONS[0].id;
  assert.throws(() => c.applyEnsoComposite(value, id), RangeError);
  assert.deepEqual(value, before);
  const next = c.applyEnsoComposite(value, id, { outOfRange: 'clamp' });
  assert.deepEqual(next.ecosystem, before.ecosystem);
  assert.deepEqual(next.climatology.appliedFields, ['temp', 'salt']);
  assert.equal(next.climatology.outOfRange, 'clamp');
  const fields = buildFields(next), p = fields.mask.findIndex(v => v === 1);
  const expected = c.sampleEnsoComposite(id, fields.h[p] * (1 - 0.5 / value.grid.nz), { outOfRange: 'clamp' });
  close(fields.temp[p], expected.potentialTemperature);
  close(fields.salt[p], expected.salinityMassFraction);
  assert.equal(c.sampleEnsoComposite(id, 0, { outOfRange: 'clamp' }).potentialTemperature, c.sampleEnsoComposite(id, 5).potentialTemperature);
});

test('main UI contract supports namespace imports and climatology distribution', () => {
  for (const id of ['north-pacific-annual', 'north-pacific-jja', ...c.ENSO_OPTIONS.map(o => o.id)]) {
    const value = config();
    value.grid.preset = 'north-pacific';
    const apply = c.ENSO_OPTIONS.some(o => o.id === id) ? c.applyEnsoComposite : c.applyClimatology;
    const next = apply(value, id, { boundaries: false, outOfRange: 'clamp' });
    next.initial.distribution = 'climatology';
    assert.equal(next.climatology.id, id);
    assert.match(next.climatology.product, /NOAA/);
    assert.deepEqual(next.boundary, value.boundary);
    assert.doesNotThrow(() => buildFields(next));
  }
});
