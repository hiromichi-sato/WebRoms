import './browser-globals.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixture } from './runtime-helper.mjs';
import { writeInputs } from '../src/roms-input.js';
import { snapshot } from '../src/runtime-state.js';
import { captureOceanCheckpoint } from '../src/ocean-checkpoint.js';

function compare(before, after) {
  for (const key of Object.keys(before)) {
    if (key === 'biology') { compare(before[key], after[key]); continue; }
    let error = 0;
    for (let i = 0; i < before[key].length; i++) error = Math.max(error, Math.abs(before[key][i] - after[key][i]) / Math.max(1, Math.abs(before[key][i])));
    assert.ok(error < 1e-9, `${key}: scaled difference ${error}`);
  }
}

for (const mixing of ['fixed', 'gls']) for (const model of ['physical', 'npzd', 'nemuro']) test(`${model} ${mixing} starts directly from transient ROMS state without replay`, async () => {
  const c = fixture(model === 'physical' ? 'uniform' : model); c.numerics.calculateDiffusion = mixing === 'gls'; c.numerics.dt = 10;
  c.initial.distribution = 'stratified'; c.initial.tempBottom = 10;
  c.grid.edits[18] = 0;
  c.rivers = [{ landCell: 18, cell: 19, flow: 1, temp: 18, salt: 0 }];
  c.heat = { mode: 'air', airTemperature: 18, exchangeCoefficient: 10 };
  c.wind = { pattern: 'uniform', speed: 8, direction: 90, climate: 'annual', reference: 'japan', edits: {} };
  const path = mixing === 'gls' ? `../runtime/gls/${model}/roms.js` : model === 'physical' ? '../runtime/roms.js' : `../runtime/${model}/roms.js`;
  const factory = (await import(path)).default, logs = [];
  const options = { print: s => logs.push(s), printErr: s => logs.push(s) };
  const primary = await factory({ ...options }), branch = await factory({ ...options });
  const template = await readFile(new URL('../runtime/roms-template.in', import.meta.url), 'utf8'), varinfo = await readFile(new URL('../runtime/varinfo.dat', import.meta.url));
  let initialized = false, restored = false;
  try {
    primary.FS.writeFile('varinfo.dat', varinfo); writeInputs(primary, c, template, 10000);
    assert.equal(primary._webroms_init(), 0); initialized = true;
    for (let i = 0; i < 11; i++) assert.equal(primary._webroms_step(), 0);
    const base = snapshot(primary, c, { mixing: true }), time = primary._webroms_time();
    const bytes = captureOceanCheckpoint(primary);
    assert.equal(primary._webroms_time(), time);
    compare(base, snapshot(primary, c, { mixing: true }));
    assert.equal(primary.FS.analyzePath('experiment_checkpoint.nc').exists, false);
    assert.equal(primary.FS.analyzePath('experiment_coupling.bin').exists, false);
    branch.FS.writeFile('varinfo.dat', varinfo); writeInputs(branch, c, template, 10000, { restart: true, restartStart: time });
    branch.FS.writeFile('experiment_start.nc', bytes.state);
    branch.FS.writeFile('experiment_coupling.bin', bytes.coupling);
    assert.equal(branch._webroms_init(), 0, logs.slice(-20).join('\n')); restored = true;
    assert.equal(branch._webroms_time(), time);
    compare(base, snapshot(branch, c, { mixing: true }));
    for (let i = 0; i < 5; i++) { assert.equal(primary._webroms_step(), 0); assert.equal(branch._webroms_step(), 0); }
    compare(snapshot(primary, c, { mixing: true }), snapshot(branch, c, { mixing: true }));
  } finally {
    if (restored) branch._webroms_finalize();
    if (initialized) primary._webroms_finalize();
  }
});
