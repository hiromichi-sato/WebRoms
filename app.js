import { defaults, validate, buildFields, resizeLayers, interpolateAnchors, inspect, preparedData, BIO_TRACERS, SIDES, SIDE_LABELS } from './src/model.js';
import { OceanView, LABELS } from './src/view.js';
import { AreaMap } from './src/area-map.js';
import { readEtopo, readJodc, resampleBathymetry } from './src/bathymetry.js';

const $ = selector => document.querySelector(selector);
const icons = () => window.lucide.createIcons();
const storageKey = 'webroms.project.v1';
let config = defaults(), step = 0, side = 'west', mode = '3d', field = 'h', layer = 2, slice = 16, brush = 'inspect', paintDepth = 100, brushSize = 1, uniformDepth = 100;
let editVariable = 'temp', editValue = 12, editValueEnd = 18, boundaryVariable = 'temp';
let fields, errors = [], worker, results, runConfig, toastTimer, running = false;
const terrainHistory = [];
let terrainStroke;
const terrainSnapshot = () => ({ edits: { ...config.grid.edits }, dx: config.grid.dx, dy: config.grid.dy, geoBounds: config.grid.geoBounds, geoSource: config.grid.geoSource, minDepth: config.grid.minDepth, maxDepth: config.grid.maxDepth });
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved) { const base = defaults(), migrated = { ...base, ...saved, ecosystem: { ...base.ecosystem, ...saved.ecosystem, initial: { ...base.ecosystem.initial, ...saved.ecosystem?.initial } }, numerics: { ...base.numerics, ...saved.numerics }, boundary: Object.fromEntries(SIDES.map(side => [side, { ...base.boundary[side], ...saved.boundary?.[side], layers: (saved.boundary?.[side]?.layers ?? base.boundary[side].layers).map(layer => ({ ...base.boundary[side].layers[0], ...layer })) }])) }; if (!validate(migrated).length) config = migrated; } } catch {}
layer = config.grid.nz - 1;
const get = path => path.split('.').reduce((value, key) => value[key], config);
const set = (path, value) => { const keys = path.split('.'); const key = keys.pop(); keys.reduce((value, k) => value[k], config)[key] = value; };
const number = (path, label, min, max, increment = 1, unit = '') => '<label class="field"><span>' + label + '<small>' + unit + '</small></span><input data-path="' + path + '" aria-label="' + label + '" type="number" value="' + get(path) + '" min="' + min + '" max="' + max + '" step="' + increment + '"></label>';
const select = (path, label, options) => '<label class="field"><span>' + label + '</span><select data-path="' + path + '" aria-label="' + label + '">' + Object.entries(options).map(([value, text]) => '<option value="' + value + '"' + (get(path) === value ? ' selected' : '') + '>' + text + '</option>').join('') + '</select></label>';
const group = (title, content, cls = '') => '<fieldset class="form-group ' + cls + '"><legend>' + title + '</legend>' + content + '</fieldset>';
const pair = (...content) => '<div class="fields">' + content.join('') + '</div>';
const VALUE_UNITS = { h: 'm', temp: '°C', salt: 'PSU', zeta: 'm', u: 'm/s', v: 'm/s', ...Object.fromEntries(BIO_TRACERS.map(({ key, unit }) => [key, unit])) };
const VALUE_LABELS = { h: '水深', temp: '水温', salt: '塩分', zeta: '海面高度', u: '東向き流速 U', v: '北向き流速 V', ...Object.fromEntries(BIO_TRACERS.map(({ key, label }) => [key, label])) };
function formatValue(value, key) { return Number.isFinite(value) ? `${Number(value.toPrecision(4))} ${VALUE_UNITS[key] ?? ''}`.trim() : '—'; }
function displayCellValue(key, p, k = layer) {
  const size = fields.nx * fields.ny;
  if (key === 'h' || key === 'zeta') return fields[key][p];
  if (key === 'u' || key === 'v') {
    const nx = fields.nx, ny = fields.ny, i = p % nx, j = Math.floor(p / nx);
    const faces = key === 'u' ? fields.u : fields.v, length = key === 'u' ? (nx - 1) * ny : nx * (ny - 1);
    const indexes = key === 'u' ? [i > 0 ? j * (nx - 1) + i - 1 : -1, i < nx - 1 ? j * (nx - 1) + i : -1] : [j > 0 ? (j - 1) * nx + i : -1, j < ny - 1 ? j * nx + i : -1];
    const values = indexes.filter(index => index >= 0).map(index => faces[k * length + index]);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  const source = fields.biology?.[key] ?? fields[key];
  return source?.[k * size + p];
}
function updateEditStatus() {
  const box = $('#editStatus'); if (!box) return;
  const editor = $('#editValue');
  if (editor) {
    const key = step === 2 ? boundaryVariable : editVariable;
    editor.previousElementSibling.textContent = `塗る値 (${VALUE_UNITS[key] ?? ''})`;
  }
  if (step === 0) {
    const labels = { inspect: '参照', dig: `掘る ${paintDepth} m/回`, fill: `盛る ${paintDepth} m/回`, land: '陸地にする', water: `水域にする ${paintDepth} m` };
    box.textContent = brush === 'inspect' ? '参照モード' : `地形編集 · ${labels[brush]} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
    box.hidden = brush === 'inspect'; return;
  }
  if (step === 1) box.textContent = `初期条件 · ${VALUE_LABELS[editVariable]} · ${layer === fields.nz - 1 ? '表層' : layer === 0 ? '底層' : `${fields.nz - layer}層`} · 塗布値 ${formatValue(editValue, editVariable)} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
  else if (step === 2) box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · ${layer === fields.nz - 1 ? '表層' : layer === 0 ? '底層' : `${fields.nz - layer}層`} · 塗布値 ${formatValue(editValue, boundaryVariable)} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
  else { box.hidden = true; return; }
  if (step === 2 && !['specified', 'radiation'].includes(config.boundary[side].mode)) box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · ${config.boundary[side].mode === 'closed' ? '閉鎖' : '周期'} · 参照`;
  box.hidden = false;
}
function inspectCell(p) {
  const i = p % fields.nx, j = Math.floor(p / fields.nx), parts = [`i=${i}`, `j=${j}`, fields.mask[p] ? `水深 ${formatValue(fields.h[p], 'h')}` : '陸域'];
  if (fields.mask[p]) {
    const key = step === 1 ? editVariable : step === 2 ? boundaryVariable : field;
    if (step === 2) {
      const onSide = side === 'west' ? i === 0 : side === 'east' ? i === fields.nx - 1 : side === 'south' ? j === 0 : j === fields.ny - 1;
      if (onSide) {
        const along = side === 'west' || side === 'east' ? j : i, b = config.boundary[side];
        const value = b.painted?.[key]?.[layer]?.[along] ?? b.layers[layer]?.[key] ?? b[key];
        parts.push(`境界 ${VALUE_LABELS[key]} ${formatValue(value, key)}`);
      }
    } else parts.push(`${VALUE_LABELS[key]} ${formatValue(displayCellValue(key, p, key === 'zeta' ? 0 : layer), key)}`);
  }
  $('#hoverValue').textContent = parts.join('  ·  ');
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function saveLocal() {
  if (errors.length) return;
  try { localStorage.setItem(storageKey, JSON.stringify(config)); $('#saveStatus').textContent = 'ブラウザに保存済み'; }
  catch { $('#saveStatus').textContent = '自動保存できません'; }
}
function download(name, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, (_, item) => ArrayBuffer.isView(item) ? Array.from(item) : item, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const view = new OceanView($('#threeView'), $('#mapCanvas'), (p, paint, release, hitLayer) => {
  if (p === null) { terrainStroke = undefined; return; }
  if (!fields) return;
  if (step === 2 && Number.isInteger(hitLayer)) { layer = hitLayer; $('#boundaryLayer').value = String(layer); updateEditStatus(); }
  inspectCell(p);
  if (!paint || running || errors.length) return;
  if (step === 0 && brush !== 'inspect') paintTerrain(p);
  if (step === 1) paintInitial(p);
  if (step === 2 && ['specified', 'radiation'].includes(config.boundary[side].mode)) paintBoundary(p);
  inspectCell(p);
});
const areaMap = new AreaMap($('#areaMap'), bounds => {
  for (const [key, value] of Object.entries({ areaWest: bounds.west, areaEast: bounds.east, areaSouth: bounds.south, areaNorth: bounds.north })) $('#' + key).value = value.toFixed(4);
  updateTerrainImportState();
});
let selectedTerrainFile;
function currentAreaBounds() { return { west: $('#areaWest').valueAsNumber, east: $('#areaEast').valueAsNumber, south: $('#areaSouth').valueAsNumber, north: $('#areaNorth').valueAsNumber }; }
function updateTerrainImportState() {
  const b = currentAreaBounds(), valid = [b.west, b.east, b.south, b.north].every(Number.isFinite) && b.west >= -180 && b.east <= 180 && b.west < b.east && b.south >= -85 && b.north <= 85 && b.south < b.north;
  const isJodc = $('#terrainSource').value === 'jodc';
  $('#etopoLink').hidden = isJodc; $('#jodcLink').hidden = !isJodc;
  $('#sourceHelp').textContent = isJodc ? 'JODC地図で同じ範囲の500mメッシュを選択し、申請後に取得したテキストを読み込みます。' : 'NOAA Grid ExtractでETOPO 2022 BedrockのGeoTIFFを取得し、ここで読み込みます。';
  $('#applyTerrain').disabled = !selectedTerrainFile || !valid;
}
function openTerrainDialog() {
  const b = config.grid.geoBounds || { west: 137, east: 138, south: 34.5, north: 35.5 };
  for (const [key, value] of Object.entries({ areaWest: b.west, areaEast: b.east, areaSouth: b.south, areaNorth: b.north })) $('#' + key).value = value;
  areaMap.setBounds(b); $('#terrainDialog').showModal(); requestAnimationFrame(() => areaMap.draw()); updateTerrainImportState();
}
function paintTerrain(p) {
  if (!terrainStroke) { terrainStroke = terrainSnapshot(); terrainHistory.push(terrainStroke); if (terrainHistory.length > 100) terrainHistory.shift(); }
  const { nx, ny, minDepth, maxDepth } = config.grid, ci = p % nx, cj = Math.floor(p / nx);
  let changed = false;
  for (let j = Math.max(0, cj - brushSize + 1); j < Math.min(ny, cj + brushSize); j++) for (let i = Math.max(0, ci - brushSize + 1); i < Math.min(nx, ci + brushSize); i++) {
    if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) >= brushSize) continue;
    const cell = j * nx + i, current = Object.hasOwn(config.grid.edits, cell) ? config.grid.edits[cell] : fields.h[cell];
    const depth = brush === 'land' ? 0 : brush === 'water' ? Math.max(1, Math.min(maxDepth, paintDepth)) : brush === 'dig' ? Math.max(minDepth, Math.min(maxDepth, current + paintDepth)) : Math.max(0, current - paintDepth);
    if (current === depth) continue;
    config.grid.edits[cell] = depth; changed = true;
  }
  if (changed) refresh();
}
function paintInitial(p) {
  const g = config.grid, key = editVariable, k = ['zeta'].includes(key) ? 0 : layer;
  config.initial.painted ??= {}; config.initial.painted[key] ??= []; config.initial.painted[key][k] ??= {};
  for (let j = Math.max(0, Math.floor(p / g.nx) - brushSize + 1); j < Math.min(g.ny, Math.floor(p / g.nx) + brushSize); j++) for (let i = Math.max(0, p % g.nx - brushSize + 1); i < Math.min(g.nx, p % g.nx + brushSize); i++) {
    if (Math.max(Math.abs(i - p % g.nx), Math.abs(j - Math.floor(p / g.nx))) >= brushSize) continue;
    const cell = j * g.nx + i; if (fields.mask[cell]) config.initial.painted[key][k][cell] = editValue;
  }
  refresh();
}
function paintBoundary(p) {
  if (!Number.isFinite(editValue)) return;
  if (!fields.mask[p]) { toast('このセルは陸域です。海底地形で水域に変更するか、水域のある境界面を選択してください。'); return; }
  const g = config.grid, b = config.boundary[side], k = layer;
  const iAt = p % g.nx, jAt = Math.floor(p / g.nx);
  if ((side === 'west' && iAt !== 0) || (side === 'east' && iAt !== g.nx - 1) || (side === 'south' && jAt !== 0) || (side === 'north' && jAt !== g.ny - 1)) return;
  const ci = side === 'west' ? 0 : side === 'east' ? g.nx - 1 : p % g.nx;
  const cj = side === 'south' ? 0 : side === 'north' ? g.ny - 1 : Math.floor(p / g.nx);
  const along = side === 'west' || side === 'east' ? cj : ci;
  const length = side === 'west' || side === 'east' ? g.ny : g.nx;
  b.painted ??= {}; b.painted[boundaryVariable] ??= [];
  for (let kk = Math.max(0, k - brushSize + 1); kk < Math.min(g.nz, k + brushSize); kk++) {
    b.painted[boundaryVariable][kk] ??= {};
    for (let q = Math.max(0, along - brushSize + 1); q < Math.min(length, along + brushSize); q++) {
      const cell = side === 'west' ? q * g.nx : side === 'east' ? q * g.nx + g.nx - 1 : side === 'south' ? q : (g.ny - 1) * g.nx + q;
      if (!fields.mask[cell]) continue;
      if (Math.max(Math.abs(kk - k), Math.abs(q - along)) < brushSize) b.painted[boundaryVariable][kk][q] = editValue;
    }
  }
  refresh();
}
function interpolateProfile(anchors) {
  const k = layer, value = Number($('#editValue')?.value);
  if (Number.isFinite(value)) anchors[k] = value;
  return interpolateAnchors(anchors, config.grid.nz, () => value);
}
if (!view.renderer) { mode = 'map'; toast('3D表示を開始できないため平面表示に切り替えました。'); document.querySelector('[data-view="3d"]').disabled = true; }
function renderForm() {
  const g = config.grid;
  const titles = ['海底地形', '初期条件', '境界条件', '定常計算'];
  $('#stepTitle').textContent = titles[step]; $('#stepNumber').textContent = String(step + 1).padStart(2, '0') + ' / 04';
  document.querySelectorAll('[data-step]').forEach(button => { if (+button.dataset.step === step) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
  let html = '';
  if (step === 0) {
    html = group('計算格子', pair(number('grid.nx', 'X格子数', 8, 100), number('grid.ny', 'Y格子数', 8, 100)) + pair(number('grid.dx', 'X格子間隔', 10, 100000, 100, 'm'), number('grid.dy', 'Y格子間隔', 10, 100000, 100, 'm')) + number('grid.nz', '鉛直層数', 2, 10));
    html += group('地形', select('grid.preset', '地形の種類', { bay: '湾', island: '島', channel: '水路', open: '外洋' }) + pair(number('grid.minDepth', '最小水深', 1, 10000, 10, 'm'), number('grid.maxDepth', '最大水深', 1, 10000, 10, 'm')));
    html += '<button type="button" id="openTerrainDialog"><i data-lucide="map-pin"></i>地図から地形を生成</button>';
    html += group('ブロック地形編集', '<label class="field"><span>ツール</span><select id="brush"><option value="inspect">参照</option><option value="dig">掘る</option><option value="fill">盛る</option><option value="land">陸地にする</option><option value="water">水域にする</option></select></label><label class="field"><span>ブラシ範囲</span><select id="brushSize"><option value="1">1 × 1</option><option value="2">3 × 3</option><option value="3">5 × 5</option><option value="4">7 × 7</option><option value="5">9 × 9</option></select></label><label class="field"><span>水深変化量<small>m / 回</small></span><input id="paintDepth" type="number" min="1" max="10000" step="1" value="' + paintDepth + '"></label><label class="field"><span>統一する水深<small>m</small></span><input id="uniformDepth" type="number" min="' + g.minDepth + '" max="' + g.maxDepth + '" value="' + uniformDepth + '"></label><button type="button" id="setUniformDepth"><i data-lucide="equal"></i>全水域の水深を統一</button><button type="button" id="undoTerrain" title="地形の編集を戻す"><i data-lucide="undo-2"></i>一手戻す</button><p class="terrain-hint">平面図・3D地形をドラッグして格子を編集。参照に戻すと視点を回せます。</p>');
  } else if (step === 1) {
    html = group('水温・塩分', select('initial.distribution', '初期分布', { uniform: '一様', stratified: '鉛直成層', gradient: '鉛直成層 + 東西勾配' }) + pair(number('initial.tempSurface', '表面水温', -5, 45, 0.1, '°C'), number('initial.tempBottom', '底面水温', -5, 45, 0.1, '°C')) + pair(number('initial.saltSurface', '表面塩分', 0, 50, 0.1), number('initial.saltBottom', '底面塩分', 0, 50, 0.1)) + number('initial.tempGradient', '東端 − 西端 水温差', -20, 20, 0.1, '°C'));
    html += group('水位・流速', number('initial.zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number('initial.u', '東向き流速 U', -10, 10, 0.01, 'm/s'), number('initial.v', '北向き流速 V', -10, 10, 0.01, 'm/s')));
    html += group('生態系モデル', select('ecosystem.enabled', '生態系', { false: 'なし', true: 'あり: Fennel' }), 'run-form');
    if (config.ecosystem.enabled) html += group('生態系の概念図', '<div class="eco-flow"><button type="button" data-eco-node="NO3">硝酸塩<br><small>NO3</small></button><span>→</span><button type="button" data-eco-node="phytoplankton">植物プランクトン<br><small>Phyt</small></button><span>→</span><button type="button" data-eco-node="zooplankton">動物プランクトン<br><small>Zoop</small></button><span>→</span><button type="button" data-eco-node="SDeN">小型デトリタス<br><small>SDeN</small></button><span>→</span><button type="button" data-eco-node="LDeN">大型デトリタス<br><small>LDeN</small></button></div><div class="eco-flow eco-secondary"><button type="button" data-eco-node="NH4">アンモニウム (NH4)</button><span>→ 硝化・再生 →</span><button type="button" data-eco-node="chlorophyll">クロロフィル (Chlo)</button></div><div id="ecoEquation" class="eco-equation">概念図の変数を選ぶと、対応する状態量と式を確認できます。</div>', 'eco-panel');
    if (config.ecosystem.enabled) html += group('選択した変数の初期濃度', BIO_TRACERS.map(({ key, label, unit }) => '<label class="field eco-value" data-eco-value="' + key + '"><span>' + label + '<small>' + unit + '</small></span><input data-path="ecosystem.initial.' + key + '" aria-label="初期' + label + '" type="number" min="0" max="10000" step="0.01" value="' + config.ecosystem.initial[key] + '"></label>').join(''));
    const paintOptions = [['temp', '水温'], ['salt', '塩分'], ['zeta', '海面高度'], ['u', '東向き流速 U'], ['v', '北向き流速 V'], ...(config.ecosystem.enabled ? BIO_TRACERS.map(({ key, label }) => [key, label]) : [])];
    html += group('初期場を格子に塗る', '<label class="field"><span>変数</span><select id="editVariable">' + paintOptions.map(([key, label]) => '<option value="' + key + '"' + (editVariable === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label><div class="fields"><label class="field"><span>層</span><select id="editLayer">' + Array.from({ length: g.nz }, (_, k) => '<option value="' + (g.nz - 1 - k) + '"' + (layer === g.nz - 1 - k ? ' selected' : '') + '>' + (k === 0 ? '表層' : k === g.nz - 1 ? '底層' : '第' + (k + 1) + '層') + '</option>').join('') + '</select></label><label class="field"><span>塗る値</span><input id="editValue" type="number" step="0.01" value="' + editValue + '"></label></div><label class="field"><span>ブラシ範囲</span><select id="editBrushSize">' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (brushSize === n ? ' selected' : '') + '>' + (n * 2 - 1) + ' × ' + (n * 2 - 1) + '</option>').join('') + '</select></label><div class="fields"><button type="button" id="initialInterpolate">層プロファイルを補完</button><button type="button" id="initialGradient">西端→東端の勾配</button></div><label class="field"><span>勾配の東端値</span><input id="editValueEnd" type="number" step="0.01" value="' + editValueEnd + '"></label><p class="terrain-hint">平面図または3D地形をドラッグして塗ります。</p>');
  } else if (step === 2) {
    const b = config.boundary[side], prefix = 'boundary.' + side + '.';
    const rows = [...b.layers].reverse().map((value, k) => '<tr><th scope="row">' + (k + 1) + '</th>' + ['temp', 'salt', 'u', 'v'].map(key => '<td><input data-path="' + prefix + 'layers.' + (g.nz - 1 - k) + '.' + key + '" aria-label="' + SIDE_LABELS[side] + ' 第' + (k + 1) + '層 ' + key + '" type="number" step="0.01" value="' + value[key] + '"' + (!['specified', 'radiation'].includes(b.mode) ? ' disabled' : '') + '></td>').join('') + '</tr>').join('');
    html = group('側面境界', '<label class="field"><span>境界面</span><select id="boundarySide">' + SIDES.map(key => '<option value="' + key + '"' + (side === key ? ' selected' : '') + '>' + SIDE_LABELS[key] + '</option>').join('') + '</select></label>' + select(prefix + 'mode', '境界形式', { closed: '閉鎖', specified: '値を指定（Clamped）', radiation: '放射（Radiation）', periodic: '周期（対向面と同時）' }) + number(prefix + 'zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number(prefix + 'ubar', '鉛直平均 Ubar', -10, 10, 0.01, 'm/s'), number(prefix + 'vbar', '鉛直平均 Vbar', -10, 10, 0.01, 'm/s')) + '<table class="boundary-table"><caption>各層の境界値（第1層：表層）</caption><thead><tr><th>層</th><th>°C</th><th>塩分</th><th>U m/s</th><th>V m/s</th></tr></thead><tbody>' + rows + '</tbody></table>' + (config.ecosystem.enabled ? '<table class="boundary-table"><caption>Fennel 生物濃度（層別）</caption><thead><tr><th>層</th>' + BIO_TRACERS.map(({ key, label }) => '<th>' + label + '</th>').join('') + '</tr></thead><tbody>' + [...b.layers].reverse().map((value, k) => '<tr><th>' + (k + 1) + '</th>' + BIO_TRACERS.map(({ key, label }) => '<td><input data-path="' + prefix + 'layers.' + (g.nz - 1 - k) + '.' + key + '" aria-label="' + SIDE_LABELS[side] + ' 第' + (k + 1) + '層 ' + label + '" type="number" min="0" step="0.01" value="' + value[key] + '"' + (b.mode !== 'specified' ? ' disabled' : '') + '></td>').join('') + '</tr>').join('') + '</tbody></table>' : '') + '<label class="field"><span>境界値を塗る項目</span><select id="boundaryVariable">' + [['temp', '水温'], ['salt', '塩分'], ['u', '東向きU'], ['v', '北向きV'], ...(config.ecosystem.enabled ? BIO_TRACERS.map(({ key, label }) => [key, label]) : [])].map(([key, label]) => '<option value="' + key + '"' + (boundaryVariable === key ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label><div class="fields"><label class="field"><span>編集層</span><select id="boundaryLayer">' + Array.from({ length: g.nz }, (_, k) => '<option value="' + (g.nz - 1 - k) + '"' + (layer === g.nz - 1 - k ? ' selected' : '') + '>' + (k === 0 ? '表層' : k === g.nz - 1 ? '底層' : '第' + (k + 1) + '層') + '</option>').join('') + '</select></label><label class="field"><span>塗る値</span><input id="editValue" type="number" step="0.01" value="' + editValue + '"></label></div><label class="field"><span>ブラシ範囲</span><select id="boundaryBrushSize">' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (brushSize === n ? ' selected' : '') + '>' + (n * 2 - 1) + ' × ' + (n * 2 - 1) + '</option>').join('') + '</select></label><div class="fields"><button type="button" id="boundaryInterpolate">層プロファイルを補完</button><button type="button" id="boundaryGradient">辺方向の勾配</button></div><label class="field"><span>勾配の終端値</span><input id="editValueEnd" type="number" step="0.01" value="' + editValueEnd + '"></label><p class="terrain-hint">表示中の境界面をドラッグして、辺方向・層方向に塗布します。選択層は白枠、値はセル内に表示します。</p><button type="button" id="averageBoundary"><i data-lucide="equal"></i>層流速から鉛直平均を設定</button>', 'boundary-form');
  } else {
    html = group('混合・拡散', pair(number('numerics.horizontalDiffusion', '水平拡散・粘性', 0, 10000, 1, 'm²/s'), number('numerics.verticalDiffusion', '鉛直拡散・粘性', 0, 1, 0.0001, 'm²/s')));
    html += group('コリオリ力（β平面）', pair(number('numerics.coriolisF0', '基準コリオリ係数 f₀', -0.001, 0.001, 0.000001, 's⁻¹'), number('numerics.coriolisBeta', '南北勾配 β', -1e-9, 1e-9, 1e-12, 's⁻¹ m⁻¹')) + '<p class="terrain-hint">f(y) = f₀ + β(y − 中央緯度)。北向きを正とします。</p>');
    html += group('外力', pair(number('numerics.windX', '東向き風応力', -10, 10, 0.01, 'N/m²'), number('numerics.windY', '北向き風応力', -10, 10, 0.01, 'N/m²')));
    html += group('時間積分と定常判定', pair(number('numerics.dt', '時間刻み', 0.01, 600, 1, 's'), number('numerics.maxSteps', 'ステップ上限', 1, 1000000, 100)) + pair(number('numerics.tolerance', '許容残差', 1e-12, 0.1, 0.000001, 's⁻¹'), number('numerics.steadyWindow', '連続判定ステップ', 2, 10000)), 'run-form');
    if (config.ecosystem.enabled) html += '<p class="eco-runtime-warning">Fennelの実計算には生態系対応WASMが必要です。現在の配布WASMは物理モデルのみのため、再ビルド完了まで生態系ONで実行できません。</p>';
    html += '<button id="calculateButton" type="button" class="primary run-form"><i data-lucide="' + (running ? 'square' : 'play') + '"></i>' + (running ? '計算停止' : '定常計算を開始') + '</button>';
  }
  $('#settingsForm').innerHTML = html;
  document.body.dataset.step = String(step);
  if (step === 2) {
    const tables = [...document.querySelectorAll('.boundary-table')];
    const detail = document.createElement('details'); detail.className = 'boundary-baseline';
    const summary = document.createElement('summary'); summary.textContent = '層別の基準値'; detail.append(summary, ...tables);
    document.querySelector('.boundary-form').append(detail);
  }
  if (step === 0) {
    $('#brush').value = brush;
    $('#brush').onchange = event => { brush = event.target.value; draw(); };
    $('#brushSize').value = brushSize;
    $('#brushSize').onchange = event => { brushSize = Number(event.target.value); updateEditStatus(); };
    $('#openTerrainDialog').onclick = openTerrainDialog;
    $('#paintDepth').onchange = event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 1 && value <= 10000) paintDepth = value; else { event.target.value = paintDepth; toast('編集水深は1〜10000 mです。'); } updateEditStatus(); };
    $('#uniformDepth').onchange = event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= g.minDepth && value <= g.maxDepth) uniformDepth = value; else { event.target.value = uniformDepth; toast(`統一水深は${g.minDepth}〜${g.maxDepth} mで指定してください。`); } };
    $('#setUniformDepth').onclick = () => {
      const value = uniformDepth;
      if (!Number.isFinite(value) || value < g.minDepth || value > g.maxDepth) { toast(`統一水深は${g.minDepth}〜${g.maxDepth} mで指定してください。`); return; }
      const before = terrainSnapshot(), updated = { ...g.edits };
      for (let p = 0; p < fields.mask.length; p++) if (fields.mask[p]) updated[p] = value;
      if (JSON.stringify(before) === JSON.stringify(updated)) { toast('すでに指定した水深で統一されています。'); return; }
      terrainHistory.push(before); if (terrainHistory.length > 100) terrainHistory.shift();
      config.grid.edits = updated; refresh(); toast(`全水域を水深 ${value} m に統一しました。`);
    };
    $('#undoTerrain').onclick = () => {
      if (!terrainHistory.length) return;
      const previous = terrainHistory.pop(); config.grid.edits = previous.edits; config.grid.dx = previous.dx; config.grid.dy = previous.dy; config.grid.geoBounds = previous.geoBounds; config.grid.geoSource = previous.geoSource; config.grid.minDepth = previous.minDepth; config.grid.maxDepth = previous.maxDepth; renderForm(); refresh();
    };
  }
  if (step === 1) {
    document.querySelector('[data-path="initial.tempBottom"]').disabled = config.initial.distribution === 'uniform';
    document.querySelector('[data-path="initial.saltBottom"]').disabled = config.initial.distribution === 'uniform';
    document.querySelector('[data-path="initial.tempGradient"]').disabled = config.initial.distribution !== 'gradient';
    $('#editVariable').onchange = event => { editVariable = event.target.value; field = ['u', 'v'].includes(editVariable) ? 'temp' : editVariable; draw(); };
    $('#editLayer').onchange = event => { layer = Number(event.target.value); draw(); };
    $('#editValue').oninput = event => { editValue = event.target.valueAsNumber; updateEditStatus(); };
    $('#editValueEnd').oninput = event => { editValueEnd = event.target.valueAsNumber; updateEditStatus(); };
    $('#editBrushSize').onchange = event => { brushSize = Number(event.target.value); updateEditStatus(); };
    $('#initialInterpolate').onclick = () => {
      const key = editVariable;
      config.initial.anchors ??= {}; config.initial.anchors[key] ??= {};
      config.initial.anchors[key][layer] = editValue;
      const baseline = key === 'temp' ? [config.initial.tempBottom, config.initial.tempSurface] : key === 'salt' ? [config.initial.saltBottom, config.initial.saltSurface] : [config.ecosystem.initial[key] ?? config.initial[key] ?? editValue, config.ecosystem.initial[key] ?? config.initial[key] ?? editValue];
      config.initial.anchors[key][0] ??= baseline[0]; config.initial.anchors[key][g.nz - 1] ??= baseline[1];
      const profile = interpolateAnchors(config.initial.anchors[key], g.nz, k => baseline[0] + (baseline[1] - baseline[0]) * k / Math.max(1, g.nz - 1));
      config.initial.anchors[key] = Object.fromEntries(profile.map((value, k) => [k, value]));
      refresh(); toast('鉛直プロファイルを補完しました。');
    };
    $('#initialGradient').onclick = () => {
      if (!Number.isFinite(editValue) || !Number.isFinite(editValueEnd)) return;
      const g = config.grid, k = editVariable === 'zeta' ? 0 : layer; config.initial.painted ??= {}; config.initial.painted[editVariable] ??= []; config.initial.painted[editVariable][k] ??= {};
      for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const p = j * g.nx + i; if (fields.mask[p]) config.initial.painted[editVariable][k][p] = editValue + (editValueEnd - editValue) * i / (g.nx - 1); }
      refresh(); toast('選択項目に西端から東端への勾配を設定しました。');
    };
    const equations = { NO3: 'dNO3/dt = 硝化(NH4) − 植物プランクトンのNO3取り込み + 輸送・拡散', NH4: 'dNH4/dt = 有機物の再無機化 − 硝化(NH4) − 植物プランクトンのNH4取り込み + 輸送・拡散', phytoplankton: 'dPhyt/dt = 光・温度依存成長(NO3,NH4) − 摂食・死亡・凝集 + 輸送・拡散', zooplankton: 'dZoop/dt = 摂食効率 × 摂食(Phyt) − 代謝・死亡 + 輸送・拡散', LDeN: 'dLDeN/dt = 沈降・凝集 − 再無機化 + 輸送・拡散', SDeN: 'dSDeN/dt = 死亡・排泄 − 凝集・再無機化 + 輸送・拡散', chlorophyll: 'dChlo/dt = 植物プランクトン成長に伴う色素生成 − 色素損失 + 輸送・拡散' };
    document.querySelectorAll('[data-eco-node]').forEach(button => button.onclick = () => { document.querySelectorAll('[data-eco-node]').forEach(node => node.setAttribute('aria-pressed', String(node === button))); document.querySelectorAll('[data-eco-value]').forEach(row => row.classList.toggle('eco-selected', row.dataset.ecoValue === button.dataset.ecoNode)); $('#ecoEquation').textContent = equations[button.dataset.ecoNode]; });
    document.querySelector('[data-eco-node="NO3"]')?.click();
  }
  if (step === 2) {
    const b = config.boundary[side];
    for (const id of ['editValue', 'editValueEnd', 'boundaryBrushSize', 'boundaryGradient', 'boundaryInterpolate']) $('#' + id).disabled = !['specified', 'radiation'].includes(b.mode);
    $('#boundarySide').onchange = event => { side = event.target.value; renderForm(); draw(); };
    $('#boundaryVariable').onchange = event => { boundaryVariable = event.target.value; field = ['u', 'v'].includes(boundaryVariable) ? 'temp' : boundaryVariable; draw(); };
    $('#boundaryLayer').onchange = event => { layer = Number(event.target.value); draw(); };
    $('#boundaryBrushSize').onchange = event => { brushSize = Number(event.target.value); updateEditStatus(); };
    $('#editValue').oninput = event => { editValue = event.target.valueAsNumber; updateEditStatus(); };
    $('#editValueEnd').oninput = event => { editValueEnd = event.target.valueAsNumber; updateEditStatus(); };
    $('#boundaryGradient').onclick = () => {
      if (!['specified', 'radiation'].includes(b.mode) || !Number.isFinite(editValue) || !Number.isFinite(editValueEnd)) return;
      const length = side === 'west' || side === 'east' ? g.ny : g.nx;
      b.painted ??= {}; b.painted[boundaryVariable] ??= []; b.painted[boundaryVariable][layer] ??= {};
      for (let q = 0; q < length; q++) b.painted[boundaryVariable][layer][q] = editValue + (editValueEnd - editValue) * q / Math.max(1, length - 1);
      refresh(); toast('選択境界に辺方向の勾配を設定しました。');
    };
    $('#boundaryInterpolate').onclick = () => {
      if (!['specified', 'radiation'].includes(b.mode) || !Number.isFinite(editValue)) return;
      const b = config.boundary[side], key = boundaryVariable; b.anchors ??= {}; b.anchors[key] ??= {};
      b.anchors[key][layer] = editValue; b.anchors[key][0] ??= b.layers[0][key]; b.anchors[key][g.nz - 1] ??= b.layers[g.nz - 1][key];
      const profile = interpolateAnchors(b.anchors[key], g.nz, k => b.layers[k][key]);
      b.layers.forEach((item, k) => { item[key] = profile[k]; });
      refresh(); renderForm(); toast('選択境界の鉛直プロファイルを補完しました。');
    };
    for (const key of ['zeta', 'ubar', 'vbar']) document.querySelector('[data-path="boundary.' + side + '.' + key + '"]').disabled = !['specified', 'radiation'].includes(config.boundary[side].mode);
    $('#averageBoundary').disabled = !['specified', 'radiation'].includes(config.boundary[side].mode);
    $('#averageBoundary').onclick = () => { const b = config.boundary[side]; b.ubar = b.layers.reduce((a, l) => a + l.u, 0) / g.nz; b.vbar = b.layers.reduce((a, l) => a + l.v, 0) / g.nz; renderForm(); refresh(); };
  }
  if (step === 3) $('#calculateButton').onclick = startOrStop;
  if (running) document.querySelectorAll('#settingsForm input, #settingsForm select').forEach(input => input.disabled = true);
  $('#previousButton').disabled = step === 0 || running;
  $('#nextButton').hidden = step === 3; $('#nextButton').textContent = (titles[step + 1] || '') + 'へ';
  $('#computation').hidden = step !== 3 && !results;
  icons(); updateActions();
}
function updateActions() {
  for (const id of ['saveButton', 'exportButton']) $('#' + id).disabled = errors.length > 0;
  $('#nextButton').disabled = errors.length > 0 || running;
  for (const id of ['importButton', 'resetButton', 'projectName']) $('#' + id).disabled = running;
  document.querySelectorAll('[data-step]').forEach(button => button.disabled = running);
  if ($('#calculateButton')) $('#calculateButton').disabled = (errors.length > 0 || config.ecosystem.enabled) && !running;
}
function draw() {
  if (!fields) return;
  $('#hoverValue').textContent = 'セル未選択';
  $('#fieldSelect').querySelectorAll('[data-biology]').forEach(option => { option.hidden = !config.ecosystem.enabled; });
  if (!config.ecosystem.enabled && BIO_TRACERS.some(({ key }) => key === field)) field = 'temp';
  if (config.ecosystem.enabled && !fields.biology) fields.biology = buildFields(config).biology;
  if ($('#vectorToggle').checked && mode !== 'map') mode = 'map';
  layer = Math.max(0, Math.min(config.grid.nz - 1, layer)); slice = Math.max(0, Math.min(config.grid.ny - 1, slice));
  $('#layerSelect').innerHTML = Array.from({ length: fields.nz }, (_, i) => '<option value="' + (fields.nz - 1 - i) + '">' + (i + 1) + '層' + (i === 0 ? '（表層）' : '') + '</option>').join('');
  $('#layerSelect').value = layer; $('#layerSelect').disabled = !['temp', 'salt', ...BIO_TRACERS.map(({ key }) => key)].includes(field) && !$('#vectorToggle').checked;
  $('#fieldSelect').value = field;
  $('#sliceControl').hidden = mode !== 'section'; $('#sliceRow').max = fields.ny - 1; $('#sliceRow').value = slice; $('#sliceValue').textContent = slice;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
  view.set(fields, field, layer, mode, slice, $('#vectorToggle').checked);
  view.setEditing(!running && (step === 0 ? brush !== 'inspect' : step === 1 || (step === 2 && ['specified', 'radiation'].includes(config.boundary[side].mode))));
  view.setBoundaryEdit(step === 2 ? side : null, step === 2 ? config.boundary[side] : null, boundaryVariable);
  if ($('#boundaryNotice')) $('#boundaryNotice').hidden = step !== 2;
  $('#boundaryFaceTitle').hidden = step !== 2;
  $('#boundaryFaceTitle').textContent = step === 2 ? `${SIDE_LABELS[side]} 境界面` : '';
  document.querySelector('.view-toolbar .segmented').hidden = step === 2;
  document.querySelector('.vector-toggle').hidden = step === 2;
  document.querySelector('.scene-caption').hidden = step === 2;
  document.querySelector('.axis-label').hidden = step === 2;
  $('#sliceControl').hidden = step === 2 || mode !== 'section';
  for (const id of ['fieldSelect', 'layerSelect', 'vectorToggle', 'zoomOut', 'zoomIn', 'homeView']) $('#' + id).hidden = step === 2;
  $('#sceneTitle').textContent = LABELS[field]; $('#sceneSubtitle').textContent = results ? 'ROMS計算場' : '初期場 / 鉛直方向は強調表示';
  updateEditStatus();
}
function refresh() {
  results = undefined;
  $('#resultButton').disabled = true;
  $('#modelTime').textContent = '0 s';
  $('#iterations').textContent = '0';
  $('#residual').textContent = '—';
  $('#convergence').textContent = '未計算';
    $('#phaseText').textContent = '条件設定';
    $('#solverStatus').textContent = 'ROMS実行待ち';
  $('#runLog').textContent = '';
  errors = validate(config);
  let warnings = [];
  if (!errors.length) {
    try { fields = buildFields(config); warnings = inspect(config, fields); results = undefined; $('#resultButton').disabled = true; draw(); }
    catch (error) { errors = [error.message]; }
  }
  const validation = $('#validation'); validation.replaceChildren();
  const messages = errors.length ? errors.map(text => ['error', text]) : warnings.map(text => ['warning', text]);
  if (!messages.length) messages.push(['ok', '格子・初期条件・境界条件の形式を確認しました。']);
  for (const [type, message] of messages) { const div = document.createElement('div'); div.className = 'validation-item ' + type; const icon = document.createElement('i'); icon.dataset.lucide = type === 'ok' ? 'circle-check' : 'triangle-alert'; const text = document.createElement('span'); text.textContent = message; div.append(icon, text); validation.append(div); }
  if (fields) { $('#wetCount').textContent = fields.wetCount.toLocaleString(); $('#domainSize').textContent = ((fields.nx - 2) * fields.dx / 1000).toFixed(0) + ' × ' + ((fields.ny - 2) * fields.dy / 1000).toFixed(0) + ' km'; $('#layerMetric').textContent = fields.nz + ' 層'; $('#slopeMetric').textContent = fields.rFactor.toFixed(3); }
  $('#gridSummary').textContent = config.grid.nx + ' × ' + config.grid.ny + ' × ' + config.grid.nz;
  updateActions(); saveLocal(); icons();
}
function navigate(index) { step = index; if (step === 0) field = 'h'; if (step === 1) field = 'temp'; renderForm(); draw(); }
$('#settingsForm').onsubmit = event => event.preventDefault();
$('#settingsForm').addEventListener('change', event => {
  const path = event.target.dataset.path; if (!path || running) return;
  const value = path === 'ecosystem.enabled' ? event.target.value === 'true' : event.target.type === 'number' ? event.target.valueAsNumber : event.target.value;
  if (path === 'grid.nz' && Number.isInteger(value) && value >= 2 && value <= 10) { resizeLayers(config, value); layer = value - 1; }
  else set(path, value);
  if (['grid.nx', 'grid.ny', 'grid.preset'].includes(path)) { config.grid.edits = {}; config.grid.geoBounds = null; config.grid.geoSource = null; terrainHistory.length = 0; }
  if (path.endsWith('.mode')) { const opposite = { west: 'east', east: 'west', north: 'south', south: 'north' }[side]; if (value === 'periodic') config.boundary[opposite].mode = 'periodic'; else if (config.boundary[opposite].mode === 'periodic') config.boundary[opposite].mode = value; }
  if (['grid.nz', 'initial.distribution', 'ecosystem.enabled'].includes(path) || path.endsWith('.mode')) renderForm();
  refresh();
});
document.querySelectorAll('[data-step]').forEach(button => button.onclick = () => navigate(+button.dataset.step));
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { mode = button.dataset.view; draw(); });
$('#previousButton').onclick = () => navigate(Math.max(0, step - 1));
$('#nextButton').onclick = () => navigate(Math.min(3, step + 1));
$('#fieldSelect').onchange = event => { field = event.target.value; draw(); };
$('#layerSelect').onchange = event => { layer = +event.target.value; draw(); };
$('#vectorToggle').onchange = () => { if ($('#vectorToggle').checked) mode = 'map'; draw(); };
$('#sliceRow').oninput = event => { slice = +event.target.value; draw(); };
$('#homeView').onclick = () => view.home();
$('#zoomIn').onclick = () => { mode = 'map'; draw(); view.zoomMap(1); };
$('#zoomOut').onclick = () => { mode = 'map'; draw(); view.zoomMap(-1); };
$('#areaZoomIn').onclick = () => areaMap.changeZoom(1);
$('#areaZoomOut').onclick = () => areaMap.changeZoom(-1);
$('#mapSelectMode').onclick = () => { areaMap.setMode('select'); $('#mapSelectMode').setAttribute('aria-pressed', 'true'); $('#mapPanMode').setAttribute('aria-pressed', 'false'); };
$('#mapPanMode').onclick = () => { areaMap.setMode('pan'); $('#mapPanMode').setAttribute('aria-pressed', 'true'); $('#mapSelectMode').setAttribute('aria-pressed', 'false'); };
for (const id of ['areaWest', 'areaEast', 'areaSouth', 'areaNorth']) $('#' + id).addEventListener('change', () => {
  const b = currentAreaBounds(); updateTerrainImportState();
  if ([b.west, b.east, b.south, b.north].every(Number.isFinite) && b.west < b.east && b.south < b.north) areaMap.setBounds(b);
});
$('#terrainSource').onchange = () => { selectedTerrainFile = undefined; $('#terrainFile').value = ''; $('#terrainFileName').textContent = 'ファイル未選択'; updateTerrainImportState(); };
$('#terrainFile').onchange = event => {
  selectedTerrainFile = event.target.files[0]; $('#terrainFileName').textContent = selectedTerrainFile?.name || 'ファイル未選択'; updateTerrainImportState();
};
$('#closeTerrainDialog').onclick = () => $('#terrainDialog').close();
$('#applyTerrain').onclick = async () => {
  const button = $('#applyTerrain'), bounds = currentAreaBounds(), sourceName = $('#terrainSource').value;
  button.disabled = true; $('#terrainDialogStatus').textContent = '地形データを読み込み、格子へ補間しています…';
  try {
    const source = sourceName === 'etopo' ? await readEtopo(selectedTerrainFile) : await readJodc(selectedTerrainFile);
    const actualBounds = sourceName === 'etopo' && source.bounds ? source.bounds : bounds;
    const g = config.grid, radians = Math.PI / 180, earth = 6371008.8;
    const dx = earth * radians * (actualBounds.east - actualBounds.west) * Math.cos((actualBounds.north + actualBounds.south) / 2 * radians) / (g.nx - 1);
    const dy = earth * radians * (actualBounds.north - actualBounds.south) / (g.ny - 1);
    if (dx < 10 || dy < 10 || dx > 100000 || dy > 100000) throw new Error('選択範囲と格子数では格子間隔が設定範囲外です。範囲または格子数を調整してください。');
    const values = resampleBathymetry(source, actualBounds, g.nx, g.ny, sourceName === 'etopo'), edits = {};
    let wet = 0;
    for (let p = 0; p < values.length; p++) {
      const value = values[p], depth = Number.isFinite(value) ? sourceName === 'etopo' ? (value < 0 ? Math.min(10000, Math.max(1, -value)) : 0) : Math.min(10000, Math.max(1, value)) : 0;
      edits[p] = depth; if (depth > 0) wet++;
    }
    if (!wet) throw new Error('選択範囲に有効な水深セルがありません。地図範囲とデータファイルを確認してください。');
    const wetDepths = Object.values(edits).filter(depth => depth > 0);
    terrainHistory.push(terrainSnapshot()); if (terrainHistory.length > 100) terrainHistory.shift();
    config.grid.edits = edits; config.grid.dx = dx; config.grid.dy = dy; config.grid.geoBounds = actualBounds; config.grid.geoSource = sourceName === 'etopo' ? 'NOAA ETOPO 2022' : 'JODC J-EGG500'; config.grid.preset = 'open';
    config.grid.minDepth = Math.max(1, Math.floor(Math.min(...wetDepths))); config.grid.maxDepth = Math.min(10000, Math.ceil(Math.max(...wetDepths)));
    $('#terrainDialog').close(); mode = 'map'; field = 'h'; renderForm(); refresh(); draw();
    toast(`${sourceName === 'etopo' ? 'ETOPO 2022' : 'JODC'}から${wet.toLocaleString()}水域セルを生成しました。`);
  } catch (error) {
    $('#terrainDialogStatus').textContent = error.message; updateTerrainImportState();
  }
};
$('#projectName').value = config.name;
$('#projectName').onchange = event => { config.name = event.target.value; refresh(); };
$('#saveButton').onclick = () => { if (!errors.length) download('webroms-project.json', config); };
$('#exportButton').onclick = () => { if (!errors.length) download('webroms-arrays.json', preparedData(config, buildFields(config))); };
$('#importButton').onclick = () => $('#importFile').click();
$('#importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 5e6) throw new Error('設定ファイルは5 MB以下にしてください。'); const source = JSON.parse(await file.text()); const loaded = { ...defaults(), ...source, numerics: { ...defaults().numerics, ...source.numerics } }; const issues = validate(loaded); if (issues.length) throw new Error(issues[0]); buildFields(loaded); config = loaded; $('#projectName').value = config.name; layer = config.grid.nz - 1; terrainHistory.length = 0; navigate(0); refresh(); toast('設定を読み込みました。'); }
  catch (error) { toast('読み込めません: ' + error.message); }
  finally { event.target.value = ''; }
};
$('#resetButton').onclick = () => $('#resetDialog').showModal();
$('#cancelReset').onclick = () => $('#resetDialog').close();
$('#confirmReset').onclick = () => { config = defaults(); layer = config.grid.nz - 1; terrainHistory.length = 0; $('#projectName').value = config.name; $('#resetDialog').close(); navigate(0); refresh(); };
function finishRun(message) { running = false; worker?.terminate(); worker = undefined; $('#solverStatus').textContent = message; $('#phaseText').textContent = results?.outcome === 'converged' ? '定常判定達成' : '計算停止'; renderForm(); }
function startOrStop() {
  if (running) { if (results) results.outcome = 'cancelled'; $('#convergence').textContent = '中断'; finishRun('計算を停止しました。最後に受信した計算場を表示しています。'); return; }
  if (errors.length) return;
  if (config.ecosystem.enabled) { toast('Fennel対応WASMはまだビルドされていません。生態系を「なし」にするか、WASM再ビルド後に実行してください。'); return; }
  running = true; runConfig = structuredClone(config); results = undefined;
  $('#modelTime').textContent = '0 s'; $('#iterations').textContent = '0'; $('#residual').textContent = '—'; $('#convergence').textContent = '計算中'; $('#runLog').textContent = ''; $('#phaseText').textContent = '計算中'; $('#resultButton').disabled = true;
  renderForm(); $('#solverStatus').textContent = 'ROMS実行核を起動中';
  worker = new Worker(new URL('./runtime/roms-worker.js', import.meta.url), { type: 'module' });
  worker.onerror = event => { if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; finishRun('実行核でエラーが発生しました: ' + event.message); };
  worker.onmessage = ({ data }) => {
    if (data.type === 'status') $('#solverStatus').textContent = data.message;
    if (data.type === 'progress') {
      results = { ...data, outcome: 'running' }; fields = { ...fields, ...data.state }; $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString(); $('#residual').textContent = Number.isFinite(data.residual) ? data.residual.toExponential(2) : '—'; $('#resultButton').disabled = false; $('#solverStatus').textContent = '定常判定 ' + data.stable + ' / ' + config.numerics.steadyWindow; draw();
    }
    if (data.logs) $('#runLog').textContent = data.logs.join('\n');
    if (data.type === 'complete') { if (results) results.outcome = data.converged ? 'converged' : 'step-limit'; $('#convergence').textContent = data.converged ? '定常判定達成' : '上限到達'; finishRun(data.converged ? '連続判定区間で許容残差を満たしました。' : 'ステップ上限に到達しました。定常判定は未達です。'); }
    if (data.type === 'error') { if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; finishRun(data.message); }
  };
  worker.postMessage({ type: 'run', config: runConfig });
}
$('#resultButton').onclick = () => { if (results) download('webroms-results.json', { format: 'webroms-results', config: runConfig, ...results }); };
renderForm(); refresh(); view.resize();
