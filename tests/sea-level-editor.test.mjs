import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { boundarySeaLevels, changeBoundarySeaLevel } from '../src/sea-level-editor.js';
import { resolvedBoundaries } from '../src/boundary-initial.js';

function setup() {
  const config = defaults(); Object.assign(config.grid, { nx: 8, ny: 8, preset: 'open', minDepth: 40, maxDepth: 40 });
  config.initial.zeta = .1; config.initial.painted.zeta = [{ 0: .3 }];
  return { config, fields: buildFields(config) };
}
test('mean sea-level edit preserves spatial differences, initial field and physical boundary values', () => {
  const { config, fields } = setup(), initial = structuredClone(config.initial), east = structuredClone(config.boundary.east);
  const before = boundarySeaLevels(config, fields, 'west');
  changeBoundarySeaLevel(config, fields, 'west', 'mean', 25);
  const after = boundarySeaLevels(config, fields, 'west');
  assert.ok(Math.abs(config.boundary.west.zeta - .25) < 1e-10);
  after.forEach((point, i) => assert.ok(Math.abs(point.value - before[i].value - .125) < 1e-10));
  assert.deepEqual(config.initial, initial); assert.deepEqual(config.boundary.east, east);
  assert.equal(config.boundary.west.fromInitial, false);
  assert.equal(config.boundary.west.painted.temp[0][0], fields.temp[0]);
  assert.equal(resolvedBoundaries(config, fields).west.painted.zeta[0][0], config.boundary.west.painted.zeta[0][0]);
});
test('single-cell sea-level edits survive JSON and reject invalid or closed-boundary input', () => {
  const { config, fields } = setup();
  changeBoundarySeaLevel(config, fields, 'west', 0, 50);
  assert.equal(config.boundary.west.painted.zeta[0][0], .5);
  assert.equal(config.boundary.west.painted.zeta[0][1], .1);
  assert.equal(JSON.parse(JSON.stringify(config)).boundary.west.painted.zeta[0][0], .5);
  for (const value of [NaN, Infinity, 3000]) assert.throws(() => changeBoundarySeaLevel(config, fields, 'west', 'mean', value));
  config.boundary.west.mode = 'closed';
  assert.throws(() => changeBoundarySeaLevel(config, fields, 'west', 'mean', 0));
});
