import { rebuildHarmonicPacket, TIDE_SPEEDS } from './japan-tides.js';
import { validateTidePackage, interpolateTime } from './ocean-boundary.js';
import { appendTideDataInfo } from './tide-data-info.js';

let displayTide = true, graphHours = 72;
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
    <details><summary>高度な設定：平均振幅・遅角・セル別・追加分潮</summary>
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
export function bindTideEditor(config, fields, { commit, onError, side = 'west' }) {
  const $ = id => document.getElementById(id), column = $('companionColumn');
  if (!column) return;
  $('boundaryTidePanel')?.remove();
  if (document.body.dataset.step !== '3') return;
  const packet = config.ocean?.tides, enabled = config.ocean?.tideMode !== 'off' && Boolean(packet);
  const panel = document.createElement('section'); panel.id = 'boundaryTidePanel'; panel.setAttribute('aria-label', `${names[side]}境界の潮汐`);
  const header = document.createElement('div'); header.className = 'tide-preview-heading';
  const label = document.createElement('label'), toggle = document.createElement('input'); toggle.id = 'showBoundaryTide'; toggle.type = 'checkbox'; toggle.checked = displayTide && enabled; toggle.disabled = !enabled;
  label.append(toggle, document.createTextNode('潮汐を表示')); const title = document.createElement('strong'); title.textContent = `${names[side]}境界`; header.append(title, label);
  const plot = document.createElement('div'); plot.id = 'boundaryTidePlot';
  const tools = document.createElement('div'); tools.className = 'tide-plot-tools'; const range = document.createElement('output');
  const button = (text, icon, action) => { const b = document.createElement('button'); b.type = 'button'; b.title = text; b.setAttribute('aria-label', text); b.innerHTML = `<i data-lucide="${icon}"></i>`; b.onclick = action; tools.append(b); return b; };
  panel.append(header, tools, plot); column.prepend(panel);
  const active = !['closed', 'periodic'].includes(config.boundary[side].mode), points = sideTidePoints(packet, fields, side);
  const editable = enabled && packet.bundledJapan && $('tideToolbarControls');
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
  const render = () => {
    const visible = toggle.checked; plot.hidden = tools.hidden = !visible;
    if (!visible) return;
    if (!active || !points.length) { plot.textContent = '閉鎖・周期境界、または水域なし：潮汐は適用されません。'; tools.hidden = true; return; }
    const hours = Math.min(graphHours, packet.times.at(-1) / 3600), count = Math.max(145, Math.ceil(hours * 2) + 1), times = Array.from({ length: count }, (_, i) => i / (count - 1) * hours);
    const adjusted = previewKey ? points.map(p => ({ ...p, [previewKey]: previewValue })) : points;
    const mean = editable ? averageHarmonics(adjusted, packet, true) : null;
    const values = times.map(t => mean ? Object.values(mean).reduce((sum, h) => sum + h.amplitudeCm / 100 * Math.cos((h.speedDegreesHour * t - h.lagDegrees) * Math.PI / 180), 0) : points.reduce((sum, p) => sum + interpolateTime(packet.times, p.height, t * 3600), 0) / points.length);
    const base = editable ? Math.max(.01, ...points.map(p => Object.values(p.harmonics).reduce((s, h) => s + h.amplitudeCm / 100, 0))) * 3 : .01;
    const bound = Math.max(base, ...values.map(Math.abs)) * 1.1;
    const chart = svg('svg', { viewBox: '0 0 620 230', role: 'img', 'aria-label': `${names[side]}境界の平均潮位。時間h・潮位m` }), x = t => 55 + t / hours * 540, y = v => 108 - v / bound * 78;
    for (let i = 0; i < 5; i++) { const t = hours * i / 4, h = bound * (i / 2 - 1); chart.append(svg('line', { x1: 55, x2: 595, y1: y(h), y2: y(h), stroke: '#ddd' }), svg('text', { x: 48, y: y(h) + 4, 'text-anchor': 'end', 'font-size': 13 }, h.toFixed(2)), svg('text', { x: x(t), y: 205, 'text-anchor': 'middle', 'font-size': 13 }, t.toFixed(1))); }
    chart.append(svg('text', { x: 10, y: 18, 'font-size': 14 }, '潮位（m）'), svg('text', { x: 310, y: 226, 'text-anchor': 'middle', 'font-size': 14 }, '計算開始からの時間（h）'), svg('polyline', { points: times.map((t, i) => `${x(t)},${y(values[i])}`).join(' '), fill: 'none', stroke: '#0072b2', 'stroke-width': 2 }));
    plot.replaceChildren(chart); range.textContent = `0〜${hours} h・${points.length} セル平均`;
  };
  button('潮汐グラフを拡大', 'zoom-in', () => { graphHours = Math.max(6, graphHours / 2); render(); });
  button('潮汐グラフを縮小', 'zoom-out', () => { graphHours = Math.min(packet?.times.at(-1) / 3600 || 72, graphHours * 2); render(); }); tools.append(range);
  if (enabled) { appendTideDataInfo(panel, config, fields); panel.querySelector('details').className = 'tide-inline-data'; }
  toggle.onchange = () => { displayTide = toggle.checked; render(); }; render();
  if (!editable) return;
  const apply = action => { try { const next = structuredClone(packet); action(next); rebuildHarmonicPacket(next); validateTidePackage(next, config, fields); config.ocean.tides = next; commit(); } catch (error) { onError(error.message); } };
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
