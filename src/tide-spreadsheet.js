import { unzipSync, strFromU8 } from '../vendor/fflate.js';
import { csvRows } from './japan-tides.js';
import { boundaryPoints, gridSignature, interpolateTime, validateTidePackage } from './ocean-boundary.js';
import { tideContext } from './tide-analysis.js';
import { boundarySeaLevels } from './sea-level-editor.js';

export const TIDE_COLUMNS = ['time_utc', 'tide_cm', 'correction_cm', 'observed_cm', 'time_jst'];
function sidePoints(config, fields, side) {
  return boundaryPoints(config, fields).filter(p => side === 'west' ? p.cell % fields.nx === 0 : side === 'east' ? p.cell % fields.nx === fields.nx - 1 : side === 'south' ? p.cell < fields.nx : p.cell >= fields.nx * (fields.ny - 1));
}
export function tideExportRows(config, fields, side, startHours, endHours) {
  const context = tideContext(config, fields), points = sidePoints(config, fields, side);
  if (!context.enabled || !points.length || ['closed', 'periodic'].includes(config.boundary[side].mode)) throw new Error('出力できる潮汐境界がありません。');
  const start = startHours * 3600, end = endHours * 3600;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > context.end + 1e-6) throw new Error('出力期間が不正です。');
  const times = [start]; for (let t = start + 1800; t < end; t += 1800) times.push(t); times.push(end);
  if (times.length > 20000) throw new Error('出力は2万時刻までです。');
  return [TIDE_COLUMNS, ...times.map(time => {
    const instant = Date.parse(config.ocean.startUtc) + time * 1000;
    return [new Date(instant).toISOString(), points.reduce((sum, point) => sum + context.value(point.cell, time), 0) / points.length * 100, 0, '', new Date(instant + 9 * 3600000).toISOString().replace('Z', '+09:00')];
  })];
}
export async function tideExcel(rows, metadata) {
  const { default: writeXlsxFile } = await import('../vendor/write-excel-file.js');
  const sheets = [rows, [['項目', '値'], ...Object.entries(metadata)]];
  return writeXlsxFile(sheets.map(sheet => sheet.map((row, index) => row.map(value => ({ value, type: typeof value === 'number' ? Number : String,
    ...(typeof value === 'number' ? { format: '0.###############' } : {}), ...(index === 0 ? { fontWeight: 'bold', backgroundColor: '#17675B', color: '#FFFFFF' } : {}) })))),
  { sheets: ['潮汐時系列', '出力条件'], columns: [[{ width: 30 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 30 }], [{ width: 24 }, { width: 80 }]], stickyRowsCount: 1 });
}
export const tideCsv = rows => '\uFEFF' + rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');

