import { analyzeBoundaryTides } from './tide-analysis.js';
import { runPeriod } from './run-period.js';
import { buildFields } from './model.js';
import { interpolateTime } from './ocean-boundary.js';

const styles = { west: ['西', '#0072b2', ''], east: ['東', '#d55e00', '8 4'], south: ['南', '#009e73', '2 4'], north: ['北', '#a64b96', '9 3 2 3'] };
const ns = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, text) {
  const element = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createRunTideChart(parent) {
  const panel = document.createElement('section'); panel.id = 'runTidePanel'; panel.hidden = true;
  parent.append(panel);
  let previous, drawMarker, chartObserver, hasChart = false, currentTime = 0, currentLabel = '計算時刻';
  const update = (visible, config) => {
    panel.hidden = !visible || !hasChart;
    if (!visible) return;
    const key = JSON.stringify([config.grid, config.boundary, config.ocean, config.numerics.dt, config.numerics.maxSteps]);
    if (key === previous) return;
    previous = key; chartObserver?.disconnect(); drawMarker = undefined; hasChart = false; panel.hidden = true; panel.replaceChildren();
    const observed = config.ocean?.tides?.seriesCorrectionFiles?.some(file => file.kind === 'observed');
    const heading = document.createElement('h3'); heading.textContent = observed ? '境界の代表水位（実測補正込み）· 全計算期間' : '境界の代表潮位 · 全計算期間'; panel.append(heading);
    try {
      const period = runPeriod(config), analysis = analyzeBoundaryTides(config, buildFields(config), period.seconds);
      if (!analysis.enabled) { const note = document.createElement('p'); note.textContent = '潮汐なし（潮汐による海面高度強制は0 m）'; panel.append(note); return; }
      hasChart = true; panel.hidden = false;
      const end = analysis.representedSeconds;
      const times = [...analysis.times.filter(time => time < end), end];
      const series = analysis.series.map(item => ({ ...item, values: times.map(time => interpolateTime(analysis.times, item.values, time)) }));
      const values = series.flatMap(item => item.values);
      const limit = Math.max(1e-6, ...values.map(Math.abs)) * 1.05;
      let start = 0, extent = end || 1;
      const chart = svg('svg', { viewBox: '0 0 560 250', role: 'img', 'aria-label': '全計算期間の境界別代表潮位', class: 'run-tide-chart' });
      const legend = document.createElement('div'); legend.className = 'run-tide-legend';
      for (const boundary of series) {
        const [label, color, dash] = styles[boundary.side], item = document.createElement('span');
        const sample = svg('svg', { viewBox: '0 0 30 10', 'aria-hidden': 'true' });
        sample.append(svg('line', { x1: 0, x2: 30, y1: 5, y2: 5, stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash }));
        item.append(sample, `${label}境界`); legend.append(item);
      }
      const tools = document.createElement('div'); tools.className = 'run-tide-tools';
      const clamp = () => { start = Math.max(0, Math.min(end - extent, start)); };
      const button = (label, icon, action) => {
        const b = document.createElement('button'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
        b.innerHTML = `<i data-lucide="${icon}"></i>`; b.onclick = action; tools.append(b); return b;
      };
      const zoom = factor => { const center = start + extent / 2; extent = Math.min(end || 1, Math.max(Math.min(end || 1, 3600), extent * factor)); start = center - extent / 2; clamp(); render(); };
      button('境界潮位を縮小', 'zoom-out', () => zoom(2));
      button('境界潮位を拡大', 'zoom-in', () => zoom(.5));
      button('境界潮位を全期間表示', 'maximize', () => { start = 0; extent = end || 1; render(); });
      const duration = document.createElement('output'); tools.append(duration);
      let marker, width = 560, height = 250;
      const left = 60, top = 32, right = () => width - 16, bottom = () => height - 40;
      drawMarker = () => {
        if (!marker) return;
        const position = left + (currentTime - start) / extent * (right() - left);
        marker.style.display = currentTime < start || currentTime > start + extent ? 'none' : '';
        marker.setAttribute('data-time', currentTime);
        const timeText = currentTime < 86400 ? `${(currentTime / 3600).toFixed(2)} h` : `${(currentTime / 86400).toFixed(2)} 日`;
        marker.replaceChildren(svg('line', { x1: position, x2: position, y1: top, y2: bottom(), stroke: '#b42318', 'stroke-width': 2 }),
          svg('text', { x: Math.max(140, Math.min(right(), position)), y: 18, 'text-anchor': position > width / 2 ? 'end' : 'start', fill: '#b42318', 'font-weight': 600 }, `${currentLabel} ${timeText}`));
        chart.setAttribute('aria-label', `全計算期間の境界別代表潮位。${currentLabel} ${(currentTime / 3600).toFixed(2)} 時間`);
      };
      button('計算時刻を表示', 'locate-fixed', () => { start = currentTime - extent / 2; clamp(); render(); });
      function render() {
        width = Math.max(300, chart.clientWidth || 560); height = Math.max(100, chart.clientHeight || 250);
        chart.setAttribute('viewBox', `0 0 ${width} ${height}`);
        chart.replaceChildren(); chart.dataset.start = start; chart.dataset.end = start + extent;
        const x = t => left + (t - start) / extent * (right() - left), y = v => top + (1 - v / limit) / 2 * (bottom() - top);
        for (let i = 0; i <= 4; i++) {
          const value = -limit + 2 * limit * i / 4, time = start + extent * i / 4;
          chart.append(svg('line', { x1: left, x2: right(), y1: y(value), y2: y(value), stroke: '#dce3e4' }),
            svg('text', { x: left - 7, y: y(value) + 4, 'text-anchor': 'end' }, limit < .01 ? value.toExponential(1) : value.toFixed(2)),
            svg('text', { x: x(time), y: height - 23, 'text-anchor': 'middle' }, (time / 86400).toFixed(2)));
        }
        chart.append(svg('text', { x: 8, y: 18 }, '潮位（m）'), svg('text', { x: width / 2, y: height - 4, 'text-anchor': 'middle' }, '計算開始からの日数（日）'));
        // Keep zoomed curves inside the plot without colliding with axis labels.
        const defs = svg('defs', {}), clip = svg('clipPath', { id: 'runTideClip' });
        clip.append(svg('rect', { x: left, y: top, width: right() - left, height: bottom() - top })); defs.append(clip); chart.append(defs);
        for (const boundary of series) {
          const [, color, dash] = styles[boundary.side];
          chart.append(svg('polyline', { 'data-side': boundary.side, points: times.map((time, i) => `${x(time)},${y(boundary.values[i])}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': dash, 'clip-path': 'url(#runTideClip)' }));
        }
        marker = svg('g', { class: 'run-tide-time-marker' }); chart.append(marker); drawMarker();
        duration.textContent = `${(start / 86400).toFixed(2)}–${((start + extent) / 86400).toFixed(2)} 日`;
      }
      let drag;
      chart.onpointerdown = event => { drag = { x: event.clientX, start }; chart.setPointerCapture(event.pointerId); };
      chart.onpointermove = event => { if (drag) { start = drag.start - (event.clientX - drag.x) / chart.getBoundingClientRect().width * extent; clamp(); render(); } };
      chart.onpointerup = chart.onpointercancel = () => { drag = undefined; };
      chart.addEventListener('wheel', event => { event.preventDefault(); zoom(event.deltaY > 0 ? 2 : .5); }, { passive: false });
      render(); panel.append(legend, tools, chart);
      chartObserver = new ResizeObserver(render); chartObserver.observe(chart);
      const note = document.createElement('p'); note.textContent = observed ? '各境界の水域セル平均。実測時系列の補正を含みます。MDT・高度な地点残差補正は別です。' : '各境界の水域セル平均。MDT・潮位補正は含みません。'; panel.append(note);
      if (analysis.truncated) { const warning = document.createElement('p'); warning.className = 'tide-info-warning'; warning.textContent = '潮汐データが全計算期間をカバーしていません。データのある期間のみ表示します。'; panel.append(warning); }
    } catch (error) { const note = document.createElement('p'); note.textContent = error.message; panel.append(note); }
  };
  update.setTime = (seconds, label = '計算時刻') => {
    currentTime = Number.isFinite(seconds) ? seconds : 0; currentLabel = label; drawMarker?.();
  };
  return update;
}
