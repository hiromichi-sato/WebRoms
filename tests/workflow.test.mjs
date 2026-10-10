import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { coastalReceiver } from '../src/coastal-rivers.js';
import { seedBoundary, resolvedBoundaries, syncBoundaryDefaults } from '../src/boundary-initial.js';
import { sampleDepth, layerDepth, vectorRatio, vectorSpeedAtRatio, vectorZoomLayout } from '../src/result-sampling.js';
import { exportTerrain, importTerrain, gridGeometry } from '../src/shape-io.js';
import { validRange, sliderDomain } from '../src/contour-settings.js';
import { regionalClimate, applyRegionalClimate } from '../src/climatology.js';
import { biologyProfile } from '../src/biology-initial.js';
import { fetchTides } from '../src/tides.js';
import { SectionView } from '../src/view-section.js';

function fixture() { const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 20, maxDepth: 100 }); return c; }

test('depth section resamples the water column, clips at bed and preserves layer and boundary views', () => {
  const f = { nx: 3, ny: 1, nz: 2, mask: [1, 1, 0], h: [100, 40, 100], zeta: [2, 0, 0],
    z_r: [-78, -30, -80, -18, -10, -20], temp: [4, 4, 4, 16, 16, 16] };
  const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  const canvas = { style: {}, dataset: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }), getContext: () => context };
  const samples = [], owner = { fields: f, variable: 'temp', depth: 50, layer: 1, min: 4, max: 16,
    sample(variable, p, depth) { const value = sampleDepth(f, variable, p, depth); samples.push({ p, depth, value }); return value; } };
  const section = new SectionView(canvas, owner, () => ({ r: 1, g: 1, b: 1, getStyle: () => '#fff' }), {}, false);
  section.draw('section');
  assert.equal(canvas.dataset.interpolated, 'true');
  assert(samples.length > 100);
  assert(samples.some(s => s.value > 4 && s.value < 16));
  assert(samples.every(s => s.p !== 2 && s.depth <= f.h[s.p] + f.zeta[s.p] && Number.isFinite(s.value)));
  const cell = section.cells.find(c => c.p === 0 && c.topDepth <= 50 && c.bottomDepth > 50);
  assert.equal(cell.k, undefined);
  const hit = section.hitAt({ clientX: cell.x + cell.width / 2, clientY: cell.y + cell.height / 2 });
  assert.equal(hit.depth, (cell.topDepth + cell.bottomDepth) / 2);
  const spacing = cell.bottomDepth - cell.topDepth;
  section.scale = 2; section.draw('section');
  assert(section.cells[0].bottomDepth - section.cells[0].topDepth < spacing);
  samples.length = 0; owner.depth = null; section.draw('section');
  assert.equal(canvas.dataset.interpolated, 'false'); assert.equal(samples.length, 0);
  assert.equal(section.cells.length, 4); assert(section.cells.every(c => Number.isInteger(c.k)));
  owner.depth = 50; section.draw('boundary', { side: 'south' });
  assert.equal(canvas.dataset.interpolated, 'false'); assert.equal(samples.length, 0);
});

test('depth samples actual vertical coordinates, biology and staggered velocity without extrapolating below bed', () => {
  const f = { nx: 2, ny: 2, nz: 3, mask: [1, 1, 0, 1], h: [100, 20, 100, 100], zeta: [2, 0, 0, 0],
    z_r: [-88, -18, -90, -90, -28, -8, -30, -30, -3, -1, -5, -5],
    temp: [4, 4, 4, 4, 16, 16, 16, 16, 21, 21, 21, 21],
    u: [1, 1, 3, 3, 5, 5], v: [2, 2, 4, 4, 6, 6] };
  f.biology = { test: f.temp };
  assert.equal(layerDepth(f, 0, 1), 30);
  assert.equal(sampleDepth(f, 'temp', 0, 60), 10);
  assert.equal(sampleDepth(f, 'test', 0, 60), 10);
  assert.equal(sampleDepth(f, 'u', 0, 60), 2);
  assert.equal(sampleDepth(f, 'v', 0, 60), 3);
  assert.equal(sampleDepth(f, 'temp', 0, 0), 21);
  assert.equal(sampleDepth(f, 'temp', 0, 102), 4);
  for (const [p, depth] of [[0, 103], [1, 60], [2, 30], [0, -1]]) assert(Number.isNaN(sampleDepth(f, 'temp', p, depth)));
  delete f.z_r; assert.equal(layerDepth(f, 0, 1), 51);
});

