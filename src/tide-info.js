import { analyzeBoundaryTides } from './tide-analysis.js';
import { runPeriod } from './run-period.js';
import { appendTideDataInfo } from './tide-data-info.js';

const styles = { west: ['西', '#0072b2', ''], east: ['東', '#d55e00', '7 3'], south: ['南', '#009e73', '2 3'], north: ['北', '#a64b96', '9 3 2 3'] };
const ns = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function showTideInfo(config, fields) {
  document.getElementById('tideInfoDialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.id = 'tideInfoDialog'; dialog.className = 'tide-info-dialog';
  const title = document.createElement('h2'); title.textContent = '潮汐の情報'; dialog.append(title);
  try {
    appendTideDataInfo(dialog, config, fields);
    const period = runPeriod(config), analysis = analyzeBoundaryTides(config, fields, period.seconds);
    const note = document.createElement('p'); note.textContent = `${analysis.source}。${analysis.summary}`; dialog.append(note);
    if (analysis.enabled) {
      const end = analysis.representedSeconds;
      const indices = analysis.times.flatMap((t, i) => t <= end ? [i] : []);
      const values = analysis.series.flatMap(s => indices.map(i => s.values[i]));
      const min = Math.min(0, ...values), max = Math.max(0, ...values), span = max - min || 1;
      const low = min - span * .08, high = max + span * .08;
      let start = 0, extent = end || 1;
      const width = Math.max(300, Math.min(1050, window.innerWidth - 90)), height = 380;
      const x = t => 58 + (t - start) / extent * (width - 78), y = v => 325 - (v - low) / (high - low) * 290;
      const chart = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': '４境界の平均潮位。横軸は計算開始からの日数、縦軸は潮位メートル', class: 'tide-info-chart' });
      chart.style.aspectRatio = `${width} / ${height}`;
      const tools = document.createElement('div'); tools.className = 'tide-info-tools';
      const button = (label, icon, action) => {
        const b = document.createElement('button'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.innerHTML = `<i data-lucide="${icon}"></i>`; b.onclick = action; tools.append(b); return b;
      };
      const clamp = () => { start = Math.max(0, Math.min(Math.max(0, end - extent), start)); };
      const zoom = factor => { const center = start + extent / 2; extent = Math.max(Math.min(end, 3600), Math.min(end || 1, extent * factor)); start = center - extent / 2; clamp(); render(); };
      const minus = button('潮汐グラフを縮小', 'zoom-out', () => zoom(2));
      const plus = button('潮汐グラフを拡大', 'zoom-in', () => zoom(.5));
      button('潮汐グラフの全期間', 'maximize', () => { start = 0; extent = end || 1; render(); });
      const left = button('前の期間', 'chevron-left', () => { start -= extent / 2; clamp(); render(); });
      const right = button('次の期間', 'chevron-right', () => { start += extent / 2; clamp(); render(); });
      const range = document.createElement('input'); range.type = 'range'; range.min = 0; range.step = 'any'; range.setAttribute('aria-label', '潮汐グラフの表示期間');
      range.oninput = () => { start = Number(range.value); clamp(); render(); }; tools.append(range);
      const rangeText = document.createElement('output'); tools.append(rangeText);
      const legend = document.createElement('div'); legend.className = 'tide-info-legend';
      for (const series of analysis.series) {
        const [label, color, dash] = styles[series.side];
        const item = document.createElement('span'); item.style.color = color; item.textContent = `${label}境界（${series.count}地点平均）`; legend.append(item);
      }
      function render() {
        chart.replaceChildren(); chart.dataset.start = start; chart.dataset.end = start + extent;
        for (let i = 0; i <= 4; i++) {
          const value = low + (high - low) * i / 4, t = start + extent * i / 4;
          chart.append(svgElement('line', { x1: 58, x2: width - 20, y1: y(value), y2: y(value), stroke: '#ddd' }), svgElement('text', { x: 50, y: y(value) + 4, 'text-anchor': 'end' }, value.toFixed(2)), svgElement('text', { x: x(t), y: 349, 'text-anchor': 'middle' }, (t / 86400).toFixed(2)));
        }
        chart.append(svgElement('text', { x: 58, y: 20 }, '潮位（m）'), svgElement('text', { x: width / 2, y: 375, 'text-anchor': 'middle' }, '計算開始からの日数（日）'));
        const defs = svgElement('defs', {}), clip = svgElement('clipPath', { id: 'tidePlotClip' }); clip.append(svgElement('rect', { x: 58, y: 35, width: width - 78, height: 290 })); defs.append(clip); chart.append(defs);
        for (const series of analysis.series) {
          const [, color, dash] = styles[series.side];
          chart.append(svgElement('polyline', { points: indices.map(i => `${x(analysis.times[i])},${y(series.values[i])}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash, 'clip-path': 'url(#tidePlotClip)' }));
        }
        minus.disabled = extent >= end; plus.disabled = extent <= Math.min(end, 3600); left.disabled = start <= 0; right.disabled = start + extent >= end;
        range.max = Math.max(0, end - extent); range.value = start; range.disabled = extent >= end;
        rangeText.textContent = `${(start / 86400).toFixed(2)}–${((start + extent) / 86400).toFixed(2)} 日`;
      }
      let drag;
      chart.onpointerdown = e => { if (extent >= end) return; drag = { x: e.clientX, start }; chart.setPointerCapture(e.pointerId); };
      chart.onpointermove = e => { if (!drag) return; start = drag.start - (e.clientX - drag.x) / (chart.getBoundingClientRect().width * (width - 78) / width) * extent; clamp(); render(); };
      chart.onpointerup = chart.onpointercancel = () => { drag = undefined; };
      chart.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 2 : .5); }, { passive: false });
      render(); dialog.append(legend, tools, chart);
      const explanation = document.createElement('p'); explanation.textContent = '閉鎖・周期境界と陸域は除外。角の水域セルは接する両境界に含みます。大潮・小潮は各地点の潮差からの目安で、境界平均の振幅だけでは判定しません。MDT・潮位補正はこの図に含みません。'; dialog.append(explanation);
      if (analysis.truncated) { const warning = document.createElement('p'); warning.className = 'tide-info-warning'; warning.textContent = '指定した計算期間を潮汐データがカバーしていません。図はデータのある期間のみです。'; dialog.append(warning); }
    }
  } catch (error) { const note = document.createElement('p'); note.textContent = error.message; note.setAttribute('role', 'alert'); dialog.append(note); }
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる'; close.onclick = () => dialog.close(); dialog.append(close);
  document.body.append(dialog); dialog.showModal();
  window.lucide?.createIcons();
}
