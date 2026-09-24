// Use the NetCDF C library linked into ROMS, so the browser writes actual NetCDF.
export function writeNetcdf(runtime, path, dimensions, variables, attributes = {}) {
  const pointers = [];
  const alloc = bytes => { const p = runtime._malloc(bytes); if (!p) throw new Error('NetCDF: memory allocation failed'); pointers.push(p); return p; };
  const call = (name, types, args) => {
    const code = runtime.ccall(name, 'number', types, args);
    if (code !== 0) throw new Error(`${path}: ${runtime.ccall('nc_strerror', 'string', ['number'], [code])}`);
  };
  const result = alloc(4);
  let id;
  try {
    call('nc_create', ['string', 'number', 'number'], [path, 0, result]);
    id = runtime.HEAP32[result >> 2];
    const dims = {};
    for (const [name, size] of Object.entries(dimensions)) {
      call('nc_def_dim', ['number', 'string', 'number', 'number'], [id, name, size, result]);
      dims[name] = runtime.HEAP32[result >> 2];
    }
    const attribute = (varid, name, value) => {
      if (typeof value === 'string') call('nc_put_att_text', ['number', 'number', 'string', 'number', 'string'], [id, varid, name, new TextEncoder().encode(value).length, value]);
      else {
        const p = alloc(8); runtime.HEAPF64[p >> 3] = value;
        call('nc_put_att_double', ['number', 'number', 'string', 'number', 'number', 'number'], [id, varid, name, 6, 1, p]);
      }
    };
    for (const [name, value] of Object.entries(attributes)) attribute(-1, name, value);
    const ids = [];
    for (const v of variables) {
      const dimids = v.dimensions.map(name => {
        if (!Object.hasOwn(dims, name)) throw new Error(`Unknown NetCDF dimension: ${name}`);
        return dims[name];
      });
      const count = v.dimensions.reduce((n, name) => n * dimensions[name], 1);
      if (v.data.length !== count || Array.from(v.data).some(value => !Number.isFinite(value))) throw new Error(`Invalid NetCDF values: ${v.name}`);
      const dp = alloc(Math.max(4, dimids.length * 4));
      runtime.HEAP32.set(dimids, dp >> 2);
      call('nc_def_var', ['number', 'string', 'number', 'number', 'number', 'number'], [id, v.name, 6, dimids.length, dp, result]);
      const varid = runtime.HEAP32[result >> 2];
      ids.push(varid);
      for (const [name, value] of Object.entries(v.attributes ?? {})) attribute(varid, name, value);
    }
    call('nc_enddef', ['number'], [id]);
    for (const [index, v] of variables.entries()) {
      const p = alloc(v.data.length * 8);
      runtime.HEAPF64.set(v.data, p >> 3);
      call('nc_put_var_double', ['number', 'number', 'number'], [id, ids[index], p]);
    }
    call('nc_close', ['number'], [id]);
    id = undefined;
  } finally {
    if (id !== undefined) runtime.ccall('nc_close', 'number', ['number'], [id]);
    for (const pointer of pointers) runtime._free(pointer);
  }
}
