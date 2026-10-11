import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, buildFields } from '../src/model.js';
import { diagnosticValue, diagnosticFields, sampleDiagnostic, DIAGNOSTICS } from '../src/diagnostics.js';
import { npzdRates } from '../src/ecosystem-panel.js';

function fixture() {
  const c = defaults(); Object.assign(c.grid, { nx: 8, ny: 8, nz: 3, preset: 'open', minDepth: 60, maxDepth: 60, dx: 100, dy: 100 });
  const f = buildFields(c); f.u = new Float64Array(192); f.v = new Float64Array(192);
  return [c, f];
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('solid rotation, stretching and uniform velocities give analytic diagnostics', () => {
  const [c, f] = fixture();
  for (let k = 0; k < 3; k++) for (let p = 0; p < 64; p++) {
    f.u[k * 64 + p] = -2e-4 * Math.floor(p / 8) * f.dy;
    f.v[k * 64 + p] = 2e-4 * (p % 8) * f.dx;
  }
  close(diagnosticValue(f, c, 'diagVorticity', 27, 1), 4e-4);
  close(diagnosticValue(f, c, 'diagOW', 27, 1), -((4e-4) ** 2));
  close(diagnosticValue(f, c, 'diagStrain', 27, 1), 0);
  close(diagnosticValue(f, c, 'diagDivergence', 27, 1), 0);
  f.u.fill(3); f.v.fill(4);
  close(diagnosticValue(f, c, 'diagKE', 27, 1), 12.5);
  close(diagnosticValue(f, c, 'diagShear', 27, 1), 0);
  assert.equal(DIAGNOSTICS.diagKh, undefined); assert.equal(DIAGNOSTICS.diagKv, undefined);
  assert.equal(DIAGNOSTICS.diagEKE, undefined); assert.equal(DIAGNOSTICS.diagN2, undefined);
});
test('vertical shear uses actual layer centers and depth sampling matches display', () => {
  const [c, f] = fixture();
  f.z_r = Float64Array.from({ length: 192 }, (_, i) => [-50, -30, -10][Math.floor(i / 64)]);
  f.u = Float64Array.from(f.z_r, z => z * .01); f.v.fill(0);
  const derived = diagnosticFields(f, c, 'diagShear');
  close(derived.diagShear[91], .01);
  close(sampleDiagnostic(f, c, 'diagShear', 27, 1, 20), .01);
  assert.ok(Number.isNaN(sampleDiagnostic(f, c, 'diagShear', 27, 1, 100)));
});
test('derivatives do not bridge land or manufacture zeros for isolated wet cells', () => {
  const [c, f] = fixture(); f.mask.fill(0); f.mask[27] = 1;
  assert.ok(Number.isNaN(diagnosticValue(f, c, 'diagVorticity', 27, 1)));
  assert.ok(Number.isNaN(diagnosticValue(f, c, 'diagKE', 26, 1)));
});
test('sloping layers are differentiated at fixed height, not fixed sigma', () => {
  const [c, f] = fixture();
  f.z_r = Float64Array.from({ length: 192 }, (_, i) => [-50, -30, -10][Math.floor(i / 64)] - (i % 8));
  f.u = Float64Array.from(f.z_r, z => z * .01); f.v.fill(0);
  close(diagnosticValue(f, c, 'diagDivergence', 27, 1), 0);
  close(diagnosticValue(f, c, 'diagShear', 27, 1), .01);
});
test('NPZD rates use current concentrations, not the configured initial field', () => {
  const [c, f] = fixture(); c.ecosystem.enabled = true;
  const initial = { npzd_NO3_: 3, npzd_Phyt: 2, npzd_Zoop: .4, npzd_SDet: 1 };
  f.biology = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, new Float64Array(192).fill(v)]));
  const rates = npzdRates({ ...c, ecosystem: { ...c.ecosystem, initial } }, 30);
  close(diagnosticValue(f, c, 'diagProduction', 27, 1), rates.U);
  close(diagnosticValue(f, c, 'diagGrazingPressure', 27, 1), rates.G / 2);
  f.biology.npzd_Phyt.fill(0);
  close(diagnosticValue(f, c, 'diagProduction', 27, 1), 0);
  assert.ok(Number.isNaN(diagnosticValue(f, c, 'diagGrazingPressure', 27, 1)));
});
