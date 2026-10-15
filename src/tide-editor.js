import { rebuildHarmonicPacket, TIDE_SPEEDS } from './japan-tides.js';
import { validateTidePackage, interpolateTime } from './ocean-boundary.js';
import { appendTideDataInfo } from './tide-data-info.js';
import { tideContext } from './tide-analysis.js';
import { tideExportRows, tideExcel, tideCsv, readTideSpreadsheet } from './tide-spreadsheet.js';
import { fitTideHarmonics } from './tide-harmonic-fit.js';
import { chooseSaveTarget, writeToTarget } from './explicit-save.js';

let graphHours = 30 * 24, graphStartHours = 0;
const names = { west: '西', east: '東', south: '南', north: '北' };
export function sideTidePoints(packet, fields, side) {
  return (packet?.points ?? []).filter(p => fields.mask[p.cell] && (side === 'west' ? p.cell % fields.nx === 0 : side === 'east' ? p.cell % fields.nx === fields.nx - 1 : side === 'south' ? Math.floor(p.cell / fields.nx) === 0 : Math.floor(p.cell / fields.nx) === fields.ny - 1));
}
export function averageHarmonics(points, packet = {}, effective = false) {
  const result = {}, count = points.length;
  if (!count) return result;
  for (const p of points) for (const [name, h] of Object.entries(p.harmonics ?? {})) {
    const speed = h.speedDegreesHour ?? TIDE_SPEEDS[name];
    if (result[name] && Math.abs(result[name].speedDegreesHour - speed) > 1e-8) throw new Error(`${name}の速度がセル間で一致しません。`);
    const scale = effective ? p.amplitudeScale ?? packet.amplitudeScale ?? 1 : 1;
    const lag = h.lagDegrees + (effective ? speed * (p.phaseShiftHours ?? packet.phaseShiftHours ?? 0) : 0), rad = lag * Math.PI / 180;
    result[name] ??= { real: 0, imaginary: 0, speedDegreesHour: speed };
    result[name].real += scale * h.amplitudeCm * Math.cos(rad) / count; result[name].imaginary += scale * h.amplitudeCm * Math.sin(rad) / count;
  }
  return Object.fromEntries(Object.entries(result).map(([name, h]) => [name, { amplitudeCm: Math.hypot(h.real, h.imaginary), lagDegrees: Math.hypot(h.real, h.imaginary) < 1e-10 ? 0 : (Math.atan2(h.imaginary, h.real) * 180 / Math.PI + 360) % 360, speedDegreesHour: h.speedDegreesHour }]));
}
export function correctMeanHarmonics(points, desired) {
  const mean = averageHarmonics(points);
  for (const p of points) {
    const adjusted = {};
    for (const [name, target] of Object.entries(desired)) {
      const prior = p.harmonics[name] ?? { amplitudeCm: 0, lagDegrees: 0 }, average = mean[name] ?? { amplitudeCm: 0, lagDegrees: 0 };
      const real = h => h.amplitudeCm * Math.cos(h.lagDegrees * Math.PI / 180), imag = h => h.amplitudeCm * Math.sin(h.lagDegrees * Math.PI / 180);
      const r = real(prior) + real(target) - real(average), i = imag(prior) + imag(target) - imag(average);
      adjusted[name] = { amplitudeCm: Math.hypot(r, i), lagDegrees: Math.hypot(r, i) < 1e-10 ? 0 : (Math.atan2(i, r) * 180 / Math.PI + 360) % 360, speedDegreesHour: target.speedDegreesHour ?? TIDE_SPEEDS[name] };
    }
    p.harmonics = adjusted; p.amplitudeCorrected = true;
  }
}
export function tideEditorMarkup(packet) {
  if (!packet?.bundledJapan) return '';
  return `<section class="tide-editor"><div id="tideToolbarControls" class="tide-toolbar-controls">
    <label class="field"><span>潮汐倍率</span><input id="tideScale" type="range" min="0" max="3" step="0.01"><input id="tideScaleNumber" aria-label="潮汐の振幅倍率" type="number" min="0" max="10" step="0.01"></label>
    <label class="field"><span>潮汐移動（h）</span><input id="tideShift" type="range" min="-24" max="24" step="0.25"><input id="tideShiftNumber" aria-label="潮汐の波形移動時間" type="number" min="-744" max="744" step="0.25"></label></div>
    <details id="advancedTideSettings"><summary>高度な設定：潮汐の補正</summary>
    <h4>気象庁形式の分潮：振幅・遅角で補正</h4>
    <label class="field"><span>入力補正する範囲</span><select id="harmonicCell"></select></label>
    <p class="source-note">選択境界の複素平均（倍率・移動を適用する前）を表示。平均補正は各セルの偏差を残して平均値を合わせます。角のセルは接する両境界で共有されます。全境界では同じ値を全セルに指定します。</p>
    <table><thead><tr><th>分潮</th><th>振幅（cm）</th><th>遅角（度）</th></tr></thead><tbody>${Object.keys(TIDE_SPEEDS).map(name => `<tr><th>${name}</th><td><input id="harmonicAmp${name}" aria-label="${name}振幅cm" type="number" min="0" max="2000" step="any"></td><td><input id="harmonicLag${name}" aria-label="${name}遅角度" type="number" min="0" max="360" step="any"></td></tr>`).join('')}</tbody></table>
    <label class="field"><span>追加分潮：名前,速度（度/時）,振幅（cm）,遅角（度）</span><textarea id="extraHarmonics" rows="4" placeholder="N2,28.4397295,10,0&#10;M4,57.9682084,2,0"></textarea></label>
    <p class="source-note">空欄で追加分潮を削除。振幅補正を適用したセルの外挿警告を解除します。天文引数・節点補正なし。</p>
    <button type="button" id="applyHarmonics"><i data-lucide="check"></i>振幅・遅角を入力補正</button></details></section>`;
}
export function parseExtraHarmonics(text) {
  const result = {};
  for (const line of text.trim().split(/\r?\n/).filter(s => s.trim())) {
    const values = line.split(',').map(s => s.trim()), [name, speed, amp, lag] = values;
    if (values.length !== 4 || !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(name) || TIDE_SPEEDS[name] || Object.hasOwn(result, name) || values.slice(1).some(s => !s || !Number.isFinite(Number(s))) || !(Number(speed) > 0 && Number(speed) <= 180) || Number(amp) < 0 || Number(amp) > 2000 || Number(lag) < 0 || Number(lag) > 360) throw new Error('追加分潮の名前・速度・振幅・遅角を確認してください。');
    result[name] = { speedDegreesHour: Number(speed), amplitudeCm: Number(amp), lagDegrees: Number(lag) };
  }
  if (Object.keys(result).length > 60) throw new Error('追加分潮は60個までです。');
  return result;
}
export function bindTideEditor(config, fields, { commit, onError, side = 'west', isBusy = () => false, message = () => {} }) {
  const $ = id => document.getElementById(id), column = $('companionColumn');
  if (!column) return;
  $('boundaryTidePanel')?.remove();
  if (document.body.dataset.step !== '3') return;
  const packet = config.ocean?.tides, context = tideContext(config, fields), enabled = context.enabled;
  const panel = document.createElement('section'); panel.id = 'boundaryTidePanel'; panel.setAttribute('aria-label', `${names[side]}境界の潮汐`);
  panel.hidden = !enabled;
  const header = document.createElement('div'); header.className = 'tide-preview-heading';
  const observed = packet?.seriesCorrectionFiles?.some(file => file.kind === 'observed');
  const title = document.createElement('strong'); title.textContent = `${names[side]}境界の${observed ? '水位変動（実測補正込み）' : '潮汐'}`; header.append(title);
  const plot = document.createElement('div'); plot.id = 'boundaryTidePlot';
  const tools = document.createElement('div'); tools.className = 'tide-plot-tools'; const range = document.createElement('output');
  const button = (text, icon, action) => { const b = document.createElement('button'); b.type = 'button'; b.title = text; b.setAttribute('aria-label', text); b.innerHTML = `<i data-lucide="${icon}"></i>`; b.onclick = action; tools.append(b); return b; };
  panel.append(header, tools, plot); column.prepend(panel);
  const active = !['closed', 'periodic'].includes(config.boundary[side].mode), points = sideTidePoints(packet ?? { points: context.cells.map(cell => ({ cell })) }, fields, side);
  const editable = enabled && packet?.bundledJapan && $('tideToolbarControls');
  if (editable) {
    document.getElementById('editToolOptions').append($('tideToolbarControls'));
    for (const [numeric, slider, key, fallback] of [['tideScaleNumber', 'tideScale', 'amplitudeScale', 1], ['tideShiftNumber', 'tideShift', 'phaseShiftHours', 0]]) {
      $(numeric).value = points.length ? points.reduce((sum, p) => sum + (p[key] ?? packet[key] ?? fallback), 0) / points.length : fallback;
      $(slider).value = $(numeric).value; $(numeric).disabled = $(slider).disabled = !active || !points.length;
      $(numeric).dataset.tideInactive = $(slider).dataset.tideInactive = String(!active || !points.length);
    }
  }
  const svg = (tag, attrs, text) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); if (text !== undefined) el.textContent = text; return el; };
  let previewKey, previewValue;
  const totalHours = context.end / 3600;
  const clampPeriod = () => { graphStartHours = Math.max(0, Math.min(Math.max(0, totalHours - Math.min(graphHours, totalHours)), graphStartHours)); };
  const periodSlider = document.createElement('input'); periodSlider.type = 'range'; periodSlider.min = 0; periodSlider.step = 'any'; periodSlider.setAttribute('aria-label', '境界潮汐グラフの開始時刻');
  periodSlider.oninput = () => { graphStartHours = periodSlider.valueAsNumber; clampPeriod(); render(); };
  const render = () => {
    const visible = enabled; plot.hidden = tools.hidden = !visible;
    column.dispatchEvent(new Event('companion-layout'));
    if (!visible) return;
    if (!active || !points.length) { plot.textContent = '閉鎖・周期境界、または水域なし：潮汐は適用されません。'; tools.hidden = true; return; }
    clampPeriod();
    const hours = Math.min(graphHours, totalHours), count = Math.max(145, Math.ceil(hours * 2) + 1), times = Array.from({ length: count }, (_, i) => graphStartHours + i / (count - 1) * hours);
    const adjusted = previewKey ? points.map(p => ({ ...p, [previewKey]: previewValue })) : points;
    const mean = editable ? averageHarmonics(adjusted, packet, true) : null;
    const values = times.map(t => mean ? Object.values(mean).reduce((sum, h) => sum + h.amplitudeCm / 100 * Math.cos((h.speedDegreesHour * t - h.lagDegrees) * Math.PI / 180), 0)
      + points.reduce((sum, p) => sum + (p.heightCorrections ? interpolateTime(packet.times, p.heightCorrections, t * 3600 + (Date.parse(config.ocean.startUtc) - Date.parse(packet.epoch)) / 1000) : 0), 0) / points.length
      : points.reduce((sum, p) => sum + context.value(p.cell, t * 3600), 0) / points.length);
    const bound = Math.max(1e-6, ...values.map(Math.abs)) * 1.05;
    const chart = svg('svg', { viewBox: '0 0 620 230', role: 'img', 'aria-label': `${names[side]}境界の平均潮位。日数・潮位m`, 'data-start-hours': graphStartHours, 'data-end-hours': graphStartHours + hours }), x = t => 55 + (t - graphStartHours) / hours * 540, y = v => 108 - v / bound * 78;
    chart.dataset.amplitudeMax = bound;
    for (let i = 0; i < 5; i++) { const t = graphStartHours + hours * i / 4, h = bound * (i / 2 - 1); chart.append(svg('line', { x1: 55, x2: 595, y1: y(h), y2: y(h), stroke: '#ddd' }), svg('text', { x: 48, y: y(h) + 4, 'text-anchor': 'end', 'font-size': 13 }, bound < .01 ? h.toExponential(1) : h.toFixed(2)), svg('text', { x: x(t), y: 205, 'text-anchor': 'middle', 'font-size': 13 }, (t / 24).toFixed(hours < 24 ? 2 : 1))); }
    chart.append(svg('text', { x: 10, y: 18, 'font-size': 14 }, '潮位（m）'), svg('text', { x: 310, y: 226, 'text-anchor': 'middle', 'font-size': 14 }, '計算開始からの日数（日）'), svg('polyline', { points: times.map((t, i) => `${x(t)},${y(values[i])}`).join(' '), fill: 'none', stroke: '#0072b2', 'stroke-width': 2 }));
    plot.replaceChildren(chart); range.textContent = `${Number((graphStartHours / 24).toFixed(2))}〜${Number(((graphStartHours + hours) / 24).toFixed(2))} 日・${points.length} セル平均${totalHours < 720 ? '（入力データの期間のみ）' : ''}`;
    periodSlider.max = Math.max(0, totalHours - hours); periodSlider.value = graphStartHours; periodSlider.disabled = totalHours <= hours;
    const excel = tools.querySelector('[data-tide-month-export]');
    if (excel) { excel.disabled = !enabled || !active || !points.length || graphStartHours + 720 > totalHours; excel.title = excel.disabled ? '表示開始位置から30日間を含む潮汐データが必要です' : '補正用Excelを出力（30日間）'; }
  };
  const zoom = factor => { const center = graphStartHours + Math.min(graphHours, totalHours) / 2; graphHours = Math.min(totalHours, Math.max(Math.min(6, totalHours), graphHours * factor)); graphStartHours = center - graphHours / 2; clampPeriod(); render(); };
  button('潮汐グラフを拡大', 'zoom-in', () => zoom(.5));
  button('潮汐グラフを縮小', 'zoom-out', () => zoom(2));
  button('潮汐グラフを全期間表示', 'maximize', () => { graphHours = totalHours; graphStartHours = 0; render(); });
  button('潮汐グラフを前へ', 'chevron-left', () => { graphStartHours -= graphHours / 2; clampPeriod(); render(); });
  button('潮汐グラフを次へ', 'chevron-right', () => { graphStartHours += graphHours / 2; clampPeriod(); render(); });
  tools.append(periodSlider, range);
  const download = async format => {
    try {
      const captured = structuredClone(config), start = graphStartHours, end = format === 'xlsx' ? start + 720 : start + Math.min(graphHours, totalHours);
      if (end > totalHours) throw new Error('補正用Excelには表示開始位置から30日分の潮汐データが必要です。予測期間を延ばすか開始位置を戻してください。');
      const target = await chooseSaveTarget(`webroms-tide-${side}.${format}`); if (!target) return;
      const rows = tideExportRows(captured, fields, side, start, end);
      const content = format === 'csv' ? tideCsv(rows) : await tideExcel(rows, { boundary: side, start_utc: rows[1][0], end_utc: rows.at(-1)[0], source: context.source, unit: 'cm', quantity: 'reference tidal boundary variation; excludes MDT', observation_input: 'observed_cm + time_jst (preferred) or time_utc; one month; fit M2/S2/K1/O1 amplitude and phase; mean and trend excluded' });
      await writeToTarget(target, content); message(`保存先：${target.name}`);
    } catch (error) { onError(error.message); }
  };
  const excelButton = button('補正用Excelを出力（30日間）', 'file-spreadsheet', () => download('xlsx')); excelButton.dataset.tideMonthExport = '';
  const csvButton = button('表示中の潮汐をCSV出力', 'file-down', () => download('csv'));
  excelButton.disabled = csvButton.disabled = !enabled || !active || !points.length;
  let drag;
  plot.onpointerdown = event => { if (event.button !== 0) return; drag = { x: event.clientX, start: graphStartHours }; plot.setPointerCapture(event.pointerId); };
  plot.onpointermove = event => { if (!drag) return; graphStartHours = drag.start - (event.clientX - drag.x) / Math.max(1, plot.clientWidth * 540 / 620) * Math.min(graphHours, totalHours); clampPeriod(); render(); };
  plot.onpointerup = plot.onpointercancel = () => { drag = undefined; };
  plot.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 2 : .5); }, { passive: false });
  if (enabled) { appendTideDataInfo(panel, config, fields); panel.querySelector('details').className = 'tide-inline-data'; }
  render();
  if (!editable) return;
  const apply = action => { if (isBusy()) return; try { const next = structuredClone(packet); action(next); rebuildHarmonicPacket(next); validateTidePackage(next, config, fields); config.ocean.tides = next; commit(); } catch (error) { onError(error.message); } };
  const observationEditor = document.createElement('section');
  observationEditor.innerHTML = '<h4>実測Excel・CSVから振幅・位相を推定</h4><label class="field"><span>約1か月分の実測潮位（cm）</span><input id="tideObservedImport" type="file" accept=".xlsx,.csv"></label><p class="source-note">observed_cm と time_jst（または time_utc）を入力。主要4分潮を最小二乗推定します。観測平均・直線トレンドは除外し、MDTや実測時系列そのものは加算しません。遅角は潮汐データの基準日時に対する実験用の値です。</p><output id="tideFitPreview"></output><button type="button" id="applyObservedHarmonics" disabled>推定した振幅・位相を適用</button>';
  $('advancedTideSettings').append(observationEditor);
  let fitted, fittedFile;
  $('tideObservedImport').onchange = async event => {
    const input = event.currentTarget, file = input.files[0]; if (!file || isBusy()) return;
    const snapshot = JSON.stringify(config); fitted = undefined; $('applyObservedHarmonics').disabled = true;
    $('tideFitPreview').textContent = '実測値から振幅・位相を推定中…';
    try {
      const samples = await readTideSpreadsheet(file, 'observed', { minimumDays: 30 });
      if (!input.isConnected || isBusy() || JSON.stringify(config) !== snapshot) return;
      fitted = fitTideHarmonics(samples, packet.epoch); fittedFile = file.name;
      $('tideFitPreview').textContent = Object.entries(fitted.harmonics).map(([name, h]) => `${name}：${h.amplitudeCm.toFixed(2)} cm ／ ${h.lagDegrees.toFixed(2)}°`).join('　') + `　残差RMSE：${fitted.rmseCm.toFixed(2)} cm。選択境界の平均を補正します（既存の時系列加算補正は解除）。`;
      $('applyObservedHarmonics').disabled = false;
    } catch (error) { $('tideFitPreview').textContent = ''; onError(error.message); }
    finally { input.value = ''; }
  };
  $('applyObservedHarmonics').onclick = () => { if (!fitted) return; apply(next => {
    const selected = sideTidePoints(next, fields, side);
    for (const point of selected) {
      point.harmonics = averageHarmonics([point], next, true);
      point.amplitudeScale = 1; point.phaseShiftHours = 0; delete point.heightCorrections;
    }
    correctMeanHarmonics(selected, { ...averageHarmonics(selected), ...fitted.harmonics });
    next.harmonicFits = [...(next.harmonicFits ?? []), { ...fitted, side, source: fittedFile }];
  }); };
  for (const [slider, numeric, key] of [['tideScale', 'tideScaleNumber', 'amplitudeScale'], ['tideShift', 'tideShiftNumber', 'phaseShiftHours']]) {
    $(slider).oninput = () => { $(numeric).value = $(slider).value; previewKey = key; previewValue = $(numeric).valueAsNumber; if (Number.isFinite(previewValue)) render(); };
    $(numeric).oninput = () => { $(slider).value = $(numeric).value; previewKey = key; previewValue = $(numeric).valueAsNumber; if (Number.isFinite(previewValue)) render(); };
    $(slider).onchange = $(numeric).onchange = () => apply(next => { for (const p of sideTidePoints(next, fields, side)) p[key] = $(numeric).valueAsNumber; });
  }
  $('harmonicCell').add(new Option(`${names[side]}境界の平均値を補正`, 'mean'));
  $('harmonicCell').add(new Option('全境界セル', 'all'));
  for (const p of packet.points) $('harmonicCell').add(new Option(`セル (${p.cell % fields.nx + 1}, ${Math.floor(p.cell / fields.nx) + 1})`, p.cell));
  const fill = () => {
    const harmonics = $('harmonicCell').value === 'mean' ? averageHarmonics(points) : (packet.points.find(p => String(p.cell) === $('harmonicCell').value) ?? packet.points[0]).harmonics;
    for (const name of Object.keys(TIDE_SPEEDS)) { $(`harmonicAmp${name}`).value = harmonics[name]?.amplitudeCm ?? 0; $(`harmonicLag${name}`).value = harmonics[name]?.lagDegrees ?? 0; }
    $('extraHarmonics').value = Object.entries(harmonics).filter(([name]) => !TIDE_SPEEDS[name]).map(([name, h]) => `${name},${h.speedDegreesHour},${h.amplitudeCm},${h.lagDegrees}`).join('\n');
    $('applyHarmonics').disabled = $('harmonicCell').value === 'mean' && (!active || !points.length);
  };
  $('harmonicCell').onchange = fill;
  $('applyHarmonics').onclick = () => apply(next => {
    const harmonics = parseExtraHarmonics($('extraHarmonics').value);
    for (const name of Object.keys(TIDE_SPEEDS)) {
      const amplitudeCm = $(`harmonicAmp${name}`).valueAsNumber, lagDegrees = $(`harmonicLag${name}`).valueAsNumber;
      if (!Number.isFinite(amplitudeCm) || amplitudeCm < 0 || amplitudeCm > 2000 || !Number.isFinite(lagDegrees) || lagDegrees < 0 || lagDegrees > 360) throw new Error('振幅・遅角の入力値を確認してください。');
      harmonics[name] = { amplitudeCm, lagDegrees, speedDegreesHour: TIDE_SPEEDS[name] };
    }
    if ($('harmonicCell').value === 'mean') correctMeanHarmonics(sideTidePoints(next, fields, side), harmonics);
    else for (const p of next.points) if ($('harmonicCell').value === 'all' || String(p.cell) === $('harmonicCell').value) { p.harmonics = structuredClone(harmonics); p.amplitudeCorrected = true; }
  });
  fill();
}
