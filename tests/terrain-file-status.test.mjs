import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainFileStatus } from '../src/terrain-file-status.js';
test('missing required companions are identified by matching case-insensitive base names', () => {
  const status = terrainFileStatus([{ name: 'Bath.SHP' }, { name: 'Bath.DBF' }, { name: 'other.PRJ' }]);
  assert.ok(status.some(s => s.label === 'bath.prj' && s.state === 'missing'));
  assert.ok(status.some(s => s.label === 'bath.dbf' && s.state === 'ready'));
  assert.ok(status.some(s => s.label === 'bath.shx' && s.state === 'optional'));
});
test('single archives are selected, mixtures are invalid, and empty selections are neutral', () => {
  assert.ok(terrainFileStatus([]).every(s => s.state === 'idle'));
  assert.equal(terrainFileStatus([{ name: 'grid.nc' }])[0].state, 'ready');
  assert.equal(terrainFileStatus([{ name: 'grid.zip' }, { name: 'grid.shp' }])[0].state, 'missing');
});
