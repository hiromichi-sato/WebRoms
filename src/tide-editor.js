import { rebuildHarmonicPacket, TIDE_SPEEDS } from './japan-tides.js';
import { validateTidePackage } from './ocean-boundary.js';
import { showTideInfo } from './tide-info.js';

let tideFocus = false, focusListenersBound = false;
function setTideFocus(active) {
  const changed = tideFocus !== active;
  tideFocus = active;
  const host = document.getElementById('boundaryTidePreview');
  if (host) host.hidden = !active;
  document.querySelector('.workspace')?.classList.toggle('tide-focus', active);
  if (changed && active && window.innerWidth > 1000) document.querySelector('.workspace')?.scrollTo({ top: 0, behavior: 'instant' });
}
function ensureLargePreview() {
  let host = document.getElementById('boundaryTidePreview');
  if (!host) {
    host = document.createElement('section'); host.id = 'boundaryTidePreview'; host.hidden = true;
    host.setAttribute('aria-label', '潮汐操作の拡大グラフ');
    const heading = document.createElement('div'); heading.className = 'tide-preview-heading';
    const title = document.createElement('strong'); title.textContent = '潮汐場・4境界平均';
    const full = document.createElement('button'); full.type = 'button'; full.title = '全期間グラフを拡大・縮小'; full.setAttribute('aria-label', full.title); full.innerHTML = '<i data-lucide="maximize"></i>';
    full.onclick = () => document.getElementById('boundaryTideInfo')?.click();
    const back = document.createElement('button'); back.type = 'button'; back.innerHTML = '<i data-lucide="box"></i>境界図を大きく表示'; back.onclick = () => setTideFocus(false);
    const plot = document.createElement('div'); plot.id = 'boundaryTidePlot'; heading.append(title, full, back); host.append(heading, plot);
    document.getElementById('scenePair')?.before(host);
  }
  if (!focusListenersBound) {
    const focus = event => {
      const target = event.target;
      if (!(target instanceof Element) || document.body.dataset.step !== '3') return;
      if (target.closest('.tide-editor,#boundaryTidePreview')) { if (target.closest('#boundaryTidePreview button')) return; setTideFocus(true); }
      else if (target.closest('#settingsForm,#editToolOptions,.view-toolbar,.display-options,#scenePair,.input-check-toolbar') || ['boundaryVariable', 'boundaryLayer', 'boundaryBrushSize', 'editValue', 'fieldSelect'].includes(target.id)) setTideFocus(false);
    };
    document.addEventListener('focusin', focus); document.addEventListener('pointerdown', focus);
    document.addEventListener('change', focus, true);
    focusListenersBound = true;
  }
  return host;
}