test('vector log scale preserves zero, direction-independent speed and monotonic whole-arrow lengths', () => {
  assert.equal(vectorRatio(0, 1), 0); assert.equal(vectorRatio(1, 0), 0);
  assert.equal(vectorRatio(1, 1), 1); assert.equal(vectorRatio(.1, 1, 'linear'), .1);
  assert(vectorRatio(.01, 1) > .01);
  assert(vectorRatio(.01, 1) < vectorRatio(.1, 1));
  assert(vectorRatio(.1, 1) < vectorRatio(1, 1));
});

test('zoom legend inverts linear and log lengths without changing physical velocities', () => {
  for (const scale of ['linear', 'log']) for (const maximum of [.0001, .1, 10]) for (const ratio of [0, .001, .01, .1, .5, 1]) {
    const speed = vectorSpeedAtRatio(ratio, maximum, scale);
    assert(Math.abs(vectorRatio(speed, maximum, scale) - ratio) < 1e-12);
  }
  assert.equal(vectorSpeedAtRatio(1, 0), 0);
});

test('zoom increases vector density while reducing screen length', () => {
  for (const nx of [32, 64, 128]) {
    const home = vectorZoomLayout(nx, nx, 1), close = vectorZoomLayout(nx, nx, 1.25), far = vectorZoomLayout(nx, nx, .8);
    assert(close.stride < home.stride); assert(far.stride > home.stride);
    assert(close.lengthInCells * 1.25 < home.lengthInCells);
    assert(far.lengthInCells * .8 > home.lengthInCells);
    assert.equal(vectorZoomLayout(nx, nx, 100).stride, 1);
  }
});

test('all boundary tracers and native C-grid faces follow current initial data while manual values stay intact', () => {
  for (const model of ['npzd', 'nemuro']) {
    const c = fixture(); Object.assign(c.ecosystem, { enabled: true, model });
    Object.assign(c.initial, { u: .3, v: -.2, zeta: .1 });
    const f = buildFields(c), before = structuredClone(c), resolved = resolvedBoundaries(c, f);
    assert.deepEqual(c, before);
    for (const side of ['west', 'east', 'south', 'north']) {
      const at = (q, width, height) => side === 'west' ? q * width : side === 'east' ? q * width + width - 1 : side === 'south' ? q : (height - 1) * width + q;
      const b = resolved[side];
      for (const key of ['temp', 'salt', ...Object.keys(f.biology)]) for (let k = 0; k < f.nz; k++) for (let q = 0; q < 8; q++) {
        assert.equal(b.painted[key][k][q], (f.biology[key] ?? f[key])[k * 64 + at(q, 8, 8)]);
      }
      for (const key of ['u', 'v', 'ubar', 'vbar', 'zeta']) {
        const width = key.startsWith('u') ? 7 : 8, height = key.startsWith('v') ? 7 : 8;
        const count = ['west', 'east'].includes(side) ? height : width;
        for (let k = 0; k < (['u', 'v'].includes(key) ? 3 : 1); k++) for (let q = 0; q < count; q++) assert.equal(b.painted[key][k][q], f[key][k * width * height + at(q, width, height)]);
      }
    }
    c.boundary.west.fromInitial = false; c.boundary.west.layers[0].temp = 39;
    assert.deepEqual(resolvedBoundaries(c, f).west, c.boundary.west);
    delete c.boundary.east.fromInitial;
    assert.deepEqual(resolvedBoundaries(c, f).east, c.boundary.east);
    c.initial.tempBottom = 3;
    assert.notDeepEqual(resolvedBoundaries(c, buildFields(c)).north.painted.temp, resolved.north.painted.temp);
  }
});

