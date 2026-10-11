// Resample only within retained data. Missing spans are never bridged or set to zero.
export function plotSeries(data, requested = 3600, average = true) {
  const raw = data.samples, interval = Math.max(requested, data.interval);
  if (!raw.length) return { samples: [], interval, averaged: false };
  const averaged = average && requested > 3600 && interval > data.interval;
  const first = raw[0].time, last = raw.at(-1).time;
  const sample = time => {
    const exact = raw.find(s => Math.abs(s.time - time) < 1e-7);
    if (exact) return Number.isFinite(exact.value) ? exact.value : null;
    const i = raw.findIndex(s => s.time > time);
    if (i <= 0) return null;
    const a = raw[i - 1], b = raw[i];
    if (!Number.isFinite(a.value) || !Number.isFinite(b.value) || b.time - a.time > data.interval * 1.01) return null;
    return a.value + (b.value - a.value) * (time - a.time) / (b.time - a.time);
  };
  const mean = (start, end) => {
    const points = [{ time: start, value: sample(start) }, ...raw.filter(s => s.time > start && s.time < end), { time: end, value: sample(end) }];
    let area = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (!Number.isFinite(a.value) || !Number.isFinite(b.value) || b.time - a.time > data.interval * 1.01) return null;
      area += (a.value + b.value) / 2 * (b.time - a.time);
    }
    return area / (end - start);
  };
  const times = [first];
  for (let t = (Math.floor(first / interval) + 1) * interval; t < last - 1e-7; t += interval) times.push(t);
  if (last > first) times.push(last);
  const samples = times.map((time, i) => ({ time, value: averaged && i > 0 ? mean(times[i - 1], time) : sample(time),
    ...(averaged && i > 0 ? { from: times[i - 1] } : {}) }));
  // Preserve gaps even when a coarse display would otherwise skip a missing value.
  for (const s of raw) if (!Number.isFinite(s.value) && !samples.some(p => p.time === s.time)) samples.push({ time: s.time, value: null });
  samples.sort((a, b) => a.time - b.time);
  return { samples, interval, averaged };
}
