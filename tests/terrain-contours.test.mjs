import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { terrainContours } from '../src/terrain-contours.js';
import { exportTerrain, importTerrain } from '../src/shape-io.js';
import { unzipSync, strFromU8 } from '../vendor/fflate.js';
import shp from '../vendor/shp.esm.js';
import { NetCDFReader } from '../vendor/netcdf-reader.js';
function slope() {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'uniform', minDepth: 5, maxDepth: 75, geoBounds: { west: 135, east: 136, south: 34, north: 35 }, edits: Object.fromEntries(Array.from({ length: 64 }, (_, p) => [p, 5 + p % 8 * 10])) });
  return config;
}
test('isobaths follow a linear depth field and never include artificial perimeter lines', () => {
  const config = slope(), result = terrainContours(config, buildFields(config));
  assert.ok(result.features.length > 0);
  for (const line of result.features) for (const [lon, lat] of line.coordinates) {
    const expected = 135 + (line.depth - 5) / 70;
    assert.ok(Math.abs(lon - expected) < 1e-9); assert.ok(lat >= 34 && lat <= 35);
  }
});
test('QGIS ZIP includes complete polygon and contour file sets, and reimports the grid', async () => {
  const config = slope(), bytes = await exportTerrain(config, buildFields(config)), files = unzipSync(bytes);
  for (const name of ['terrain', 'depth_contours']) for (const ext of ['shp', 'shx', 'dbf', 'prj', 'cpg']) assert.ok(files[name + '.' + ext]);
  const nc = new NetCDFReader(files['roms_grd.nc']);
  assert.deepEqual(nc.getDataVariable('h'), Array.from(buildFields(config).h));
  assert.deepEqual(nc.getDataVariable('mask_rho'), Array.from(buildFields(config).mask));
  assert.equal(nc.getDataVariable('lon_rho')[0], 135);
  assert.equal(nc.getDataVariable('lat_rho')[63], 35);
  assert.equal(nc.getDataVariable('mask_u').length, 56);
  const result = await shp({ shp: files['depth_contours.shp'], dbf: files['depth_contours.dbf'], prj: strFromU8(files['depth_contours.prj']) });
  assert.ok(result.features.length > 0); assert.ok(result.features.every(f => ['LineString', 'MultiLineString'].includes(f.geometry.type) && f.properties.DEPTH_M > 0));
  const restored = await importTerrain(new File([bytes], 'terrain.zip'), config.grid);
  assert.deepEqual(restored.edits, config.grid.edits);
});
test('unlocated terrain saves a Cartesian ROMS grid without invented geographic coordinates', async () => {
  const config = slope(); delete config.grid.geoBounds;
  const files = unzipSync(await exportTerrain(config, buildFields(config))), nc = new NetCDFReader(files['roms_grd.nc']);
  assert.ok(!nc.variables.some(v => v.name === 'lon_rho'));
  assert.equal(nc.getDataVariable('x_rho')[7], 7 * config.grid.dx);
  assert.equal(nc.getDataVariable('spherical')[0], 0);
});
test('uniform water produces a valid empty contour layer rather than an invented coast contour', async () => {
  const config = slope(); config.grid.edits = {}; config.grid.minDepth = config.grid.maxDepth = 40;
  const files = unzipSync(await exportTerrain(config, buildFields(config))), bytes = files['depth_contours.shp'], header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(bytes.length, 100); assert.equal(header.getInt32(32, true), 3);
  for (const offset of [36, 44, 52, 60]) assert.equal(header.getFloat64(offset, true), 0);
});
