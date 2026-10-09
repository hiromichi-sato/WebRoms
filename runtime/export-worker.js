import { resultNetcdf, resultShape } from '../src/results-export.js';
self.onmessage = async ({ data }) => {
  try {
    let bytes;
    if (data.format === 'shape') bytes = resultShape(data.config, data.records);
    else {
      const { default: createRoms } = await import('./roms.js');
      const runtime = await createRoms({ print: () => {}, printErr: () => {} });
      bytes = resultNetcdf(runtime, data.config, data.records);
    }
    self.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