export function tideEditorMarkup(packet) {
  if (!packet?.bundledJapan) return '';
  return `<section class="tide-editor"><h3>作成した潮汐場</h3><div id="tidePreview"></div>
    <button type="button" id="boundaryTideInfo"><i data-lucide="chart-line"></i>全期間・使用データ</button>
    <div class="fields"><label class="field"><span>振幅倍率</span><input id="tideScale" type="range" min="0" max="3" step="0.01" value="${Math.min(3, packet.amplitudeScale ?? 1)}"><input id="tideScaleNumber" aria-label="潮汐の振幅倍率" type="number" min="0" max="10" step="0.01" value="${packet.amplitudeScale ?? 1}"></label>
    <label class="field"><span>波形の移動（時間、＋で遅らせる）</span><input id="tideShift" type="range" min="-24" max="24" step="0.25" value="${Math.max(-24, Math.min(24, packet.phaseShiftHours ?? 0))}"><input id="tideShiftNumber" aria-label="潮汐の波形移動時間" type="number" min="-744" max="744" step="0.25" value="${packet.phaseShiftHours ?? 0}"></label></div>
    <details><summary>高度な設定：セル別の振幅・遅角・追加分潮</summary>
    <label class="field"><span>入力補正する範囲</span><select id="harmonicCell"></select></label><p class="source-note">全境界では同じ入力値を全セルに適用します。振幅入力を適用したセルの遠距離外挿警告を解除します（精度の保証ではありません）。振幅倍率だけでは解除しません。</p>
    <table><thead><tr><th>分潮</th><th>振幅（cm）</th><th>遅角（度）</th></tr></thead><tbody>${Object.keys(TIDE_SPEEDS).map(name => `<tr><th>${name}</th><td><input id="harmonicAmp${name}" aria-label="${name}振幅cm" type="number" min="0" max="2000" step="any"></td><td><input id="harmonicLag${name}" aria-label="${name}遅角度" type="number" min="0" max="360" step="any"></td></tr>`).join('')}</tbody></table>
    <label class="field"><span>追加分潮：名前,速度（度/時）,振幅（cm）,遅角（度）</span><textarea id="extraHarmonics" rows="4" placeholder="N2,28.4397295,10,0&#10;M4,57.9682084,2,0"></textarea></label>
    <p class="source-note">1行1分潮。空欄で追加分潮なし。主要4分潮と重複する名前は不可。天文引数・節点補正は省略します。</p>
    <button type="button" id="applyHarmonics"><i data-lucide="check"></i>振幅・遅角を入力補正</button></details></section>`;
}
export function parseExtraHarmonics(text) {
  const result = {};
  for (const line of text.trim().split(/\r?\n/).filter(s => s.trim())) {
    const values = line.split(',').map(s => s.trim()), [name, speed, amp, lag] = values;
    if (values.length !== 4 || !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(name) || TIDE_SPEEDS[name] || Object.hasOwn(result, name) || values.slice(1).some(s => !s || !Number.isFinite(Number(s))) || !(Number(speed) > 0 && Number(speed) <= 180) || Number(amp) < 0 || Number(amp) > 2000 || Number(lag) < 0 || Number(lag) > 360) throw new Error('追加分潮は重複しない名前,速度（0〜180度/時、0不可）,振幅（0〜2000 cm）,遅角（0〜360度）です。');
    result[name] = { speedDegreesHour: Number(speed), amplitudeCm: Number(amp), lagDegrees: Number(lag) };
  }
  if (Object.keys(result).length > 60) throw new Error('追加分潮は60個までです。');
  return result;
}

