import { fixture, runCase } from '../tests/runtime-helper.mjs';
const name = process.argv[2] ?? 'uniform';
const steps = Number(process.argv[3] ?? 10);
const config = fixture(name);
const result = await runCase(config, steps, new URL(`../.tools/case-${name}/`, import.meta.url));
console.log(`${name}: ${steps} steps, ${result.time} seconds`);
const flatten = state => ({ ...Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'biology')), ...Object.fromEntries(Object.entries(state.biology ?? {}).map(([key, values]) => ['bio_' + key, values])) });
const initial = flatten(result.initial), state = flatten(result.state);
for (const key of Object.keys(state)) {
  const a = initial[key], b = state[key];
  console.log(key, 'initial', Math.min(...a), Math.max(...a), 'final', Math.min(...b), Math.max(...b), 'change', Math.max(...b.map((v, i) => Math.abs(v - a[i]))));
}
