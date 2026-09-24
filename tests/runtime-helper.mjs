import { readFile, mkdir, writeFile } from 'node:fs/promises';
import createRoms from '../runtime/roms.js';
import { defaults } from '../src/model.js';
import { writeInputs } from '../src/roms-input.js';
import { snapshot } from '../src/runtime-state.js';

export function fixture(name = 'uniform') {
  const config = defaults();
  Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
  config.initial.distribution = 'uniform';
  Object.assign(config.numerics, { maxSteps: 100, steadyWindow: 10 });
  if (name === 'coast') { config.grid.preset = 'island'; config.numerics.windX = 0.02; }
  if (name === 'diffusion') { config.initial.distribution = 'stratified'; config.numerics.verticalDiffusion = 0.01; }
  return config;
}

export async function runCase(config, steps = config.numerics.maxSteps, directory) {
  const logs = [];
  const runtime = await createRoms({ print: line => logs.push(line), printErr: line => logs.push(line) });
  runtime.FS.writeFile('varinfo.dat', await readFile(new URL('../runtime/varinfo.dat', import.meta.url)));
  const masks = writeInputs(runtime, config, await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'));
  if (directory) {
    await mkdir(directory, { recursive: true });
    for (const path of ['roms.in', 'varinfo.dat', 'roms_grd.nc', 'roms_ini.nc', 'roms_bry.nc', 'roms_frc.nc']) await writeFile(new URL(path, directory), runtime.FS.readFile(path));
    await writeFile(new URL('config.json', directory), JSON.stringify(config, null, 2));
  }
  let initialized = false;
  try {
    const code = runtime._webroms_init();
    if (code !== 0) throw new Error(`ROMS initialize: ${code}`);
    initialized = true;
    const initial = snapshot(runtime, config);
    for (let step = 1; step <= steps; step++) {
      const code = runtime._webroms_step();
      if (code !== 0) throw new Error(`ROMS step ${step}: ${code}`);
    }
    const state = snapshot(runtime, config), time = runtime._webroms_time();
    if (directory) {
      const values = Float64Array.from([time, ...Object.values(state).flatMap(array => [...array])]);
      await writeFile(new URL('wasm.bin', directory), Buffer.from(values.buffer));
    }
    return { initial, state, masks, time, logs };
  } catch (error) { throw new Error(`${error.message}\n${logs.slice(-40).join('\n')}`, { cause: error }); }
  finally { if (initialized) runtime._webroms_finalize(); }
}
