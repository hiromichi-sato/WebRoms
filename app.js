import { defaults, validate, buildFields, resizeLayers, inspect, preparedData, BIO_TRACERS as ALL_BIO_TRACERS, biologyTracers, biologyExecutable, SIDES, SIDE_LABELS } from './src/model.js';
import { OceanView, LABELS } from './src/view.js';
import { ContourControls } from './src/contour-settings.js';
import { coastalReceiver } from './src/coastal-rivers.js';
import { seedBoundary } from './src/boundary-initial.js';
import { exportTerrain, importTerrain, saveBlob } from './src/shape-io.js';
import { exportPlan } from './src/export-plan.js';
import { fetchTides, drawTides } from './src/tides.js';
import { TERRAIN_PRESETS, applyTerrainPreset, fitTerrainSpacing, terrainBlockEdits } from './src/terrain-presets.js';
import { settingsMarkup, STEP_TITLES } from './src/settings-form.js';
import { renderEcosystemPanel, bindEcosystemPanel } from './src/ecosystem-panel.js';
import * as climate from './src/climatology.js';
import { buildWind, ensureWind } from './src/forcing.js';
import { WindView } from './src/wind-view.js';

const $ = selector => document.querySelector(selector);
const icons = () => window.lucide.createIcons();
const storageKey = 'webroms.project.v1';
const contourControls = new ContourControls($('.view-options'), () => draw());
let BIO_TRACERS = ALL_BIO_TRACERS;
let config = defaults(), step = 0, side = 'west', mode = '3d', field = 'h', layer = 2, slice = 16, brush = 'inspect', brushSize = 1, initialBrush = 'inspect';
let editVariable = 'temp', editValue = 12, boundaryVariable = 'temp';
let fields, errors = [], worker, results, runConfig, toastTimer, running = false;
let exporting = false;
const terrainHistory = [], terrainFuture = [], initialHistory = [], initialFuture = [];
const windHistory = [], windFuture = [], windCells = new Set();
let windBrush = 'inspect', windEditU = 5, windEditV = 0, windStroke = false;
let terrainStroke, initialStroke;
const strokeCells = new Set();
const terrainSnapshot = () => structuredClone(config.grid);
const initialSnapshot = () => structuredClone({ initial: config.initial, climatology: config.climatology, biology: config.ecosystem.initial });
function setupClimateControls() {
  const menu = $('#climatePreset'); if (!menu) return;
  const options = [...climate.getClimatologyOptions(config), ...climate.getEnsoOptions(config)];
  for (const option of options) { const node = new Option(option.label, option.id); node.disabled = option.available === false; menu.append(node); }
  const selected = config.climatology?.id;
  menu.value = options.find(option => option.id === selected && option.available !== false)?.id ?? options.find(option => option.available !== false)?.id ?? '';
  const source = () => {
    const selected = options.find(option => option.id === menu.value);
    const note = $('#climateSource');
    note.textContent = (selected?.disclosure ?? '') + ' 有効な深度の範囲外は端の値で近似します。' + (config.climatology?.stale ? ' 地形・層数変更後のため再適用が必要です。' : '');
    if (selected?.sourceUrl) { const link = document.createElement('a'); link.href = selected.sourceUrl; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = ' NOAAの出典'; note.append(link); }
  };
  menu.onchange = source; source();
  $('#applyClimate').onclick = () => {
    try {
      const isEnso = climate.ENSO_OPTIONS.some(option => option.id === menu.value);
      const apply = isEnso ? climate.applyEnsoComposite : climate.applyClimatology;
      const next = apply(config, menu.value, { boundaries: false, outOfRange: 'clamp' });
      delete next.initial.regionalSeason;
      initialHistory.push(initialSnapshot()); initialFuture.length = 0;
      config = next; config.initial.distribution = 'climatology'; initialBrush = 'inspect';
      renderForm(); refresh(); toast('気候値を初期場に反映しました。最深データより下は最深値で近似します。');
    } catch (error) { toast('気候値を適用できません: ' + error.message); }
  };
}
function restoreEdit(kind, redo) {
  const past = kind === 'terrain' ? terrainHistory : initialHistory, future = kind === 'terrain' ? terrainFuture : initialFuture;
  const from = redo ? future : past, to = redo ? past : future;
  if (!from.length) return;
  to.push(kind === 'terrain' ? terrainSnapshot() : initialSnapshot());
  if (kind === 'terrain') config.grid = from.pop();
  else { const saved = from.pop(); config.initial = saved.initial; config.climatology = saved.climatology; config.ecosystem.initial = saved.biology; }
  renderForm(); refresh();
}
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved) { const base = defaults(), migrated = { ...base, ...saved, ecosystem: { ...base.ecosystem, ...saved.ecosystem, model: saved.ecosystem?.model ?? 'fennel', initial: { ...base.ecosystem.initial, ...saved.ecosystem?.initial } }, numerics: { ...base.numerics, ...saved.numerics }, boundary: Object.fromEntries(SIDES.map(side => [side, { ...base.boundary[side], ...saved.boundary?.[side], layers: (saved.boundary?.[side]?.layers ?? base.boundary[side].layers).map(layer => ({ ...base.boundary[side].layers[0], ...layer })) }])) }; if (!validate(migrated).length) config = migrated; } } catch {}
layer = config.grid.nz - 1;
const set = (path, value) => { const keys = path.split('.'); const key = keys.pop(); keys.reduce((value, k) => value[k], config)[key] = value; };
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
    const key = step === 3 ? boundaryVariable : editVariable;
    editor.previousElementSibling.textContent = `塗る値 (${VALUE_UNITS[key] ?? ''})`;
  }
  if (step === 0) {
    const labels = { inspect: '参照', dig: '掘る（1ブロック）', fill: '盛る（1ブロック）', land: '陸地にする', water: '水域にする', 'river-add': '河川を追加', 'river-delete': '河川を削除' };
    box.textContent = brush === 'inspect' ? '参照モード' : `地形編集 · ${labels[brush]} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
    box.hidden = brush === 'inspect'; return;
  }
  if (step === 2) box.textContent = `初期条件 · ${VALUE_LABELS[editVariable]} · ${layer === fields.nz - 1 ? '表層' : layer === 0 ? '底層' : `${fields.nz - layer}層`} · 塗布値 ${formatValue(editValue, editVariable)} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
  else if (step === 3) box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · ${layer === fields.nz - 1 ? '表層' : layer === 0 ? '底層' : `${fields.nz - layer}層`} · 塗布値 ${formatValue(editValue, boundaryVariable)} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
  else { box.hidden = true; return; }
  if (step === 3 && !['specified', 'radiation'].includes(config.boundary[side].mode)) box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · ${config.boundary[side].mode === 'closed' ? '閉鎖' : '周期'} · 参照`;
  box.hidden = step === 2 && initialBrush === 'inspect';
}
function inspectCell(p) {
  const i = p % fields.nx, j = Math.floor(p / fields.nx), parts = [`i=${i}`, `j=${j}`, fields.mask[p] ? `水深 ${formatValue(fields.h[p], 'h')}` : '陸域'];
  if (fields.mask[p]) {
    const key = step === 2 ? editVariable : step === 3 ? boundaryVariable : field;
    if (step === 3) {
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
const view = new OceanView($('#threeView'), $('#mapCanvas'), (p, paint, release, hitLayer, hit) => {
  if (p === null) { terrainStroke = undefined; initialStroke = undefined; strokeCells.clear(); return; }
  if (!fields) return;
  if ([2, 3].includes(step) && Number.isInteger(hitLayer) && paint) { layer = hitLayer; const selector = $(step === 2 ? '#editLayer' : '#boundaryLayer'); if (selector) selector.value = String(layer); updateEditStatus(); }
  inspectCell(p);
  if ([0, 4].includes(step) && !paint) { const river = config.rivers.find(r => (r.landCell ?? r.cell) === p); if (river) { view.selectedRiver = p; view.setRivers(config.rivers); } }
  if (!paint || running || (errors.length && !(step === 0 && brush === 'river-delete'))) return;
  if (step === 0 && brush.startsWith('river')) editRiver(p);
  else if (step === 0 && brush !== 'inspect') paintTerrain(brush === 'fill' && Number.isInteger(hit?.neighbor) ? hit.neighbor : p, hit);
  if (step === 2 && initialBrush === 'paint') paintInitial(p);
  if (step === 3 && ['specified', 'radiation'].includes(config.boundary[side].mode)) paintBoundary(p);
  inspectCell(p);
});
const windView = new WindView($('#windCanvas'), (p, paint) => {
  if (p === null) { windStroke = false; windCells.clear(); return; }
  if (!fields || step !== 5) return;
  if (paint && !running && !errors.length && windBrush !== 'inspect' && fields.mask[p] && !windCells.has(p)) {
    if (![windEditU, windEditV].every(v => Number.isFinite(v) && Math.abs(v) <= 60)) { toast('風速は−60～60 m/sで指定してください。'); return; }
    if (!windStroke) { windHistory.push(structuredClone(ensureWind(config))); if (windHistory.length > 100) windHistory.shift(); windFuture.length = 0; windStroke = true; }
    windCells.add(p);
    if (windBrush === 'erase') delete config.wind.edits[p]; else config.wind.edits[p] = { u: windEditU, v: windEditV };
    renderForm(); refresh();
  }
  const w = buildWind(config);
  $('#windCellValue').textContent = fields.mask[p] ? `(${p % fields.nx}, ${Math.floor(p / fields.nx)})  U=${w.u[p].toFixed(2)}、V=${w.v[p].toFixed(2)} m/s  |U|=${Math.hypot(w.u[p], w.v[p]).toFixed(2)} m/s  τx=${w.tx[p].toFixed(4)}、τy=${w.ty[p].toFixed(4)} N/m²` : '陸域';
});
function restoreWind(redo) {
  const from = redo ? windFuture : windHistory, to = redo ? windHistory : windFuture;
  if (!from.length) return;
  to.push(structuredClone(config.wind)); config.wind = from.pop(); renderForm(); refresh();
}
$('#windZoomIn').onclick = () => windView.zoom(1);
$('#windZoomOut').onclick = () => windView.zoom(-1);
$('#windHome').onclick = () => windView.home();
function paintTerrain(p, hit) {
  const edits = terrainBlockEdits(config.grid, fields, p, brush, brushSize, hit);
  for (const key of Object.keys(edits)) if (strokeCells.has(key)) delete edits[key];
  if (!Object.keys(edits).length) return;
  if (!terrainStroke) { terrainStroke = terrainSnapshot(); terrainHistory.push(terrainStroke); terrainFuture.length = 0; if (terrainHistory.length > 100) terrainHistory.shift(); }
  for (const key of Object.keys(edits)) strokeCells.add(key);
  Object.assign(config.grid.edits, edits);
  if (config.climatology) config.climatology.stale = true;
  if ($('#undoTerrain')) $('#undoTerrain').disabled = false;
  if ($('#redoTerrain')) $('#redoTerrain').disabled = true;
  refresh();
}
function editRiver(p) {
  if (strokeCells.has(p)) return;
  strokeCells.add(p);
  const index = config.rivers.findIndex(r => (r.landCell ?? r.cell) === p);
  if (brush === 'river-delete') {
    if (index >= 0) config.rivers.splice(index, 1);
  } else if (brush === 'river-add' && index < 0) {
    try {
      const cell = coastalReceiver(fields, p);
      if (config.rivers.some(r => r.cell === cell)) throw new Error('この海セルには既に河川が流入しています。別の沿岸セルを選択してください。');
      config.rivers.push({ id: 'river-' + Date.now(), landCell: p, cell, flow: 100, temp: 18, salt: 0, biology: { ...config.ecosystem.initial } });
    } catch (error) { toast(error.message); return; }
  }
  view.selectedRiver = p;
  renderForm(); refresh();
}
function paintInitial(p) {
  if (!Number.isFinite(editValue)) return;
  const lower = editVariable === 'temp' ? -5 : 0, upper = editVariable === 'temp' ? 45 : editVariable === 'salt' ? 50 : 10000;
  if (editValue < lower || editValue > upper) { toast(`塗る値は${lower}〜${upper}で指定してください。`); return; }
  if (!initialStroke) { initialStroke = initialSnapshot(); initialHistory.push(initialStroke); initialFuture.length = 0; if (initialHistory.length > 100) initialHistory.shift(); }
  const g = config.grid, key = editVariable, k = ['zeta'].includes(key) ? 0 : layer;
  config.initial.painted ??= {}; config.initial.painted[key] ??= []; config.initial.painted[key][k] ??= {};
  for (let j = Math.max(0, Math.floor(p / g.nx) - brushSize + 1); j < Math.min(g.ny, Math.floor(p / g.nx) + brushSize); j++) for (let i = Math.max(0, p % g.nx - brushSize + 1); i < Math.min(g.nx, p % g.nx + brushSize); i++) {
    if (Math.max(Math.abs(i - p % g.nx), Math.abs(j - Math.floor(p / g.nx))) >= brushSize) continue;
    const cell = j * g.nx + i; if (fields.mask[cell]) config.initial.painted[key][k][cell] = editValue;
  }
  if ($('#undoInitial')) $('#undoInitial').disabled = false;
  if ($('#redoInitial')) $('#redoInitial').disabled = true;
  refresh();
}
function paintBoundary(p) {
  if (!Number.isFinite(editValue)) return;
  if (!fields.mask[p]) { toast('このセルは陸域です。海底地形で水域に変更するか、水域のある境界面を選択してください。'); return; }
  const g = config.grid, b = config.boundary[side], k = layer;
  b.fromInitial = false;
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
if (!view.renderer) { mode = 'map'; toast('3D表示を開始できないため平面表示に切り替えました。'); document.querySelector('[data-view="3d"]').disabled = true; }
function renderForm() {
  if (!['npzd', 'nemuro'].includes(config.ecosystem.model)) { config.ecosystem.model = 'npzd'; config.ecosystem.enabled = false; }
  config.ecosystem.parameters ??= defaults().ecosystem.parameters;
  config.ecosystem.shortwave ??= 150;
  config.rivers ??= [];
  config.initial.mixing ??= 0;
  config.numerics.windPattern ??= 'uniform';
  delete config.numerics.outputInterval;
  delete config.numerics.tolerance;
  delete config.numerics.steadyWindow;
  for (const b of Object.values(config.boundary)) if (b.mode === 'radiation') { b.mode = 'specified'; b.fromInitial = true; }
  for (const tracer of ALL_BIO_TRACERS) {
    config.ecosystem.initial[tracer.key] ??= tracer.initial;
    for (const b of Object.values(config.boundary)) for (const value of b.layers) value[tracer.key] ??= tracer.initial;
    for (const river of config.rivers) { river.biology ??= {}; river.biology[tracer.key] ??= config.ecosystem.initial[tracer.key]; }
  }
  BIO_TRACERS = biologyTracers(config);
  const keys = ['temp', 'salt', ...BIO_TRACERS.map(t => t.key)];
  if (!keys.includes(editVariable)) editVariable = 'temp';
  if (!keys.includes(boundaryVariable)) boundaryVariable = 'temp';
  $('#stepTitle').textContent = STEP_TITLES[step];
  $('#stepNumber').textContent = String(step + 1).padStart(2, '0') + ' / 07';
  document.querySelectorAll('.steps [data-step]').forEach(button => {
    if (+button.dataset.step === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  $('#calculateButton')?.remove();
  $('#settingsForm').innerHTML = settingsMarkup(config, { step, side, brush, brushSize, layer, editVariable, boundaryVariable, editValue, initialBrush, running, windBrush, windEditU, windEditV });
  const calculateButton = $('#calculateButton');
  $('.settings').classList.toggle('has-calculation-action', Boolean(calculateButton));
  if (calculateButton) $('.step-actions').prepend(calculateButton);
  document.body.dataset.step = String(step);
  const bind = (id, event, handler) => { const element = $('#' + id); if (element) element.addEventListener(event, handler); };
  bind('brush', 'change', e => { brush = e.target.value; renderForm(); draw(); });
  for (const id of ['brushSize', 'editBrushSize', 'boundaryBrushSize']) bind(id, 'change', e => { brushSize = +e.target.value; draw(); });
  bind('initialBrush', 'change', e => { initialBrush = e.target.value; draw(); });
  bind('windBrush', 'change', e => { windBrush = e.target.value; draw(); });
  bind('windEditU', 'change', e => { windEditU = e.target.valueAsNumber; });
  bind('windEditV', 'change', e => { windEditV = e.target.valueAsNumber; });
  bind('undoWind', 'click', () => restoreWind(false));
  bind('redoWind', 'click', () => restoreWind(true));
  bind('rotationFromTerrain', 'click', () => {
    const b = config.grid.geoBounds ?? TERRAIN_PRESETS[config.grid.preset]?.bounds;
    if (!b) { toast('緯度のある地形を選ぶか、基準緯度を直接指定してください。'); return; }
    config.numerics.latitude = (b.north + b.south) / 2; renderForm(); refresh();
  });
  bind('terrainDownload', 'click', async () => { try { saveBlob('webroms-terrain.zip', await exportTerrain(config, fields)); } catch (e) { toast(e.message); } });
  bind('terrainImport', 'change', async e => { try { const file = e.target.files[0]; if (!file) return; const grid = await importTerrain(file, config.grid); const candidate = structuredClone(config); candidate.grid = grid; candidate.rivers = []; candidate.initial.painted = {}; const problems = validate(candidate); if (problems.length) throw new Error(problems[0]); buildFields(candidate); terrainHistory.push(terrainSnapshot()); config.grid = grid; config.rivers = []; config.initial.painted = {}; if (config.climatology) config.climatology.stale = true; brush = 'inspect'; renderForm(); refresh(); toast('Shape地形を読み込みました。'); } catch (error) { toast(error.message); } });
  bind('riverBrush', 'change', e => { brush = e.target.value; renderForm(); draw(); });
  bind('skipRivers', 'click', () => navigate(5));
  bind('seedBoundary', 'click', () => { seedBoundary(config, buildFields(config), side); renderForm(); refresh(); });
  if ($('#tideCanvas')) {
    const series = config.boundary[side].tideEstimate;
    if (series) { drawTides($('#tideCanvas'), series); $('#tideStatus').textContent = `${series.name} / MSL基準 / 最大${series.max.toFixed(2)} m・最小${series.min.toFixed(2)} m・潮差${series.range.toFixed(2)} m / ${series.samples.length}時刻（UTC）`; }
    $('#tideStart').value = series?.startDate ?? new Date().toISOString().slice(0, 10);
  }
  bind('fetchTides', 'click', async () => {
    const target = side, button = $('#fetchTides'); button.disabled = true; $('#tideStatus').textContent = 'NOAAから時系列を取得中…';
    try {
      const series = await fetchTides($('#tideStation').value, $('#tideStart').value, $('#tideDays').valueAsNumber, $('#tideProduct').value);
      config.boundary[target].tideEstimate = series; saveLocal();
      if (side === target && $('#tideCanvas')) { drawTides($('#tideCanvas'), series); $('#tideStatus').textContent = `${series.name} / MSL基準 / 最大${series.max.toFixed(2)} m・最小${series.min.toFixed(2)} m・潮差${series.range.toFixed(2)} m / ${series.samples.length}時刻（UTC）`; }
    } catch (error) { if ($('#tideStatus')) $('#tideStatus').textContent = '取得できません: ' + error.message; }
    finally { button.disabled = false; }
  });

  document.querySelectorAll('[data-remove-river]').forEach(button => button.onclick = () => { config.rivers.splice(+button.dataset.removeRiver, 1); renderForm(); refresh(); });
  bind('undoTerrain', 'click', () => restoreEdit('terrain', false));
  bind('redoTerrain', 'click', () => restoreEdit('terrain', true));
  bind('undoInitial', 'click', () => restoreEdit('initial', false));
  bind('redoInitial', 'click', () => restoreEdit('initial', true));
  bind('editVariable', 'change', e => { editVariable = field = e.target.value; renderForm(); draw(); });
  bind('editLayer', 'change', e => { layer = +e.target.value; draw(); });
  bind('boundaryLayer', 'change', e => { layer = +e.target.value; draw(); });
  bind('editValue', 'change', e => { if (Number.isFinite(e.target.valueAsNumber)) editValue = e.target.valueAsNumber; draw(); });
  bind('boundarySide', 'change', e => { side = e.target.value; renderForm(); draw(); });
  bind('boundaryVariable', 'change', e => { boundaryVariable = field = e.target.value; renderForm(); draw(); });
  bind('averageBoundary', 'click', () => { const b = config.boundary[side]; b.fromInitial = false; delete b.painted?.ubar; delete b.painted?.vbar; for (const axis of ['u', 'v']) b[axis + 'bar'] = b.layers.reduce((sum, l) => sum + l[axis], 0) / config.grid.nz; renderForm(); refresh(); });
  bind('skipEcosystem', 'click', () => { config.ecosystem.enabled = false; navigate(2); refresh(); });
  bind('calculateButton', 'click', startOrStop);
  $('#ecosystemLesson').hidden = step !== 1;
  if (step === 1) {
    $('#ecosystemLesson').innerHTML = renderEcosystemPanel(config);
    bindEcosystemPanel($('#ecosystemLesson'), config, () => { refresh(); });
  }
  if (step === 2) setupClimateControls();
  bind('initialDistribution', 'change', event => {
    const selected = event.target.value;
    if (selected.startsWith('regional-')) {
      try { initialHistory.push(initialSnapshot()); config = climate.applyRegionalClimate(config, selected.slice(9)); initialBrush = 'inspect'; renderForm(); refresh(); }
      catch (error) { toast(error.message); renderForm(); }
    } else { delete config.initial.regionalSeason; event.target.dataset.path = 'initial.distribution'; }
  });
  for (const [name, past, future] of [['Terrain', terrainHistory, terrainFuture], ['Initial', initialHistory, initialFuture], ['Wind', windHistory, windFuture]]) {
    if ($('#undo' + name)) $('#undo' + name).disabled = !past.length;
    if ($('#redo' + name)) $('#redo' + name).disabled = !future.length;
  }
  $('#previousButton').disabled = step === 0 || running || exporting;
  $('#nextButton').hidden = step === 6;
  $('#nextButton').textContent = (STEP_TITLES[step + 1] || '') + 'へ';
  $('#computation').hidden = step !== 6 && !results;
  $('#settingsForm').querySelectorAll('input, select, button').forEach(element => { if (exporting || running && element.id !== 'calculateButton') element.disabled = true; });
  icons(); updateActions();
}
function updateActions() {
  for (const id of ['saveButton', 'exportButton']) $('#' + id).disabled = errors.length > 0;
  $('#nextButton').disabled = errors.length > 0 || running || exporting;
  for (const id of ['importButton', 'resetButton', 'projectName']) $('#' + id).disabled = running || exporting;
  document.querySelectorAll('.steps [data-step]').forEach(button => button.disabled = running || exporting);
  if ($('#calculateButton')) $('#calculateButton').disabled = exporting || (errors.length > 0 || !biologyExecutable(config)) && !running;
}
function draw() {
  if (!fields) return;
  $('#hoverValue').textContent = 'セル未選択';
  $('#fieldSelect').querySelectorAll('[data-biology]').forEach(option => option.remove());
  if (config.ecosystem.enabled) for (const tracer of BIO_TRACERS) { const option = new Option(tracer.label, tracer.key); option.dataset.biology = ''; $('#fieldSelect').append(option); }
  if (ALL_BIO_TRACERS.some(t => t.key === field) && (!config.ecosystem.enabled || !BIO_TRACERS.some(t => t.key === field))) field = 'temp';
  if (config.ecosystem.enabled && !fields.biology) fields.biology = buildFields(config).biology;
  if ($('#vectorToggle').checked && mode !== 'map') mode = 'map';
  layer = Math.max(0, Math.min(config.grid.nz - 1, layer)); slice = Math.max(0, Math.min(config.grid.ny - 1, slice));
  $('#layerSelect').innerHTML = Array.from({ length: fields.nz }, (_, i) => '<option value="' + (fields.nz - 1 - i) + '">' + (i + 1) + '層' + (i === 0 ? '（表層）' : '') + '</option>').join('');
  $('#layerSelect').value = layer; $('#layerSelect').disabled = !['temp', 'salt', ...BIO_TRACERS.map(({ key }) => key)].includes(field) && !$('#vectorToggle').checked;
  $('#fieldSelect').value = field;
  $('#sliceControl').hidden = mode !== 'section'; $('#sliceRow').max = fields.ny - 1; $('#sliceRow').value = slice; $('#sliceValue').textContent = slice;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
  view.setCompanion([2, 6].includes(step) ? 'section' : step === 3 ? 'boundary' : null, { side, boundary: config.boundary[side], variable: boundaryVariable });
  view.colorSettings = step === 6 ? contourControls.get(field) : undefined;
  view.set(fields, field, layer, mode, slice, $('#vectorToggle').checked);
  contourControls.update(field, view, step === 6);
  view.setRivers(config.rivers ?? []);
  view.setEditing(!running && (step === 0 ? brush !== 'inspect' : step === 2 ? initialBrush === 'paint' : step === 3 && ['specified', 'radiation'].includes(config.boundary[side].mode)));
  $('#scenePair').classList.toggle('has-companion', [2, 3, 6].includes(step));
  $('.secondary-scene').hidden = ![2, 3, 6].includes(step);
  $('#scenePair').hidden = [1, 5].includes(step);
  $('.view-toolbar').hidden = [1, 5].includes(step);
  $('#windWorkspace').hidden = step !== 5;
  if (step === 5) windView.set(fields, buildWind(config), windBrush !== 'inspect');
  if ($('#boundaryNotice')) $('#boundaryNotice').hidden = step !== 3;
  $('#boundaryFaceTitle').hidden = step !== 3;
  $('#boundaryFaceTitle').textContent = step === 3 ? `${SIDE_LABELS[side]} 境界面` : '';
  document.querySelector('.view-toolbar .segmented').hidden = step === 3;
  document.querySelector('.vector-toggle').hidden = step === 3;
  document.querySelector('.scene-caption').hidden = false;
  document.querySelector('.axis-label').hidden = false;
  $('#sliceControl').hidden = [1, 3, 5].includes(step) || (![2, 6].includes(step) && mode !== 'section');
  for (const id of ['fieldSelect', 'layerSelect', 'vectorToggle']) $('#' + id).hidden = step === 3;
  $('#sceneTitle').textContent = LABELS[field]; $('#sceneSubtitle').textContent = results ? 'ROMS計算場' : '初期場 / 鉛直方向は強調表示';
  updateEditStatus();
}
function refresh() {
  worker?.terminate(); worker = undefined;
  results = undefined;
  $('#resultButton').disabled = true;
  $('#modelTime').textContent = '0 s';
  $('#iterations').textContent = '0';
  $('#convergence').textContent = '未計算';
    $('#phaseText').textContent = '条件設定';
    $('#solverStatus').textContent = 'ROMS実行待ち';
  $('#runLog').textContent = '';
  errors = validate(config);
  let warnings = [];
  if (!errors.length) {
    try { fields = buildFields(config); for (const side of SIDES) if (config.boundary[side].fromInitial && config.boundary[side].mode === 'specified') seedBoundary(config, fields, side); warnings = inspect(config, fields); results = undefined; $('#resultButton').disabled = true; draw(); }
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
function navigate(index) { step = index; brush = initialBrush = windBrush = 'inspect'; if ([0, 4].includes(step)) field = 'h'; if (step === 2) field = editVariable; if (step === 6 && field === 'h') field = 'temp'; if ([2, 3, 6].includes(step)) { mode = '3d'; $('#vectorToggle').checked = false; } renderForm(); draw(); view.resize(); saveLocal(); }
$('#settingsForm').onsubmit = event => event.preventDefault();
$('#settingsForm').addEventListener('input', event => {
  const path = event.target.dataset.path;
  if (running || event.target.type !== 'range' || !['wind.speed', 'initial.mixing'].includes(path)) return;
  set(path, event.target.valueAsNumber);
  if (path === 'wind.speed') { delete config.wind.legacyStress; config.wind.edits = {}; windHistory.length = windFuture.length = 0; $('#windSpeedOutput').textContent = config.wind.speed.toFixed(1) + ' m/s'; }
  else { config.initial.anchors = {}; config.initial.painted = {}; initialHistory.length = initialFuture.length = 0; event.target.closest('label').querySelector('output').textContent = Math.round(config.initial.mixing * 100) + '%'; }
  refresh();
});
$('#settingsForm').addEventListener('change', event => {
  const path = event.target.dataset.path; if (!path || running) return;
  const value = path === 'ecosystem.enabled' ? event.target.value === 'true' : ['number', 'range'].includes(event.target.type) ? event.target.valueAsNumber : event.target.value;
  if (path === 'grid.nz' && Number.isInteger(value) && value >= 2 && value <= 15) { resizeLayers(config, value); layer = value - 1; }
  else if (path === 'grid.preset') applyTerrainPreset(config, value);
  else set(path, value);
  if (path.startsWith('boundary.') && !path.endsWith('.mode')) {
    const parts = path.split('.'), boundary = config.boundary[parts[1]];
    boundary.fromInitial = false;
    if (parts[2] === 'layers') delete boundary.painted?.[parts[4]]?.[parts[3]];
    else if (['zeta', 'ubar', 'vbar'].includes(parts[2])) delete boundary.painted?.[parts[2]];
  }
  if (path.startsWith('wind.')) { delete config.wind.legacyStress; config.wind.edits = {}; windBrush = 'inspect'; windHistory.length = windFuture.length = 0; }
  if (['grid.nx', 'grid.ny', 'grid.preset'].includes(path)) { if (config.wind) config.wind.edits = {}; windBrush = 'inspect'; windHistory.length = windFuture.length = 0; windView.home(); }
  if (path === 'wind.pattern' && value === 'coastal') config.wind.direction = 180;
  if (['grid.nx', 'grid.ny'].includes(path)) fitTerrainSpacing(config.grid);
  if (path.startsWith('grid.')) { brush = 'inspect'; terrainHistory.length = terrainFuture.length = 0; if (config.climatology) config.climatology.stale = true; }
  if (config.grid.preset === 'uniform') config.grid.maxDepth = config.grid.minDepth;
  if (['grid.nx', 'grid.ny', 'grid.preset'].includes(path)) { config.grid.edits = {}; config.grid.geoBounds = null; config.grid.geoSource = null; config.rivers = []; config.initial.painted = {}; for (const b of Object.values(config.boundary)) b.painted = {}; }
  if (path === 'initial.distribution') {
    delete config.climatology;
    config.initial.anchors = {}; config.initial.painted = {}; initialBrush = 'inspect';
    if (value === 'summer') Object.assign(config.initial, { tempSurface: 26, tempBottom: 12, saltSurface: 33, saltBottom: 34.5, mixing: 0.1 });
    if (value === 'winter') Object.assign(config.initial, { tempSurface: 12, tempBottom: 10, saltSurface: 34, saltBottom: 34.5, mixing: 0.9 });
    if (['uniform', 'gradient-x', 'gradient-y'].includes(value)) { config.initial.tempBottom = config.initial.tempSurface; config.initial.saltBottom = config.initial.saltSurface; }
  }
  if (['initial.tempSurface', 'initial.tempBottom', 'initial.saltSurface', 'initial.saltBottom', 'initial.tempGradient', 'initial.mixing'].includes(path)) { config.initial.anchors = {}; config.initial.painted = {}; }
  if (path === 'initial.zeta' && config.climatology) config.climatology.stale = true;
  if (path.startsWith('initial.') || path.startsWith('grid.')) initialHistory.length = initialFuture.length = 0;
  if (path.startsWith('ecosystem.')) for (const tracer of BIO_TRACERS) { delete config.initial.painted?.[tracer.key]; delete config.initial.anchors?.[tracer.key]; }
  if (path.endsWith('.mode') && value === 'specified') seedBoundary(config, buildFields(config), side);
  if (path.endsWith('.mode')) { const opposite = { west: 'east', east: 'west', north: 'south', south: 'north' }[side]; if (value === 'periodic') config.boundary[opposite].mode = 'periodic'; else if (config.boundary[opposite].mode === 'periodic') config.boundary[opposite].mode = value; }
  renderForm();
  refresh();
});
document.querySelectorAll('.steps [data-step]').forEach(button => button.onclick = () => navigate(+button.dataset.step));
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { mode = button.dataset.view; draw(); });
$('#previousButton').onclick = () => navigate(Math.max(0, step - 1));
$('#nextButton').onclick = () => navigate(Math.min(6, step + 1));
$('#fieldSelect').onchange = event => { field = event.target.value; draw(); };
$('#layerSelect').onchange = event => { layer = +event.target.value; draw(); };
$('#vectorToggle').onchange = () => { if ($('#vectorToggle').checked) mode = 'map'; draw(); };
$('#sliceRow').oninput = event => { slice = +event.target.value; draw(); };
$('#homeView').onclick = () => view.home();
$('#zoomIn').onclick = () => view.zoom(1);
const panView = document.createElement('button');
panView.id = 'panView'; panView.className = 'icon'; panView.type = 'button';
panView.title = '移動（ドラッグで上下左右へ移動）'; panView.setAttribute('aria-label', '移動'); panView.setAttribute('aria-pressed', 'false');
panView.innerHTML = '<i data-lucide="hand"></i>';
$('#zoomIn').before(panView);
panView.onclick = () => { const active = panView.getAttribute('aria-pressed') !== 'true'; panView.setAttribute('aria-pressed', String(active)); view.setNavigation(active); };
$('#zoomOut').onclick = () => view.zoom(-1);
$('#sectionZoomIn').onclick = () => view.companion?.zoom(1);
$('#sectionZoomOut').onclick = () => view.companion?.zoom(-1);
$('#sectionHome').onclick = () => view.companion?.home();
$('#projectName').value = config.name;
$('#projectName').onchange = event => { config.name = event.target.value; refresh(); };
$('#saveButton').onclick = () => { if (!errors.length) download('webroms-project.json', config); };
$('#exportButton').onclick = () => { if (!errors.length) download('webroms-arrays.json', preparedData(config, buildFields(config))); };
$('#importButton').onclick = () => $('#importFile').click();
$('#importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 50e6) throw new Error('設定ファイルは50 MB以下にしてください。'); const source = JSON.parse(await file.text()); const loaded = { ...defaults(), ...source, numerics: { ...defaults().numerics, ...source.numerics } }; const issues = validate(loaded); if (issues.length) throw new Error(issues[0]); buildFields(loaded); config = loaded; $('#projectName').value = config.name; layer = config.grid.nz - 1; terrainHistory.length = terrainFuture.length = initialHistory.length = initialFuture.length = windHistory.length = windFuture.length = 0; navigate(0); refresh(); toast('設定を読み込みました。'); }
  catch (error) { toast('読み込めません: ' + error.message); }
  finally { event.target.value = ''; }
};
$('#resetButton').onclick = () => $('#resetDialog').showModal();
$('#cancelReset').onclick = () => $('#resetDialog').close();
$('#confirmReset').onclick = () => { config = defaults(); layer = config.grid.nz - 1; terrainHistory.length = terrainFuture.length = initialHistory.length = initialFuture.length = windHistory.length = windFuture.length = 0; $('#projectName').value = config.name; $('#resetDialog').close(); navigate(0); refresh(); };
function finishRun(message, keepRuntime = false) { running = false; if (!keepRuntime) { worker?.terminate(); worker = undefined; } $('#resultButton').disabled = !worker; $('#solverStatus').textContent = message; $('#phaseText').textContent = results?.outcome === 'completed' ? '計算完了' : '計算停止'; renderForm(); }
function startOrStop() {
  if (running) { if (results) results.outcome = 'cancelled'; $('#convergence').textContent = '中断'; finishRun('計算を停止しました。最後に受信した計算場を表示しています。'); return; }
  if (errors.length) return;
  if (!biologyExecutable(config)) { toast('Fennelの計算用WASMは未対応です。NPZDまたはNEMUROを選択してください。'); return; }
  worker?.terminate();
  running = true; runConfig = structuredClone(config); results = undefined;
  $('#modelTime').textContent = '0 s'; $('#iterations').textContent = '0'; $('#convergence').textContent = '計算中'; $('#runLog').textContent = ''; $('#phaseText').textContent = '計算中'; $('#resultButton').disabled = true;
  renderForm(); $('#solverStatus').textContent = 'ROMS実行核を起動中';
  worker = new Worker(new URL('./runtime/roms-worker.js', import.meta.url), { type: 'module' });
  worker.onerror = event => { if (exporting) { setExportBusy(false); $('#exportSummary').textContent = '実行核エラー: ' + event.message; } if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; finishRun('実行核でエラーが発生しました: ' + event.message); $('#downloadResults').disabled = !worker; };
  worker.onmessage = ({ data }) => {
    if (data.type.startsWith('export-')) { handleExportMessage(data); return; }
    if (data.type === 'status') $('#solverStatus').textContent = data.message;
    if (data.type === 'progress') {
      results = { ...data, outcome: 'running' }; fields = { ...fields, ...data.state }; $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString(); $('#solverStatus').textContent = '計算ステップ ' + data.step.toLocaleString() + ' / ' + runConfig.numerics.maxSteps.toLocaleString(); draw();
      worker?.postMessage({ type: 'progress-ack' });
    }
    if (data.logs) $('#runLog').textContent = data.logs.join('\n');
    if (data.type === 'complete') { if (results) results.outcome = 'completed'; $('#convergence').textContent = '完了'; finishRun('指定した ' + data.step.toLocaleString() + ' ステップの計算が完了しました。', true); }
    if (data.type === 'error') { if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; finishRun(data.message); }
  };
  worker.postMessage({ type: 'run', config: runConfig });
}
$('#resultButton').onclick = () => {
  if (running || exporting) return;
  if (!worker || !results) { toast('計算終了後に保存できます。'); return; }
  updateExportSummary();
  $('#resultsDialog').showModal();
};
function updateExportSummary() {
  try {
    if (!worker || !results) throw new Error('先に計算を実行してください。');
    const plan = exportPlan(runConfig, $('#exportHours').valueAsNumber, $('#exportInterval').valueAsNumber, $('#exportFormat').value, results.step);
    const start = results.time, end = start + plan.duration;
    const formatTime = time => `${Number((time / 3600).toFixed(5))} h`;
    $('#exportSummary').textContent = `現在 ${formatTime(start)} → ${formatTime(end)}。${plan.steps.toLocaleString()}ステップを追加RUN、${plan.count}時刻を保存（${(plan.bytes / 1048576).toFixed(1)} MiB）。` + (plan.steps ? ` 保存間隔 ${plan.interval} s。開始・終了場を含みます。` : ' 追加RUNなし・終了場のみです。');
    $('#downloadResults').disabled = exporting;
  } catch (error) { $('#exportSummary').textContent = error.message; $('#downloadResults').disabled = true; }
}
$('#exportHours').oninput = $('#exportInterval').oninput = updateExportSummary;
$('#exportFormat').onchange = updateExportSummary;
$('#exportDurationPreset').onchange = event => {
  if (event.target.value !== 'custom') { $('#exportHours').value = event.target.value; updateExportSummary(); }
};
$('#exportHours').addEventListener('input', () => { $('#exportDurationPreset').value = 'custom'; });
$('#closeResults').onclick = () => $('#resultsDialog').close();
$('#resultsDialog').addEventListener('cancel', event => { if (exporting) event.preventDefault(); });
$('#cancelExport').onclick = () => { worker?.postMessage({ type: 'cancel-export' }); $('#cancelExport').disabled = true; };
function setExportBusy(busy) {
  exporting = busy;
  $('#resultsDialog').querySelectorAll('input, select').forEach(input => { input.disabled = busy; });
  $('#closeResults').disabled = busy; $('#downloadResults').disabled = busy || !worker;
  $('#cancelExport').hidden = !busy; $('#cancelExport').disabled = false;
  $('#resultButton').disabled = busy || !worker;
  renderForm();
}
function handleExportMessage(data) {
  if (data.type === 'export-progress') { $('#exportSummary').textContent = `保存用追加RUN：${data.done.toLocaleString()} / ${data.total.toLocaleString()} ステップ`; return; }
  if (data.type === 'export-writing') { $('#exportSummary').textContent = '保存ファイルを作成中…'; $('#cancelExport').disabled = true; return; }
  if (data.state) {
    results = { step: data.step, time: data.time, state: data.state, outcome: 'completed' };
    fields = { ...fields, ...data.state };
    $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString(); draw();
  }
  if (data.type === 'export-error' && !data.ready) { worker?.terminate(); worker = undefined; if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; $('#phaseText').textContent = '計算停止'; $('#solverStatus').textContent = data.message; }
  setExportBusy(false);
  if (data.type === 'export-error') { $('#exportSummary').textContent = data.message; return; }
  $('#solverStatus').textContent = `追加RUN後の状態を保持しています（累計 ${data.step.toLocaleString()} ステップ）。`;
  if (data.type === 'export-cancelled') { $('#exportSummary').textContent = '保存用RUNを中断しました。ファイルは作成していません。次のRUNは中断時点から再開します。'; return; }
  saveBlob('webroms-results.' + (data.format === 'shape' ? 'zip' : 'nc'), data.bytes);
  $('#exportSummary').textContent = `${data.count}時刻を出力しました（${data.start} ～ ${data.time} s）。次の追加RUNは現在の終了時点から開始します。`;
}
$('#downloadResults').onclick = () => {
  if (exporting) return;
  const hours = $('#exportHours').valueAsNumber, interval = $('#exportInterval').valueAsNumber, format = $('#exportFormat').value;
  try { if (!worker || !results) throw new Error('先に計算を実行してください。'); exportPlan(runConfig, hours, interval, format, results.step); }
  catch (error) { toast(error.message); return; }
  setExportBusy(true); $('#exportSummary').textContent = '保存用追加RUNを開始…';
  worker.postMessage({ type: 'export', hours, interval, format });
};
renderForm(); refresh(); view.resize();
