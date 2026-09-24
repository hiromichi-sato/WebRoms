import { fixture, runCase } from '../tests/runtime-helper.mjs';
const name = process.argv[2] ?? 'uniform';
const steps = Number(process.argv[3] ?? 10);
const config = fixture(name);
const result = await runCase(config, steps, new URL(`../.tools/case-${name}/`, import.meta.url));
console.log(`${name}: ${steps} steps, ${result.time} seconds`);
for (const key of Object.keys(result.state)) {
  const a = result.initial[key], b = result.state[key];
  console.log(key, 'initial', Math.min(...a), Math.max(...a), 'final', Math.min(...b), Math.max(...b), 'change', Math.max(...b.map((v, i) => Math.abs(v - a[i]))));
}