test('contour slider domains cover the data and reject invalid limits', () => {
  assert.equal(validRange(-2, 2), true);
  for (const [min, max] of [[8, 20], [-1, 1], [0, 0], [35, 35], [1e-9, 2e-9]]) {
    const domain = sliderDomain(min, max);
    assert(domain.min < min); assert(domain.max > max); assert(validRange(domain.min, domain.max));
  }
  for (const range of [[1, 1], [2, 1], [NaN, 1], [0, Infinity]]) assert.equal(validRange(...range), false);
});
test('terrain shapefile round trip preserves lattice and land', async () => {
  for (const preset of ['open', 'osaka', 'california', 'north-pacific', 'south-pacific', 'north-atlantic', 'south-atlantic']) {
    const c = fixture(); c.grid.preset = preset; c.grid.edits = { 18: 0, 19: 54.125 };
    const f = buildFields(c), bytes = await exportTerrain(c, f);
    const g = await importTerrain(new File([bytes], 'terrain.zip'), c.grid);
    for (let p = 0; p < 64; p++) assert(Math.abs(g.edits[p] - (f.mask[p] ? f.h[p] : 0)) < 1e-6);
    assert.equal(g.nx, 8); assert.equal(g.dx, c.grid.dx);
    assert.doesNotThrow(() => buildFields({ ...c, grid: g }));
    if (preset !== 'open') for (const ring of gridGeometry(c).rings.flat()) for (const [lon, lat] of ring) { assert(lon >= -180 && lon <= 180); assert(lat >= -90 && lat <= 90); }
  }
});
test('coastal land selection only accepts adjacent interior water', () => {
  const c = fixture(); c.grid.edits[18] = 0; const f = buildFields(c);
  assert.equal(coastalReceiver(f, 18), 17);
  assert.throws(() => coastalReceiver(f, 17), /陸地/);
  const mask = new Uint8Array(64); mask[0] = 1;
  assert.throws(() => coastalReceiver({ nx: 8, ny: 8, mask }, 1), /2マス/);
});
test('specified boundary defaults follow painted nearest initial cells', () => {
  const c = fixture(); c.initial.painted = { temp: [{ 8: 17.25 }] }; seedBoundary(c, buildFields(c), 'west');
  assert.equal(c.boundary.west.mode, 'specified');
  assert.equal(c.boundary.west.painted.temp[0][1], 17.25);
});

test('automatic boundary modes close only entirely dry edges and preserve manual modes', () => {
  const c = fixture();
  for (let j = 0; j < 8; j++) c.grid.edits[j * 8] = 0;
  syncBoundaryDefaults(c, buildFields(c));
  assert.equal(c.boundary.west.mode, 'closed'); assert.equal(c.boundary.west.autoClosed, true);
  for (const side of ['east', 'south', 'north']) assert.equal(c.boundary[side].mode, 'specified');
  c.grid.edits[24] = 50;
  syncBoundaryDefaults(c, buildFields(c));
  assert.equal(c.boundary.west.mode, 'specified');
  assert.equal(c.boundary.west.painted.temp[0][3], buildFields(c).temp[24]);
  Object.assign(c.boundary.west, { mode: 'closed', fromInitial: false });
  c.boundary.north.mode = c.boundary.south.mode = 'periodic';
  syncBoundaryDefaults(c, buildFields(c));
  assert.equal(c.boundary.west.mode, 'closed');
  assert.equal(c.boundary.north.mode, 'periodic'); assert.equal(c.boundary.south.mode, 'periodic');
});
test('regional means distinguish hemispheric seasons and preserve provenance', () => {
  for (const preset of ['osaka', 'tokyo', 'ise', 'setouchi', 'japan', 'california', 'north-pacific', 'south-pacific', 'north-atlantic', 'south-atlantic']) {
    const c = fixture(); c.grid.preset = preset;
    const r = regionalClimate(c, 'summer');
    assert.equal(r.period, preset.startsWith('south') ? 'DJF' : 'JJA');
    const next = applyRegionalClimate(c, 'summer');
    assert(buildFields(next).temp.every(Number.isFinite)); assert(next.climatology.regionLabel);
  }
  assert.throws(() => regionalClimate(fixture()), /参照海域/);
});
test('chlorophyll conversion and inferred biological profiles are positive and layered', () => {
  const c = fixture(); c.grid.preset = 'japan'; c.ecosystem.distribution = 'climatology';
  const top = biologyProfile(c, 'npzd_Phyt', 2, 200), bottom = biologyProfile(c, 'npzd_Phyt', 0, 200);
  assert(top > bottom && bottom > 0);
  assert.equal(biologyProfile(c, 'npzd_Zoop', 2, 200), top * .5);
});
test('tide API parsing preserves UTC, datum and missing gaps', async () => {
  const result = await fetchTides('9414290', '2026-01-01', 1, 'hourly_height', async () => ({ ok: true, json: async () => ({ data: [{ t: '2026-01-01 00:00', v: '1.2' }, { t: '2026-01-01 01:00', v: '' }, { t: '2026-01-01 02:00', v: '-0.4' }] }) }));
  assert.equal(result.samples.length, 2); assert.equal(result.range, 1.6); assert.equal(result.datum, 'MSL');
  await assert.rejects(fetchTides('not-a-station', '2026-01-01'), /ID/);
});
