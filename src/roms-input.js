import { writeNetcdf } from './netcdf.js';
import { buildFields, SIDES } from './model.js';

export function writeInputs(runtime, config, template) {
  const f = buildFields(config), g = config.grid, n = config.numerics;
  const dims = { xi_rho: g.nx, eta_rho: g.ny, xi_u: g.nx - 1, eta_u: g.ny, xi_v: g.nx, eta_v: g.ny - 1, xi_psi: g.nx - 1, eta_psi: g.ny - 1, s_rho: g.nz };
  const rho = ['eta_rho', 'xi_rho'], u = ['eta_u', 'xi_u'], v = ['eta_v', 'xi_v'];
  const variable = (name, dimensions, data, attributes = {}) => ({ name, dimensions, data, attributes });
  const constant = (name, value) => variable(name, [], [value]);
  const full = (name, value) => variable(name, rho, new Float64Array(g.nx * g.ny).fill(value));
  const grid = [constant('spherical', 0), constant('xl', (g.nx - 2) * g.dx), constant('el', (g.ny - 2) * g.dy),
    variable('h', rho, f.h), variable('mask_rho', rho, f.mask), variable('mask_u', u, f.maskU), variable('mask_v', v, f.maskV),
    variable('mask_psi', ['eta_psi', 'xi_psi'], f.maskPsi), full('pm', 1 / g.dx), full('pn', 1 / g.dy), full('f', 1e-4), full('angle', 0)];
  for (const point of ['rho', 'u', 'v', 'psi']) {
    const nx = dims[`xi_${point}`], ny = dims[`eta_${point}`];
    grid.push(variable(`x_${point}`, [`eta_${point}`, `xi_${point}`], Float64Array.from({ length: nx * ny }, (_, p) => ((p % nx) + (point === 'u' || point === 'psi' ? 0.5 : 0)) * g.dx)));
    grid.push(variable(`y_${point}`, [`eta_${point}`, `xi_${point}`], Float64Array.from({ length: nx * ny }, (_, p) => (Math.floor(p / nx) + (point === 'v' || point === 'psi' ? 0.5 : 0)) * g.dy)));
  }
  writeNetcdf(runtime, 'roms_grd.nc', dims, grid, { type: 'ROMS GRID file' });
  const timeAttributes = { units: 'seconds since 2000-01-01 00:00:00', calendar: 'gregorian' };
  writeNetcdf(runtime, 'roms_ini.nc', { ...dims, ocean_time: 1 }, [
    variable('ocean_time', ['ocean_time'], [0], timeAttributes),
    variable('zeta', ['ocean_time', ...rho], f.zeta),
    variable('ubar', ['ocean_time', ...u], f.ubar), variable('vbar', ['ocean_time', ...v], f.vbar),
    variable('u', ['ocean_time', 's_rho', ...u], f.u), variable('v', ['ocean_time', 's_rho', ...v], f.v),
    variable('temp', ['ocean_time', 's_rho', ...rho], f.temp), variable('salt', ['ocean_time', 's_rho', ...rho], f.salt)
  ], { type: 'ROMS INITIAL file' });
  const endTime = (n.maxSteps + 2) * n.dt;
  const boundary = [variable('bry_time', ['bry_time'], [0, endTime], timeAttributes)];
  for (const side of SIDES) {
    const b = config.boundary[side];
    for (const field of ['zeta', 'ubar', 'vbar', 'u', 'v', 'temp', 'salt']) {
      const point = ['u', 'ubar'].includes(field) ? 'u' : ['v', 'vbar'].includes(field) ? 'v' : 'rho';
      const dimension = `${['west', 'east'].includes(side) ? 'eta' : 'xi'}_${point}`;
      const length = dims[dimension], is3d = ['u', 'v', 'temp', 'salt'].includes(field);
      const values = Float64Array.from({ length: 2 * length * (is3d ? g.nz : 1) }, (_, p) => is3d ? b.layers[Math.floor(p / length) % g.nz][field] : b[field]);
      boundary.push(variable(`${field}_${side}`, ['bry_time', ...(is3d ? ['s_rho'] : []), dimension], values, { time: 'bry_time' }));
    }
  }
  writeNetcdf(runtime, 'roms_bry.nc', { ...dims, bry_time: 2 }, boundary, { type: 'ROMS BOUNDARY file' });
  writeNetcdf(runtime, 'roms_frc.nc', { ...dims, sms_time: 2 }, [
    variable('sms_time', ['sms_time'], [0, endTime], timeAttributes),
    variable('sustr', ['sms_time', ...u], new Float64Array(2 * f.maskU.length).fill(n.windX), { time: 'sms_time', units: 'Newton meter-2' }),
    variable('svstr', ['sms_time', ...v], new Float64Array(2 * f.maskV.length).fill(n.windY), { time: 'sms_time', units: 'Newton meter-2' })
  ], { type: 'ROMS FORCING file' });
  let input = template.replace(/\r\n?/g, '\n');
  const set = (key, value) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^([ \\t]*${escaped}[ \\t]*={1,2})[^\\n]*`, 'm');
    if (!pattern.test(input)) throw new Error(`ROMS template keyword missing: ${key}`);
    input = input.replace(pattern, (_, prefix) => `${prefix} ${value}`);
  };
  for (const [key, value] of Object.entries({ TITLE: 'WebROMS', MyAppCPP: 'WEBROMS', VARNAME: 'varinfo.dat',
    Lm: g.nx - 2, Mm: g.ny - 2, N: g.nz, NtileI: 1, NtileJ: 1, NTIMES: n.maxSteps, DT: n.dt,
    NDTFAST: Math.max(20, Math.ceil(n.dt * Math.sqrt(9.81 * Math.max(...f.h)) / Math.min(g.dx, g.dy) / 0.3)),
    NRREC: 0, NRST: 0, NHIS: 0, NINFO: 100, TNU2: `${n.horizontalDiffusion} ${n.horizontalDiffusion}`,
    VISC2: n.horizontalDiffusion, AKT_BAK: `${n.verticalDiffusion} ${n.verticalDiffusion}`, AKV_BAK: n.verticalDiffusion,
    Vtransform: 2, Vstretching: 1, THETA_S: 0, THETA_B: 0, TCLINE: 10, DSTART: 0, TIME_REF: 20000101,
    NFFILES: 1, GRDNAME: 'roms_grd.nc', ININAME: 'roms_ini.nc', BRYNAME: 'roms_bry.nc', FRCNAME: 'roms_frc.nc' })) set(key, value);
  const lbc = ['west', 'south', 'east', 'north'].map(side => ({ closed: 'Clo', specified: 'Cla', radiation: 'Rad', periodic: 'Per' })[config.boundary[side].mode]).join(' ');
  for (const name of ['isFsur', 'isUbar', 'isVbar', 'isUvel', 'isVvel']) set(`LBC(${name})`, lbc);
  input = input.replace(/^[ \t]*LBC\(isTvar\)[^\n]*\n[^\n]*![ \t]+salinity/m, `   LBC(isTvar) == ${lbc}`);
  runtime.FS.writeFile('roms.in', input);
  return f;
}
