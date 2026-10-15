import { coastlineTerrain } from './coastline-terrain.js';
self.onmessage = event => {
  try { const { grid, fields, polygons, options } = event.data; self.postMessage({ grid: coastlineTerrain(grid, fields, polygons, options) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
