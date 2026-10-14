import { tideContext } from './tide-analysis.js';

export function tideDataRows(config, fields) {
  const context = tideContext(config, fields), ocean = config.ocean ?? {};
  const rows = [['使用状態', context.enabled ? '潮汐あり' : '潮汐なし'], ['日本の潮汐データの同梱', 'TidalData_jp.csv：主要4分潮表（適用ボタンで使用）']];
  if (!context.enabled) return rows;
  rows.push(['出典', context.source], ['計算開始（UTC）', ocean.startUtc], ['対象水域セル数', String(context.cells.length)]);
  if (context.idealized) {
    rows.push(['M2', '振幅 30 cm・周期 12.4206012 時間'], ['S2', '振幅 15 cm・周期 12 時間'], ['位相の基準', '計算開始を t=0 とした正弦波。天文遅角・気象庁の調和定数ではありません。']);
  } else {
    const packet = ocean.tides;
    rows.push(['入力形式', '潮位時系列（m）'], ['時系列基準（UTC）', packet.epoch], ['時刻数', String(packet.times.length)], ['分潮・遅角', packet.bundledJapan ? 'M2・S2・K1・O1＋ユーザー追加分潮（下記）' : '入力時系列からは特定できません。']);
    if (packet.bundledJapan) rows.push(['波形調整', `振幅倍率 ${packet.amplitudeScale ?? 1} ／ 時間移動 ${packet.phaseShiftHours ?? 0} 時間`]);
    if (packet.phaseConvention) rows.push(['位相の基準', packet.phaseConvention]);
    if (packet.reference) rows.push(['参照先', packet.reference]);
    const stations = new Map(packet.points.filter(p => context.cells.includes(p.cell) && p.stationId).flatMap(p => (p.contributors ?? [{ id: p.stationId, name: p.stationName, tableYear: p.tableYear, harmonics: p.harmonics }]).map(s => [s.id, s])));
    for (const p of stations.values()) rows.push([`採用地点 ${p.name}（${p.id}）`, `${p.tableYear} ／ ${Object.entries(p.harmonics).map(([name, h]) => `${name}：${h.amplitudeCm} cm・遅角 ${h.lagDegrees}°`).join(' ／ ')}`]);
    for (const point of packet.points.filter(p => context.cells.includes(p.cell))) {
      const min = Math.min(...point.height), max = Math.max(...point.height);
      rows.push([`セル (${point.cell % fields.nx + 1}, ${Math.floor(point.cell / fields.nx) + 1})`, `経度 ${point.lon}・緯度 ${point.lat} ／ 潮位 ${min.toFixed(3)}〜${max.toFixed(3)} m${point.stationId ? ` ／ ${point.stationName}・距離 ${point.stationDistanceKm.toFixed(1)} km` : ''}`]);
      if (point.harmonics) rows.push(['セルの合成調和定数', `${point.amplitudeCorrected ? 'ユーザー入力補正済み ／ ' : point.extrapolated ? '遠距離外挿参考値 ／ ' : ''}${Object.entries(point.harmonics).map(([name, h]) => `${name}：${h.amplitudeCm.toFixed(3)} cm・${h.lagDegrees.toFixed(3)}°`).join(' ／ ')}`]);
    }
  }
  const corrections = ocean.corrections ?? [];
  rows.push(['ユーザー補正', `${corrections.length} 地点（上の潮汐グラフには含みません）`]);
  for (const correction of corrections) rows.push([`補正セル ${correction.cell + 1}`, `${correction.kind === 'absolute' ? '絶対潮位' : '残差'}・${correction.samples.length} 時刻・入力単位 cm`]);
  return rows;
}

export function appendTideDataInfo(parent, config, fields) {
  const details = document.createElement('details');
  const summary = document.createElement('summary'); summary.textContent = '使用した潮汐データの一覧'; details.append(summary);
  const table = document.createElement('table'); table.setAttribute('aria-label', '使用した潮汐データ');
  for (const [name, value] of tideDataRows(config, fields)) {
    const row = document.createElement('tr'), label = document.createElement('th'), content = document.createElement('td');
    label.scope = 'row'; label.textContent = name; content.textContent = value; row.append(label, content); table.append(row);
  }
  details.append(table); parent.append(details);
}
