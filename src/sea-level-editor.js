import { seedBoundary } from './boundary-initial.js';

const names = { west: '西', east: '東', south: '南', north: '北' };
const selectedTargets = new Map();
export function boundarySeaLevels(config, fields, side) {
  const boundary = config.boundary[side], vertical = ['west', 'east'].includes(side);
  return Array.from({ length: vertical ? fields.ny : fields.nx }, (_, q) => {
    const cell = side === 'west' ? q * fields.nx : side === 'east' ? q * fields.nx + fields.nx - 1 : side === 'south' ? q : (fields.ny - 1) * fields.nx + q;
    return { q, cell, value: boundary.fromInitial ? fields.zeta[cell] : boundary.painted?.zeta?.[0]?.[q] ?? boundary.zeta };
  }).filter(point => fields.mask[point.cell]);
}

export function changeBoundarySeaLevel(config, fields, side, target, cm) {
  const boundary = config.boundary[side], points = boundarySeaLevels(config, fields, side);
  if (['closed', 'periodic'].includes(boundary.mode) || !points.length) throw new Error('海面高度を指定できる水域の境界がありません。');
  if (!Number.isFinite(cm)) throw new Error('海面高度を数値で入力してください。');
  if (target !== 'mean' && !points.some(point => point.q === Number(target))) throw new Error('編集する水域セルを選択してください。');
  const mean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const edited = points.map(point => ({ ...point, value: target === 'mean' ? point.value + cm / 100 - mean : point.q === Number(target) ? cm / 100 : point.value }));
  if (edited.some(point => !Number.isFinite(point.value) || Math.abs(point.value) > 20)) throw new Error('海面高度は各セルで−2000〜2000 cmの範囲にしてください。');
  if (boundary.fromInitial) seedBoundary(config, fields, side);
  boundary.painted ??= {};
  boundary.painted.zeta = [{ ...boundary.painted.zeta?.[0], ...Object.fromEntries(edited.map(point => [point.q, point.value])) }];
  boundary.zeta = edited.reduce((sum, point) => sum + point.value, 0) / edited.length;
  boundary.fromInitial = false;
}

export function bindSeaLevelEditor(config, fields, { side, commit, boundaryHistory, onError, isBusy }) {
  const root = document.getElementById('seaLevelEditor'); if (!root) return;
  const points = boundarySeaLevels(config, fields, side), boundary = config.boundary[side];
  root.innerHTML = '<h3></h3><output class="sea-level-summary"></output><svg class="sea-level-profile" viewBox="0 0 300 150" role="img" aria-label="選択境界の海面高度分布"></svg><label class="field"><span>編集する範囲</span><select id="seaLevelTarget" aria-label="海面高度を編集する範囲"></select></label><label class="field"><span>海面高度（cm）</span><input id="seaLevelValue" aria-label="境界の海面高度（cm）" type="number" min="-2000" max="2000" step="any"></label><label class="field"><span>現在値からの補正（cm）</span><input id="seaLevelOffset" aria-label="海面高度の補正（cm）" type="range" min="-100" max="100" value="0" step="1"></label><p class="source-note">潮汐を含まない境界値です。平均値の編集はセル間の差を維持します。手動変更すると、この境界の「初期場から設定」を解除します。初期場・他の境界は変更しません。</p>';
  root.querySelector('h3').textContent = `${names[side]}境界の海面高度`;
  const target = root.querySelector('select'), input = root.querySelector('[type=number]'), slider = root.querySelector('[type=range]'), summary = root.querySelector('output'), chart = root.querySelector('svg');
  const tools = document.createElement('div'); tools.id = 'seaLevelEditTools'; tools.className = 'sea-level-edit-tools';
  const title = document.createElement('strong'); title.textContent = '海面高度の編集'; tools.append(title);
  for (const element of [...root.querySelectorAll('label'), root.querySelector('.source-note')]) tools.append(element);
  root.append(tools);
  if (!points.length || ['closed', 'periodic'].includes(boundary.mode)) {
    summary.textContent = !points.length ? '水域セルなし' : '閉鎖・周期境界では海面高度を指定しません。';
    for (const control of [target, input, slider]) control.disabled = true;
    chart.setAttribute('hidden', ''); return;
  }
  target.add(new Option('この境界の平均値', 'mean'));
  for (const point of points) target.add(new Option(`セル (${point.cell % fields.nx}, ${Math.floor(point.cell / fields.nx)})`, point.q));
  if ([...target.options].some(option => option.value === selectedTargets.get(side))) target.value = selectedTargets.get(side);
  const mean = points.reduce((sum, point) => sum + point.value, 0) / points.length;
  const current = () => (target.value === 'mean' ? mean : points.find(point => point.q === Number(target.value)).value) * 100;
  const format = value => Number(value.toFixed(4));
  function preview() {
    const value = input.valueAsNumber; if (!Number.isFinite(value)) return;
    const values = points.map(point => (target.value === 'mean' ? point.value * 100 + value - mean * 100 : point.q === Number(target.value) ? value : point.value * 100));
    const min = Math.min(...values), max = Math.max(...values), pad = Math.max(1, (max - min) * .1);
    summary.textContent = `平均 ${format(values.reduce((a, b) => a + b, 0) / values.length)} cm ／ 最小 ${format(min)} cm ／ 最大 ${format(max)} cm`;
    const ns = 'http://www.w3.org/2000/svg', node = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); if (text !== undefined) el.textContent = text; return el;
    };
    chart.replaceChildren();
    const length = ['west', 'east'].includes(side) ? fields.ny : fields.nx;
    const x = q => 48 + q / Math.max(1, length - 1) * 238, y = v => 115 - (v - min + pad) / (max - min + 2 * pad) * 85;
    for (let i = 0; i <= 2; i++) {
      const value = min - pad + (max - min + 2 * pad) * i / 2;
      chart.append(node('line', { x1: 48, x2: 286, y1: y(value), y2: y(value), stroke: '#d7e0e1' }), node('text', { x: 43, y: y(value) + 4, 'text-anchor': 'end' }, format(value)));
    }
    let path = '';
    points.forEach((point, i) => { path += `${i && point.q === points[i - 1].q + 1 ? 'L' : 'M'}${x(point.q)},${y(values[i])} `; });
    chart.append(node('path', { d: path, fill: 'none', stroke: '#0072b2', 'stroke-width': 2 }), node('text', { x: 8, y: 16 }, '海面高度（cm）'), node('text', { x: 165, y: 144, 'text-anchor': 'middle' }, `${['west', 'east'].includes(side) ? '南 → 北' : '西 → 東'}（境界セル）`));
    points.forEach((point, i) => chart.append(node('circle', { cx: x(point.q), cy: y(values[i]), r: target.value === String(point.q) ? 4 : 2.5, fill: target.value === String(point.q) ? '#ba3655' : '#0072b2' })));
  }
  target.onchange = () => { selectedTargets.set(side, target.value); input.value = format(current()); slider.value = '0'; preview(); };
  input.oninput = preview;
  slider.oninput = () => { input.value = format(current() + slider.valueAsNumber); preview(); };
  const apply = () => {
    if (isBusy()) return;
    if (Math.abs(input.valueAsNumber - current()) < 1e-8) return;
    try {
      const candidate = structuredClone(config); changeBoundarySeaLevel(candidate, fields, side, target.value, input.valueAsNumber);
      boundaryHistory(); config.boundary[side] = candidate.boundary[side]; commit();
    } catch (error) { onError(error.message); }
  };
  input.onchange = slider.onchange = apply;
  target.onchange();
}
