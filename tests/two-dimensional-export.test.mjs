import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import createRoms from '../runtime/roms.js';
import { defaults, buildFields } from '../src/model.js';
import { exportSeaLevel, importSeaLevel } from '../src/shape-io.js';
import { resultShape } from '../src/results-export.js';
import { createStreamExport } from '../src/stream-export.js';
import { unzipSync } from '../vendor/fflate.js';
import { NetCDFReader } from '../vendor/netcdf-reader.js';
import shp from '../vendor/shp.esm.js';

function fixture() {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, nz: 3, preset: 'uniform', geoBounds: { west: 135, east: 136, south: 34, north: 35 } });
  const state = buildFields(config), size = 64;
  state.z_r = Float64Array.from({ length: size * 3 }, (_, p) => -30 + Math.floor(p / size) * 10);
  state.temp = Float64Array.from({ length: size * 3 }, (_, p) => 10 + Math.floor(p / size) * 5);
  state.u.fill(2); state.v.fill(-3); state.zeta.fill(.25);
  return { config, state };
}

test('2D ZIP contains matching selected-layer Shapefile and genuine NetCDF', async () => {
  const runtime = await createRoms({ print() {}, printErr() {} }), { config, state } = fixture();
  const files = unzipSync(resultShape(config, [{ time: 3600, state }], { layer: 1, runtime }));
  const nc = new NetCDFReader(files['horizontal.nc']);
  assert.deepEqual(nc.dimensions.map(d => d.name).sort(), ['eta_rho', 'ocean_time', 'xi_rho']);
  assert.equal(nc.getDataVariable('selected_layer')[0], 1);
  for (const [key, value] of [['temp', 15], ['z_r', -20], ['u', 2], ['v', -3], ['zeta', .25]]) assert.ok(nc.getDataVariable(key).every(v => v === value));
  const geo = await shp({ shp: files['time_0/layer_1.shp'], dbf: files['time_0/layer_1.dbf'] });
  assert.equal(geo.features[0].properties.TEMP_C, 15);
  assert.equal(geo.features[0].properties.U_MS, 2);
});

test('streaming 2D download embeds a matching NetCDF for every saved time', async () => {
  const runtime = await createRoms({ print() {}, printErr() {} }), { config, state } = fixture(), chunks = [];
  const output = createStreamExport(runtime, config, 'shape', 2, chunk => chunks.push(chunk));
  await output.append({ time: 0, state }); await output.append({ time: 60, state }); await output.close();
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const files = unzipSync(bytes);
  for (const [index, time] of [[0, 0], [1, 60]]) {
    const prefix = `time_${String(index).padStart(5, '0')}`;
    const nc = new NetCDFReader(files[prefix + '/horizontal.nc']);
    assert.equal(nc.getDataVariable('ocean_time')[0], time);
    assert.ok(nc.getDataVariable('temp').every(v => v === 20));
    assert.ok(files[prefix + '/time_0/layer_2.shp']);
  }
});

test('sea-level 2D ZIP includes its NetCDF and still reimports as Shapefile', async () => {
  const { config, state } = fixture(), bytes = await exportSeaLevel(config, state), files = unzipSync(bytes);
  const nc = new NetCDFReader(files['sea_level.nc']);
  assert.ok(nc.getDataVariable('zeta').every(v => v === .25));
  assert.ok(!nc.variables.some(v => v.name === 'temp'));
  assert.ok(!nc.dimensions.some(d => d.name === 's_rho'));
  const restored = await importSeaLevel(new File([bytes], 'surface.zip'), config, state);
  assert.ok(Object.values(restored.painted.zeta[0]).every(v => v === .25));
});
