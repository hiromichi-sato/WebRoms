import { coastlineTerrain } from './coastline-terrain.js';
import { resolveEtopo } from './etopo-region.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';
import { loadN03Land, needsEtopo } from './n03-land.js';
self.onmessage = async event => {
  try {
    const { grid, fields, polygons, options } = event.data;
    const locatedGrid = { ...grid, geoBounds: grid.geoBounds ?? TERRAIN_PRESETS[grid.preset]?.bounds };
    let acquired = { tiles: {}, warning: null };
    let n03 = null;
    if (options.maskSource === 'etopo') {
      self.postMessage({ progress: '海岸線・陸域を照合中…' });
      n03 = await loadN03Land(locatedGrid.geoBounds);
    }
    if (needsEtopo(locatedGrid,fields,options,n03)) acquired = await resolveEtopo(locatedGrid, { progress: text => self.postMessage({ progress: text }) });
    self.postMessage({ grid: coastlineTerrain(grid, fields, polygons, { ...options, n03, regionalTiles: acquired.tiles, acquisitionWarning: acquired.warning }) });
  }
  catch (error) { self.postMessage({ error: error.message }); }
};
