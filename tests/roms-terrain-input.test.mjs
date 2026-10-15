import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import createRoms from '../runtime/roms.js';
import { writeNetcdf } from '../src/netcdf.js';
import { readGeographicNetcdf, resampleTerrain } from '../src/geographic-io.js';
import { defaults } from '../src/model.js';

test('zero-depth NetCDF bathymetry remains water except for an explicit land mask', async () => {
  const source = readGeographicNetcdf(await gridFile(), 0, { romsTerrain: true });
  source.vars.h.data[1] = 0;
  const grid = { ...defaults().grid, nx: 8, ny: 8 };
  const result = resampleTerrain(source, grid);
  assert.equal(result.edits[0], 0);
  assert.ok(result.edits[1] >= 1 && result.edits[1] < 1.000001);
});

async function gridFile(curved = false, western = false) {
  const runtime = await createRoms({ print() {}, printErr() {} }), nx = 8, ny = 8, lon = [], lat = [], depth = [], mask = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = (western ? 230 : 135) + i * .02 + (curved ? j * .005 : 0), y = 34 + j * .02 + (curved ? i * .005 : 0);
    lon.push(x); lat.push(y); depth.push(100 + (x - (western ? 230 : 135)) * 100 + (y - 34) * 40); mask.push(i === 0 && j === 0 ? 0 : 1);
  }
  depth[0] = -9999;
  writeNetcdf(runtime, 'legacy-grid.nc', { eta_rho: ny, xi_rho: nx }, [
    { name: 'lon_rho', dimensions: ['eta_rho', 'xi_rho'], data: lon },
    { name: 'lat_rho', dimensions: ['eta_rho', 'xi_rho'], data: lat },
    { name: 'h', dimensions: ['eta_rho', 'xi_rho'], data: depth, attributes: { units: 'meter', _FillValue: -9999 } },
    { name: 'mask_rho', dimensions: ['eta_rho', 'xi_rho'], data: mask }
  ], { type: 'ROMS GRID file' });
  return runtime.FS.readFile('legacy-grid.nc').slice();
}
test('classic ROMS grid accepts conventional missing positive/coordinate units and masked land fill', async () => {
  const source = readGeographicNetcdf(await gridFile(), 0, { romsTerrain: true });
  const g = resampleTerrain(source, { ...defaults().grid, nx: 8, ny: 8 });
  assert.equal(source.vars.h.attrs.positive, 'down'); assert.equal(g.edits[0], 0);
  assert.ok(g.edits[1] > 100); assert.equal(g.importedUncoveredCells, 0);
});
test('curvilinear ROMS bathymetry regrids linearly and marks uncovered cells', async () => {
  const bytes = await gridFile(true);
  assert.throws(() => readGeographicNetcdf(bytes), /units/);
  const source = readGeographicNetcdf(bytes, 0, { romsTerrain: true }), g = resampleTerrain(source, { ...defaults().grid, nx: 8, ny: 8 });
  assert.equal(source.curvilinear, true); assert.ok(g.importedUncoveredCells > 0);
  const p = 27, lon = g.geoBounds.west + p % 8 / 7 * (g.geoBounds.east - g.geoBounds.west), lat = g.geoBounds.south + Math.floor(p / 8) / 7 * (g.geoBounds.north - g.geoBounds.south);
  assert.ok(Math.abs(g.edits[p] - (100 + (lon - 135) * 100 + (lat - 34) * 40)) < 1e-8);
});
test('regional 0..360 longitudes are normalized for western hemisphere grids', async () => {
  const source = readGeographicNetcdf(await gridFile(false, true), 0, { romsTerrain: true });
  const g = resampleTerrain(source, { ...defaults().grid, nx: 8, ny: 8 });
  assert.equal(g.geoBounds.west, -130); assert.ok(g.geoBounds.east < -129);
});
