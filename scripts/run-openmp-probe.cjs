const path = require('node:path');
const createModule = require(path.resolve(process.argv[2]));
const timeout = setTimeout(() => { console.error('OpenMP probe timed out'); process.exit(1); }, 30000);
createModule().then(module => {
  let passed = true;
  for (const requested of [1, 2, 4]) {
    const threads = module._webroms_omp_threads(requested);
    const sum = module._webroms_omp_sum(requested);
    const mask = module._webroms_omp_thread_mask(requested);
    const success = threads === requested && sum === 250250 && mask === (1 << requested) - 1;
    console.log(JSON.stringify({ expectedThreads: requested, actualThreads: threads, mask, sum, expectedSum: 250250, passed: success, romsParallelEnabled: false }));
    passed &&= success;
  }
  clearTimeout(timeout);
  process.exit(passed ? 0 : 1);
}).catch(error => { console.error(error); process.exit(1); });