export function parseTideRows(rows, kind = 'residual', date1904 = false) {
  if (!['residual', 'absolute', 'observed'].includes(kind) || rows.length < 3 || rows.length > 20001) throw new Error('潮汐データは見出し＋2〜20000時刻にしてください。');
  const header = rows[0].map(value => String(value).replace(/^\uFEFF/, '').trim().toLowerCase());
  const valueName = kind === 'residual' ? 'correction_cm' : kind === 'observed' ? 'observed_cm' : 'tide_cm';
  const useJst = kind === 'observed' && header.includes('time_jst');
  const timeColumn = header.indexOf(useJst ? 'time_jst' : 'time_utc'), valueColumn = header.indexOf(valueName);
  if (timeColumn < 0 || valueColumn < 0) throw new Error(`time_utc（実測値ではtime_jstも可）と ${valueName} 列が必要です。`);
  return rows.slice(1).filter(row => row.some(value => value !== '' && value != null)).map((row, index) => {
    const raw = row[timeColumn], text = String(raw ?? '').trim();
    const utc = typeof raw === 'number' ? (raw - (date1904 ? 0 : 25569)) * 86400000 + (date1904 ? Date.UTC(1904, 0, 1) : 0) - (useJst ? 9 * 3600000 : 0)
      : Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(text) ? text : text.replace(' ', 'T') + (useJst ? '+09:00' : 'Z'));
    const value = row[valueColumn], cm = value === '' || value == null ? NaN : Number(value);
    if (!Number.isFinite(new Date(utc).getTime()) || !Number.isFinite(cm) || Math.abs(cm) > 2000) throw new Error(`${index + 2}行目のUTC日時・cm値が不正です。`);
    return { utc, cm };
  }).map((row, i, all) => {
    if (i && row.utc <= all[i - 1].utc) throw new Error('日時は重複のない昇順にしてください。');
    return row;
  });
}
export function coversCorrectionMonth(samples, minimumDays = 30) {
  if (samples.length < 2) return false;
  const first = samples[0].utc, last = samples.at(-1).utc;
  const cadence = Math.min(6 * 3600000, samples.at(-1).utc - samples.at(-2).utc);
  if (last - first + cadence >= minimumDays * 86400000 - 1) return true;
  // Complete calendar months may contain only 28/29 days; JMA hourly files end at 23:00.
  return [0, 9 * 3600000].some(zone => {
    const date = new Date(first + zone);
    return date.getUTCDate() === 1 && date.getUTCHours() === 0 && date.getUTCMinutes() === 0
      && last + cadence + zone >= Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  });
}
export async function readTideSpreadsheet(file, kind, { minimumDays = 0 } = {}) {
  if (file.size > 20e6) throw new Error('潮汐のExcel/CSVは20 MB以下にしてください。');
  if (/\.csv$/i.test(file.name)) {
    const samples = parseTideRows(csvRows(await file.text()), kind);
    if (minimumDays && !coversCorrectionMonth(samples, minimumDays)) throw new Error('実測CSVは約1か月分を用意してください。');
    return samples;
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Excelは.xlsx、またはUTF-8の.csvを指定してください。');
  let total = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => { total += entry.originalSize; if (total > 50e6) throw new Error('Excelの展開後サイズは50 MB以下にしてください。'); return /\.xml$|\.rels$/.test(entry.name); } });
  const xml = name => {
    if (!files[name]) throw new Error('Excelのシート構造が不正です。');
    const doc = new DOMParser().parseFromString(strFromU8(files[name]), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('ExcelのXMLが不正です。'); return doc;
  };
  const elements = (root, name) => [...root.getElementsByTagNameNS('*', name)];
  const book = xml('xl/workbook.xml'), sheet = elements(book, 'sheet')[0];
  if (!sheet) throw new Error('Excelにシートがありません。');
  const relation = elements(xml('xl/_rels/workbook.xml.rels'), 'Relationship').find(item => item.getAttribute('Id') === sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
  if (!relation || relation.getAttribute('TargetMode') === 'External') throw new Error('Excelのシート参照が不正です。');
  const target = new URL(relation.getAttribute('Target'), 'https://xlsx.local/xl/');
  if (target.origin !== 'https://xlsx.local') throw new Error('外部シート参照は読み込めません。');
  const strings = files['xl/sharedStrings.xml'] ? elements(xml('xl/sharedStrings.xml'), 'si').map(item => elements(item, 't').map(t => t.textContent).join('')) : [];
  const rows = elements(xml(target.pathname.slice(1)), 'row').map(row => {
    const result = [];
    for (const cell of elements(row, 'c')) {
      const address = /^([A-Z]+)\d+$/.exec(cell.getAttribute('r') ?? ''); if (!address) throw new Error('Excelセルの番地が不正です。');
      const column = [...address[1]].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      if (column > 100) throw new Error('潮汐シートの列数が多すぎます。');
      const value = elements(cell, 'v')[0]?.textContent, type = cell.getAttribute('t');
      result[column] = type === 'inlineStr' ? elements(cell, 't').map(t => t.textContent).join('') : type === 's' ? strings[Number(value)] : value === undefined ? '' : type === 'str' || type === 'd' ? value : Number(value);
      if (elements(cell, 'f').length && value === undefined) throw new Error('Excelで数式を再計算・保存してから読み込んでください。');
    }
    return result;
  });
  const samples = parseTideRows(rows, kind, elements(book, 'workbookPr')[0]?.getAttribute('date1904') === '1');
  if (samples.length < 2) throw new Error('補正には2時刻以上必要です。');
  if (minimumDays && !coversCorrectionMonth(samples, minimumDays)) throw new Error('補正用Excelは約1か月分を用意してください（30日間、または暦月の全期間）。');
  return samples;
}

export function correctBoundaryTideSeries(config, fields, side, samples, kind, source, observation = {}) {
  if (samples.length < 2) throw new Error('補正には2時刻以上必要です。');
  if (!['absolute', 'residual', 'observed'].includes(kind) || samples.some((sample, i) => !Number.isFinite(sample.utc) || !Number.isFinite(sample.cm) || i && sample.utc <= samples[i - 1].utc)) throw new Error('補正値・日時・入力の種類が不正です。');
  const context = tideContext(config, fields), points = sidePoints(config, fields, side);
  if (!context.enabled || !points.length || ['closed', 'periodic'].includes(config.boundary[side].mode)) throw new Error('補正できる潮汐境界がありません。');
  const start = Date.parse(config.ocean.startUtc), times = samples.map(sample => (sample.utc - start) / 1000), values = samples.map(sample => sample.cm / 100);
  if (times[0] < -1e-6 || times.at(-1) > context.end + 1e-6) throw new Error('補正日時が潮汐データの期間外です。');
  const tideMeanAt = t => points.reduce((sum, point) => sum + context.value(point.cell, t), 0) / points.length;
  let observedMean = 0, modelMean = 0, baseline = 0;
  if (kind === 'observed') {
    if (config.ocean.corrections?.length) throw new Error('高度な潮位補正が残っています。実測値との二重補正を避けるため、解除してから読み込んでください。');
    if (times.some((time, i) => i && time - times[i - 1] > 6 * 3600)) throw new Error('実測値は6時間以内の間隔で用意してください。欠測期間を確認してください。');
    if (!['relative', 'offset'].includes(observation.mode)) throw new Error('実測値の基準面の合わせ方を選択してください。');
    if (observation.mode === 'offset' && !Number.isFinite(observation.datumOffsetCm)) throw new Error('観測基準面からモデル基準面への加算値（cm）を明示してください。');
    const sea = boundarySeaLevels(config, fields, side);
    baseline = config.ocean.seaLevelEnabled ? sea.reduce((sum, point) => sum + point.value, 0) / sea.length : 0;
    const duration = times.at(-1) - times[0];
    for (let i = 1; i < times.length; i++) {
      const weight = (times[i] - times[i - 1]) / (2 * duration);
      observedMean += (values[i] + values[i - 1]) * weight;
      modelMean += (2 * baseline + tideMeanAt(times[i]) + tideMeanAt(times[i - 1])) * weight;
    }
  }
  const offset = config.ocean.tides ? (start - Date.parse(config.ocean.tides.epoch)) / 1000 : 0;
  let packet = structuredClone(config.ocean.tides);
  if (!packet) {
    const times = []; for (let t = 0; t < context.end; t += 1800) times.push(t); times.push(context.end);
    packet = { format: 'webroms-tides-v1', unit: 'm', kind: 'ocean-tide', source: context.source, epoch: config.ocean.startUtc, gridSignature: gridSignature(config), times,
      points: boundaryPoints(config, fields).map(point => ({ ...point, height: times.map(time => context.value(point.cell, time)) })) };
  }
  const selected = new Set(points.map(point => point.cell));
  const corrections = packet.times.map(time => {
    const t = time - offset;
    if (t < times[0] || t > times.at(-1)) return 0;
    const value = interpolateTime(times, values, t);
    const delta = kind === 'observed' ? (observation.mode === 'relative' ? value - observedMean + modelMean : value + observation.datumOffsetCm / 100) - baseline - tideMeanAt(t)
      : value - (kind === 'absolute' ? tideMeanAt(t) : 0);
    if (Math.abs(delta * 100) > (config.ocean.correctionLimitCm ?? 200) + 1e-6) throw new Error('潮位補正が許容幅を超えています。単位・基準面・入力値を確認してください。');
    return delta;
  });
  for (const point of packet.points) if (selected.has(point.cell)) {
    point.height = point.height.map((value, i) => value + corrections[i]);
    point.heightCorrections = corrections.map((value, i) => value + (point.heightCorrections?.[i] ?? 0)); point.amplitudeCorrected = true;
    if (point.heightCorrections.some(value => Math.abs(value * 100) > (config.ocean.correctionLimitCm ?? 200) + 1e-6)) throw new Error('累積した潮位補正が許容幅を超えています。');
  }
  packet.seriesCorrectionFiles = [...(packet.seriesCorrectionFiles ?? []), { side, source, kind, ...(kind === 'observed' ? { observationMode: observation.mode, datumOffsetCm: observation.mode === 'offset' ? observation.datumOffsetCm : null, observedMeanCm: observedMean * 100, modelMeanCm: modelMean * 100 } : {}), startUtc: new Date(samples[0].utc).toISOString(), endUtc: new Date(samples.at(-1).utc).toISOString() }];
  return validateTidePackage(packet, config, fields);
}
