const create = require(require('node:path').resolve(process.argv[2]));
const timer = setTimeout(() => { console.error('TLS test timeout'); process.exit(1); }, 30000);
create().then(module => {
  for (const count of [1, 2, 4, 2]) {
    if (module._webroms_set_threads(count) !== 0 || module._webroms_threads() !== count) throw new Error('OpenMP team mismatch');
    const errors = module._webroms_tls_probe(count);
    console.log(JSON.stringify({ threads: count, threadprivateErrors: errors }));
    if (errors !== 0) throw new Error('Thread-local scalar/allocation persistence failed');
  }
  clearTimeout(timer); process.exit(0);
}).catch(error => { console.error(error); process.exit(1); });
