import { writeNetcdf } from './netcdf.js';
import { rotationCoefficients } from './forcing.js';

export async function terrainNetcdf(config, fields, bounds = null) {
  const { default: createRoms } = await import('../runtime/roms.js');
  const runtime = await createRoms({ print() {}, printErr() {} });
  const g = config.grid, rotation = rotationCoefficients(config.numerics);
  const dimensions = {}, variables = [];
  const add = (name, dimensions, data, attributes = {}) => variables.push({ name, dimensions, data, attributes });
  for (const point of ['rho', 'u', 'v', 'psi']) {
    const xOffset = point === 'u' || point === 'psi' ? 0.5 : 0;
    const yOffset = point === 'v' || point === 'psi' ? 0.5 : 0;
    const nx = g.nx - (xOffset ? 1 : 0), ny = g.ny - (yOffset ? 1 : 0);
    dimensions[`xi_${point}`] = nx; dimensions[`eta_${point}`] = ny;
    const dims = [`eta_${point}`, `xi_${point}`];
    const array = fn => Float64Array.from({ length: nx * ny }, (_, p) => fn(p % nx + xOffset, Math.floor(p / nx) + yOffset));
    add(`x_${point}`, dims, array(i => i * g.dx), { units: 'm' });
    add(`y_${point}`, dims, array((i, j) => j * g.dy), { units: 'm' });
    add(`mask_${point}`, dims, fields[{ rho: 'mask', u: 'maskU', v: 'maskV', psi: 'maskPsi' }[point]], { long_name: 'land/water mask (0=land, 1=water)' });
    if (bounds) {
      add(`lon_${point}`, dims, array(i => ((bounds.west + i / (g.nx - 1) * (bounds.east - bounds.west) + 180) % 360 + 360) % 360 - 180), { units: 'degrees_east' });
      add(`lat_${point}`, dims, array((i, j) => bounds.south + j / (g.ny - 1) * (bounds.north - bounds.south)), { units: 'degrees_north' });
    }
  }
  const rho = ['eta_rho', 'xi_rho'], full = value => new Float64Array(g.nx * g.ny).fill(value);
  add('spherical', [], [0]);
  add('xl', [], [(g.nx - 2) * g.dx], { units: 'm' });
  add('el', [], [(g.ny - 2) * g.dy], { units: 'm' });
  add('h', rho, fields.h, { units: 'm', positive: 'down' });
  add('pm', rho, full(1 / g.dx), { units: 'm-1' });
  add('pn', rho, full(1 / g.dy), { units: 'm-1' });
  add('angle', rho, full(0), { units: 'radian' });
  add('f', rho, Float64Array.from({ length: g.nx * g.ny }, (_, p) => rotation.f0 + rotation.beta * (Math.floor(p / g.nx) - (g.ny - 1) / 2) * g.dy), { units: 's-1' });
  const path = 'webroms_export_grd.nc';
  try {
    writeNetcdf(runtime, path, dimensions, variables, { type: 'ROMS GRID file', source: 'WebROMS edited model grid', coordinate_note: 'Cartesian model metrics; geographic coordinates, when present, are auxiliary bounds-based coordinates. Land is identified by mask_rho, not by h.' });
    return runtime.FS.readFile(path).slice();
  } finally {
    if (runtime.FS.analyzePath(path).exists) runtime.FS.unlink(path);
  }
}
