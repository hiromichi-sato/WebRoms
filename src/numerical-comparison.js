import { executionPolicy } from './execution-policy.js';

export function reproducibilityDefaults() {
  return { format: 'webroms-reproducibility-v1', comparison: { relativeTolerance: .01, scalePolicy: 'declared-physical-scale', statisticalConfidence: null }, expectedKernel: null };
}

// The scale is a physical variation/amplitude, not Celsius zero or salinity background.
export function compareNumericalField(reference, candidate, { scale, absoluteTolerance = 0, relativeTolerance = .01, mask } = {}) {
  if (!(Number.isFinite(scale) && scale > 0) || !(Number.isFinite(relativeTolerance) && relativeTolerance > 0 && relativeTolerance <= 1) || !(Number.isFinite(absoluteTolerance) && absoluteTolerance >= 0)) throw new Error('比較には正の代表スケールと有効な許容幅を指定してください。');
  if (reference.length !== candidate.length || mask && mask.length !== reference.length) throw new Error('比較する配列・マスクのサイズが一致しません。');
  const limit = scale * relativeTolerance + absoluteTolerance;
  let count = 0, invalid = 0, maxError = 0, sumSquares = 0;
  for (let i = 0; i < reference.length; i++) {
    if (mask && !mask[i]) continue;
    count++;
    if (!Number.isFinite(reference[i]) || !Number.isFinite(candidate[i])) { invalid++; continue; }
    const error = Math.abs(candidate[i] - reference[i]);
    maxError = Math.max(maxError, error); sumSquares += error ** 2;
  }
  const rmse = count > invalid ? Math.sqrt(sumSquares / (count - invalid)) : null;
  return { passed: count > 0 && invalid === 0 && maxError <= limit && rmse <= limit, count, invalid, scale, relativeTolerance, absoluteTolerance, limit, maxError, rmse, normalizedRmse: rmse === null ? null : rmse / scale, statisticalConfidence: null };
}

export function kernelIdentity(config, manifest) {
  const artifact = executionPolicy(config).artifact;
  const sha256 = manifest.sha256?.[artifact];
  if (!/^[a-f0-9]{64}$/.test(sha256 ?? '')) throw new Error('計算核の識別情報を取得できません。');
  return { artifact, sha256, romsCommit: manifest.roms.commit, romsVersion: manifest.roms.version };
}
