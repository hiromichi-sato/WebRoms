import { boundaryPoints, gridSignature } from './ocean-boundary.js';

export const TIDE_SPEEDS = { M2: 28.9841042, S2: 30, K1: 15.0410686, O1: 13.9430356 };
export function rebuildHarmonicPacket(packet) {
  const scale = packet.amplitudeScale ?? 1, shift = packet.phaseShiftHours ?? 0;
  if (!Number.isFinite(scale) || scale < 0 || scale > 10 || !Number.isFinite(shift) || Math.abs(shift) > 744) throw new Error('振幅倍率は0〜10、位相移動は±744時間です。');
  for (const point of packet.points) {
    const pointScale = point.amplitudeScale ?? scale, pointShift = point.phaseShiftHours ?? shift;
    if (!Number.isFinite(pointScale) || pointScale < 0 || pointScale > 10 || !Number.isFinite(pointShift) || Math.abs(pointShift) > 744) throw new Error('セルの倍率・時間移動が不正です。');
    const terms = Object.entries(point.harmonics).map(([name, h]) => {
      const speed = h.speedDegreesHour ?? TIDE_SPEEDS[name];
      if (!(speed > 0 && speed <= 180) || !Number.isFinite(h.amplitudeCm) || h.amplitudeCm < 0 || h.amplitudeCm > 2000 || !Number.isFinite(h.lagDegrees)) throw new Error(`${name}の速度・振幅・遅角が不正です。`);
      return { ...h, speed };
    });
    point.height = packet.times.map(t => pointScale * terms.reduce((sum, h) => sum + h.amplitudeCm / 100 * Math.cos((h.speed * (t / 3600 - pointShift) - h.lagDegrees) * Math.PI / 180), 0));
    if (point.height.some(v => !Number.isFinite(v) || Math.abs(v) > 20)) throw new Error('合成潮位が±20 mを超えています。振幅を確認してください。');
  }
  return packet;
}
function csvRows(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(value.replace(/\r$/, '')); value = ''; if (c === '\n') { rows.push(row); row = []; } }
    else value += c;
  }
  if (quoted) throw new Error('潮汐CSVの引用符が閉じていません。');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
export function parseJapanTides(text) {
  const coordinate = value => {
    const match = value.trim().match(/^(\d+)[゜°](\d+(?:\.\d+)?)'$/);
    if (!match || Number(match[2]) >= 60) throw new Error(`不正な緯度経度：${value}`);
    return Number(match[1]) + Number(match[2]) / 60;
  };
  const stations = csvRows(text).filter(row => /^\d+$/.test(row[0])).map(row => {
    const harmonics = Object.fromEntries(Object.keys(TIDE_SPEEDS).map((name, i) => {
      const a = row[8 + 2 * i], g = row[9 + 2 * i];
      if (!a?.trim() || !g?.trim() || !Number.isFinite(Number(a)) || !Number.isFinite(Number(g)) || Number(a) < 0 || Number(a) > 2000 || Number(g) < 0 || Number(g) > 360) throw new Error(`${row[2]}：${name}の振幅・遅角が不正です。`);
      return [name, { amplitudeCm: Number(a), lagDegrees: Number(g) }];
    }));
    return { id: row[1], name: row[2], lat: coordinate(row[3]), lon: coordinate(row[4]), tableYear: row[16], harmonics };
  });
  if (!stations.length || new Set(stations.map(s => s.id)).size !== stations.length) throw new Error('潮汐地点が空、または地点記号が重複しています。');
  return stations;
}
export async function loadJapanTides() {
  const response = await fetch(new URL('./data/japan-tides.json', import.meta.url));
  if (!response.ok) throw new Error('同梱の日本潮汐データを読み込めません。');
  return response.json();
}
function distanceKm(a, b) {
  const rad = Math.PI / 180, dlat = (a.lat - b.lat) * rad, dlon = (a.lon - b.lon) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function japanTidePacket(atlas, config, fields) {
  const days = config.ocean.predictionDays;
  if (!Number.isInteger(days) || days < 1 || days > 366) throw new Error('潮汐期間は1〜366日です。');
  const times = Array.from({ length: days * 48 + 1 }, (_, i) => i * 1800);
  const points = boundaryPoints(config, fields).map(point => {
    const candidates = atlas.stations.map(station => ({ station, distance: distanceKm(point, station) })).sort((a, b) => a.distance - b.distance);
    const nearest = candidates[0];
    if (!nearest) throw new Error('参照できる潮汐地点がありません。');
    const { station, distance } = nearest;
    const selected = distance < .001 ? candidates.slice(0, 1) : candidates.slice(0, 3);
    const weights = selected.map(c => 1 / Math.max(.001, c.distance) ** 2), total = weights.reduce((sum, w) => sum + w, 0);
    // Interpolate complex coefficients: phases near 0 and 360 degrees stay adjacent.
    const harmonics = Object.fromEntries(Object.keys(TIDE_SPEEDS).map(name => {
      let real = 0, imaginary = 0;
      selected.forEach((c, i) => { const h = c.station.harmonics[name], phase = h.lagDegrees * Math.PI / 180; real += weights[i] / total * h.amplitudeCm * Math.cos(phase); imaginary += weights[i] / total * h.amplitudeCm * Math.sin(phase); });
      return [name, { amplitudeCm: Math.hypot(real, imaginary), lagDegrees: (Math.atan2(imaginary, real) * 180 / Math.PI + 360) % 360 }];
    }));
    return { ...point, stationId: station.id, stationName: station.name, stationDistanceKm: distance, tableYear: station.tableYear, harmonics, extrapolated: distance > 100,
      contributors: selected.map((c, i) => ({ id: c.station.id, name: c.station.name, distanceKm: c.distance, weight: weights[i] / total, harmonics: c.station.harmonics, tableYear: c.station.tableYear })) };
  });
  if (!points.length) throw new Error('海上の境界セルがありません。');
  return rebuildHarmonicPacket({ format: 'webroms-tides-v1', unit: 'm', kind: 'ocean-tide', source: `${atlas.source}：複素調和定数の距離重み内挿・外挿／実験用近似（天文引数・節点補正なし）`, reference: atlas.reference,
    bundledJapan: true, phaseConvention: '計算開始 t=0、η=Σ A cos(ωt−g)。公表遅角を実験位相として使用。暦に対応する天文潮位予測ではありません。',
    gridSignature: gridSignature(config), epoch: config.ocean.startUtc, times, points });
}
