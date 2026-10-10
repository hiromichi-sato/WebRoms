import { Zip, ZipPassThrough, unzipSync, strToU8 } from '../vendor/fflate.js';
import { resultNetcdf, resultShape } from './results-export.js';
import { tideSource } from './ocean-boundary.js';

// Backpressure keeps only one model snapshot and one output file in JS memory.
export function createStreamExport(runtime, config, format, layer, send) {
  let chunks = [], count = 0;
  const times = [];
  const zip = new Zip((error, chunk) => { if (error) throw error; chunks.push(chunk); });
  const drain = async () => { const pending = chunks; chunks = []; for (const chunk of pending) await send(chunk); };
  const add = (name, bytes) => { const file = new ZipPassThrough(name); zip.add(file); file.push(bytes, true); };
  return {
    async append(record) {
      times.push(record.time);
      const prefix = `time_${String(count++).padStart(5, '0')}`;
      if (format === 'netcdf-series') add(prefix + '.nc', resultNetcdf(runtime, config, [record]));
      else {
        const files = unzipSync(resultShape(config, [record], { layer }));
        for (const [name, bytes] of Object.entries(files)) add(prefix + '/' + name, bytes);
      }
      await drain();
    },
    async close() {
      add('metadata.json', strToU8(JSON.stringify({ timesSeconds: times, selectedLayer: format === 'shape' ? layer ?? config.grid.nz - 1 : null, layerOrder: 'bottom to surface', restart: false })));
      add('README.json', strToU8(JSON.stringify({ format: 'webroms-time-series-v1', records: count, startUtc: config.ocean?.startUtc ?? null, restart: false, tideSource: tideSource(config), layout: format === 'shape' ? 'One horizontal layer per time' : 'One 3D NetCDF per time' })));
      zip.end(); await drain();
    }
  };
}
