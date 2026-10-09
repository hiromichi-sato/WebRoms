export async function fetchTides(station, startDate, days = 3, product = 'predictions', fetcher = fetch) {
  if (!/^\d{7}$/.test(station) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(days) || days < 1 || days > 31 || !['predictions', 'hourly_height'].includes(product)) throw new Error('NOAA観測点ID（7桁）、開始日、期間1〜31日を確認してください。');
  const start = new Date(startDate + 'T00:00:00Z');
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== startDate) throw new Error('開始日が不正です。');
  const end = new Date(start.getTime() + (days - 1) * 86400000);
  const params = new URLSearchParams({ station, begin_date: startDate.replaceAll('-', ''), end_date: end.toISOString().slice(0, 10).replaceAll('-', ''), product, datum: 'MSL', units: 'metric', time_zone: 'gmt', application: 'WebROMS', format: 'json', ...(product === 'predictions' ? { interval: 'h' } : {}) });
  const url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?' + params;
  const response = await fetcher(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`潮汐API HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(String(data.error.message));
  const rows = data.predictions ?? data.data;
  if (!Array.isArray(rows) || rows.length > 800) throw new Error('潮汐APIの形式またはデータ数が不正です。');
  const samples = rows.filter(row => row.v !== '' && row.v !== null).map(row => ({ utc: row.t.replace(' ', 'T') + ':00Z', height: Number(row.v) })).filter(row => Number.isFinite(row.height) && Math.abs(row.height) < 30 && Number.isFinite(Date.parse(row.utc)));
  if (samples.length < 2) throw new Error('有効な潮位が2時刻以上必要です。別の日付・観測点を選択してください。');
  samples.sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc));
  const min = Math.min(...samples.map(s => s.height)), max = Math.max(...samples.map(s => s.height));
  return { station, name: data.metadata?.name ?? `NOAA ${station}`, product, datum: 'MSL', unit: 'm', startDate, days, samples, min, max, range: max - min, url };
}
export function drawTides(canvas, series) {
  const w = canvas.width = Math.max(280, canvas.clientWidth * 2), h = canvas.height = 220, ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2f7f8'; ctx.fillRect(0, 0, w, h);
  if (!series) return;
  ctx.strokeStyle = '#167c8b'; ctx.lineWidth = 3; ctx.beginPath();
  const start = Date.parse(series.samples[0].utc), end = Date.parse(series.samples.at(-1).utc);
  let previous;
  for (const row of series.samples) {
    const time = Date.parse(row.utc), x = 14 + (w - 28) * (time - start) / (end - start), y = 12 + (h - 24) * (series.max - row.height) / Math.max(.01, series.range);
    if (!previous || time - previous > 5400000) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    previous = time;
  }
  ctx.stroke();
}
