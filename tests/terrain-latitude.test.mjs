import test from 'node:test';
import assert from 'node:assert/strict';
import { syncTerrainLatitude } from '../src/forcing.js';

test('latitude follows terrain bounds but preserves edits on unchanged terrain',()=>{
  const config={grid:{preset:'open',geoBounds:{west:140,east:142,south:40,north:42}},numerics:{rotationMode:'latitude',latitude:35}};
  syncTerrainLatitude(config);assert.equal(config.numerics.latitude,41);
  config.numerics.latitude=43;syncTerrainLatitude(config);assert.equal(config.numerics.latitude,43);
  config.grid.geoBounds.south=38;syncTerrainLatitude(config);assert.equal(config.numerics.latitude,40);
  config.numerics.rotationMode='manual';config.grid.geoBounds.north=44;
  syncTerrainLatitude(config);assert.equal(config.numerics.latitude,40);
  config.numerics.rotationMode='latitude';syncTerrainLatitude(config);assert.equal(config.numerics.latitude,41);
});
