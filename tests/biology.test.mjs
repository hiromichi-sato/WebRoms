import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, validate, buildFields, biologyTracers, preparedData, biologyExecutable } from '../src/model.js';
import { writeInputs } from '../src/roms-input.js';

test('NPZD and NEMURO use their own tracers, units and sample initial concentrations', () => {
  const config = defaults(); config.ecosystem.enabled = true; config.grid.preset = 'open';
  for (const [model, count] of [['npzd', 4], ['nemuro', 11]]) {
    config.ecosystem.model = model;
    assert.deepEqual(validate(config), []);
    const tracers = biologyTracers(config), fields = buildFields(config);
    assert.equal(tracers.length, count);
    assert.equal(Object.keys(fields.biology).length, count);
    for (const tracer of tracers) assert.equal(fields.biology[tracer.key][0], tracer.initial);
    assert.equal(Object.keys(preparedData(config, fields).ecosystem).length, count);
  }
  assert.equal(config.ecosystem.initial.nemuro_NO3_, 5);
  assert.equal(config.ecosystem.initial.nemuro_SiOH, 10);
  assert.equal(config.ecosystem.initial.nemuro_opal, 0.01);
  config.ecosystem.parameters.nemuro.BioIter = 0;
  assert.ok(validate(config).some(message => message.includes('BioIter')));
});

test('biology input rejects an incompatible WASM before writing files', () => {
  const config = defaults(); config.ecosystem.enabled = true;
  assert.ok(biologyExecutable(config));
  assert.throws(() => writeInputs({ _webroms_model: () => 0 }, config, ''), /does not match/);
  config.ecosystem.model = 'nemuro';
  assert.throws(() => writeInputs({ _webroms_model: () => 1 }, config, ''), /does not match/);
  const don = biologyTracers(config).find(tracer => tracer.key === 'nemuro_DON_');
  assert.equal(don.netcdf, 'semilabileDON');
  assert.equal(don.boundary, 'semilabileDON');
  config.ecosystem.model = 'fennel';
  assert.equal(biologyExecutable(config), false);
  config.ecosystem.enabled = false;
  assert.ok(biologyExecutable(config));
});