export function bindTideEditor(config, fields, { commit, onError }) {
  const packet = config.ocean?.tides, $ = id => document.getElementById(id);
  if (!packet?.bundledJapan || !$('tidePreview') || config.ocean.tideMode === 'off') { setTideFocus(false); return; }
  ensureLargePreview(); setTideFocus(tideFocus);
  const colors = ['#0072b2', '#d55e00', '#009e73', '#a64b96'], sides = ['west', 'east', 'south', 'north'], labels = ['西', '東', '南', '北'];
  const groups = sides.map(side => packet.points.filter(p => fields.mask[p.cell] && !['closed', 'periodic'].includes(config.boundary[side].mode) && (side === 'west' ? p.cell % fields.nx === 0 : side === 'east' ? p.cell % fields.nx === fields.nx - 1 : side === 'south' ? Math.floor(p.cell / fields.nx) === 0 : Math.floor(p.cell / fields.nx) === fields.ny - 1)));
  const axisBase = Math.max(.01, ...groups.flat().map(p => Object.values(p.harmonics).reduce((sum, h) => sum + h.amplitudeCm / 100, 0))) * 3;
  const svg = (tag, attrs, text) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); if (text !== undefined) el.textContent = text; return el; };
  const preview = () => {
    const scale = $('tideScaleNumber').valueAsNumber, shift = $('tideShiftNumber').valueAsNumber;
    if (!Number.isFinite(scale) || !Number.isFinite(shift)) return;
    const hours = Math.min(72, packet.times.at(-1) / 3600), times = Array.from({ length: 145 }, (_, i) => hours * i / 144);
    const series = groups.map(group => times.map(t => group.length ? group.reduce((sum, p) => sum + Object.entries(p.harmonics).reduce((hSum, [name, h]) => hSum + scale * h.amplitudeCm / 100 * Math.cos(((h.speedDegreesHour ?? TIDE_SPEEDS[name]) * (t - shift) - h.lagDegrees) * Math.PI / 180), 0), 0) / group.length : 0));
    const bound = Math.max(axisBase, ...series.flat().map(Math.abs)) * 1.15, chart = svg('svg', { viewBox: '0 0 620 230', role: 'img', 'aria-label': '生成潮汐場の4境界平均。横軸は時間、縦軸は潮位m' });
    chart.style.width = '100%'; chart.style.height = 'auto';
    const x = t => 55 + t / hours * 540, y = h => 108 - h / bound * 78;
    for (let i = 0; i < 5; i++) { const t = hours * i / 4, h = bound * (i / 2 - 1); chart.append(svg('line', { x1: 55, x2: 595, y1: y(h), y2: y(h), stroke: '#ddd' }), svg('text', { x: 48, y: y(h) + 4, 'text-anchor': 'end', 'font-size': 12 }, h.toFixed(2)), svg('text', { x: x(t), y: 205, 'text-anchor': 'middle', 'font-size': 12 }, t.toFixed(0))); }
    chart.append(svg('text', { x: 10, y: 18, 'font-size': 13 }, '潮位（m）'), svg('text', { x: 310, y: 226, 'text-anchor': 'middle', 'font-size': 13 }, '計算開始からの時間（h）'));
    groups.forEach((group, i) => { if (!group.length) return; chart.append(svg('polyline', { points: times.map((t, j) => `${x(t)},${y(series[i][j])}`).join(' '), fill: 'none', stroke: colors[i], 'stroke-width': 2 }), svg('text', { x: 160 + i * 85, y: 18, fill: colors[i], 'font-size': 13 }, `${labels[i]}境界`)); });
    $('tidePreview').replaceChildren(chart);
    $('boundaryTidePlot').replaceChildren(chart.cloneNode(true));
  };
  const apply = action => { try { const next = structuredClone(packet); action(next); rebuildHarmonicPacket(next); validateTidePackage(next, config, fields); config.ocean.tides = next; commit(); } catch (error) { onError(error.message); } };
  for (const [slider, numeric, key] of [['tideScale', 'tideScaleNumber', 'amplitudeScale'], ['tideShift', 'tideShiftNumber', 'phaseShiftHours']]) {
    $(slider).oninput = () => { setTideFocus(true); $(numeric).value = $(slider).value; preview(); };
    $(numeric).oninput = () => { setTideFocus(true); $(slider).value = $(numeric).value; preview(); };
    $(slider).onchange = $(numeric).onchange = () => apply(next => { next[key] = $(numeric).valueAsNumber; });
  }
  $('boundaryTideInfo').onclick = () => showTideInfo(config, fields);
  $('harmonicCell').add(new Option('全境界セル', 'all'));
  for (const p of packet.points) $('harmonicCell').add(new Option(`セル (${p.cell % fields.nx + 1}, ${Math.floor(p.cell / fields.nx) + 1})`, p.cell));
  const fill = () => {
    const p = packet.points.find(p => String(p.cell) === $('harmonicCell').value) ?? packet.points[0];
    for (const name of Object.keys(TIDE_SPEEDS)) { $(`harmonicAmp${name}`).value = p.harmonics[name].amplitudeCm; $(`harmonicLag${name}`).value = p.harmonics[name].lagDegrees; }
    $('extraHarmonics').value = Object.entries(p.harmonics).filter(([name]) => !TIDE_SPEEDS[name]).map(([name, h]) => `${name},${h.speedDegreesHour},${h.amplitudeCm},${h.lagDegrees}`).join('\n');
  };
  $('harmonicCell').onchange = fill;
  $('applyHarmonics').onclick = () => apply(next => {
    const harmonics = parseExtraHarmonics($('extraHarmonics').value);
    for (const name of Object.keys(TIDE_SPEEDS)) {
      const amplitudeCm = $(`harmonicAmp${name}`).valueAsNumber, lagDegrees = $(`harmonicLag${name}`).valueAsNumber;
      if (!Number.isFinite(amplitudeCm) || amplitudeCm < 0 || amplitudeCm > 2000 || !Number.isFinite(lagDegrees) || lagDegrees < 0 || lagDegrees > 360) throw new Error('振幅・遅角の入力値を確認してください。');
      harmonics[name] = { amplitudeCm, lagDegrees };
    }
    for (const p of next.points) if ($('harmonicCell').value === 'all' || String(p.cell) === $('harmonicCell').value) { p.harmonics = structuredClone(harmonics); p.amplitudeCorrected = true; }
  });
  fill(); preview();
}
