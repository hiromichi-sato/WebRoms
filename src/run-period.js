export function runPeriod(config) {
  const seconds = config.numerics.dt * config.numerics.maxSteps;
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('時間刻みと計算ステップ数を確認してください。');
  const startUtc = config.ocean?.startUtc ?? '2026-01-01T00:00:00Z', start = Date.parse(startUtc);
  if (!Number.isFinite(start)) throw new Error('計算開始日が不正です。');
  return { seconds, hours: seconds / 3600, days: seconds / 86400, startDate: new Date(start).toISOString().slice(0, 10), endDate: new Date(start + seconds * 1000).toISOString().slice(0, 10), startUtc };
}
