import { defaults, validate, buildFields, resizeLayers, inspect, preparedData, SIDES, SIDE_LABELS } from './src/model.js';
import { OceanView, LABELS } from './src/view.js';

const $ = selector => document.querySelector(selector);
const icons = () => window.lucide.createIcons();
const storageKey = 'webroms.project.v1';
let config = defaults(), step = 0, side = 'west', mode = '3d', field = 'h', layer = 2, slice = 16, brush = 'inspect', paintDepth = 100;
let fields, errors = [], worker, results, runConfig, toastTimer, running = false;
const terrainHistory = [];
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved && !validate(saved).length) config = saved; } catch {}
layer = config.grid.nz - 1;
const get = path => path.split('.').reduce((value, key) => value[key], config);
const set = (path, value) => { const keys = path.split('.'); const key = keys.pop(); keys.reduce((value, k) => value[k], config)[key] = value; };
const number = (path, label, min, max, increment = 1, unit = '') => '<label class="field"><span>' + label + '<small>' + unit + '</small></span><input data-path="' + path + '" aria-label="' + label + '" type="number" value="' + get(path) + '" min="' + min + '" max="' + max + '" step="' + increment + '"></label>';
const select = (path, label, options) => '<label class="field"><span>' + label + '</span><select data-path="' + path + '" aria-label="' + label + '">' + Object.entries(options).map(([value, text]) => '<option value="' + value + '"' + (get(path) === value ? ' selected' : '') + '>' + text + '</option>').join('') + '</select></label>';
const group = (title, content, cls = '') => '<fieldset class="form-group ' + cls + '"><legend>' + title + '</legend>' + content + '</fieldset>';
const pair = (...content) => '<div class="fields">' + content.join('') + '</div>';
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
const view = new OceanView($('#threeView'), $('#mapCanvas'), (p, paint) => {
  if (!fields) return;
  $('#hoverValue').textContent = 'i ' + (p % fields.nx) + ' · j ' + Math.floor(p / fields.nx) + ' / ' + (fields.mask[p] ? fields.h[p].toFixed(1) + ' m' : '陸域');
  if (paint && !running && step === 0 && brush !== 'inspect' && !errors.length) {
    const depth = brush === 'land' ? 0 : paintDepth;
    if (config.grid.edits[p] === depth) return;
    terrainHistory.push({ ...config.grid.edits }); if (terrainHistory.length > 100) terrainHistory.shift();
    config.grid.edits[p] = depth; refresh();
  }
});
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
    html += group('陸域・水深の編集', '<label class="field"><span>編集モード</span><select id="brush"><option value="inspect">参照</option><option value="land">陸域</option><option value="water">水域・水深</option></select></label><label class="field"><span>編集水深<small>m</small></span><input id="paintDepth" type="number" min="1" max="10000" value="' + paintDepth + '"></label><button type="button" id="undoTerrain" title="地形の編集を戻す"><i data-lucide="undo-2"></i>編集を戻す</button>');
  } else if (step === 1) {
    html = group('水温・塩分', select('initial.distribution', '初期分布', { uniform: '一様', stratified: '鉛直成層', gradient: '鉛直成層 + 東西勾配' }) + pair(number('initial.tempSurface', '表面水温', -5, 45, 0.1, '°C'), number('initial.tempBottom', '底面水温', -5, 45, 0.1, '°C')) + pair(number('initial.saltSurface', '表面塩分', 0, 50, 0.1), number('initial.saltBottom', '底面塩分', 0, 50, 0.1)) + number('initial.tempGradient', '東端 − 西端 水温差', -20, 20, 0.1, '°C'));
    html += group('水位・流速', number('initial.zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number('initial.u', '東向き流速 U', -10, 10, 0.01, 'm/s'), number('initial.v', '北向き流速 V', -10, 10, 0.01, 'm/s')));
  } else if (step === 2) {
    const b = config.boundary[side], prefix = 'boundary.' + side + '.';
    const rows = [...b.layers].reverse().map((value, k) => '<tr><th scope="row">' + (k + 1) + '</th>' + ['temp', 'salt', 'u', 'v'].map(key => '<td><input data-path="' + prefix + 'layers.' + (g.nz - 1 - k) + '.' + key + '" aria-label="' + SIDE_LABELS[side] + ' 第' + (k + 1) + '層 ' + key + '" type="number" step="0.01" value="' + value[key] + '"' + (b.mode !== 'specified' ? ' disabled' : '') + '></td>').join('') + '</tr>').join('');
    html = group('側面境界', '<label class="field"><span>境界面</span><select id="boundarySide">' + SIDES.map(key => '<option value="' + key + '"' + (side === key ? ' selected' : '') + '>' + SIDE_LABELS[key] + '</option>').join('') + '</select></label>' + select(prefix + 'mode', '境界形式', { closed: '閉鎖', specified: '値を指定（Clamped）', radiation: '放射（Radiation）', periodic: '周期（対向面と同時）' }) + number(prefix + 'zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number(prefix + 'ubar', '鉛直平均 Ubar', -10, 10, 0.01, 'm/s'), number(prefix + 'vbar', '鉛直平均 Vbar', -10, 10, 0.01, 'm/s')) + '<table class="boundary-table"><caption>各層の境界値（第1層：表層）</caption><thead><tr><th>層</th><th>°C</th><th>塩分</th><th>U m/s</th><th>V m/s</th></tr></thead><tbody>' + rows + '</tbody></table><button type="button" id="averageBoundary"><i data-lucide="equal"></i>層流速から鉛直平均を設定</button>', 'boundary-form');
  } else {
    html = group('混合・拡散', pair(number('numerics.horizontalDiffusion', '水平拡散・粘性', 0, 10000, 1, 'm²/s'), number('numerics.verticalDiffusion', '鉛直拡散・粘性', 0, 1, 0.0001, 'm²/s')));
    html += group('外力', pair(number('numerics.windX', '東向き風応力', -10, 10, 0.01, 'N/m²'), number('numerics.windY', '北向き風応力', -10, 10, 0.01, 'N/m²')));
    html += group('時間積分と定常判定', pair(number('numerics.dt', '時間刻み', 0.01, 600, 1, 's'), number('numerics.maxSteps', 'ステップ上限', 1, 1000000, 100)) + pair(number('numerics.tolerance', '許容残差', 1e-12, 0.1, 0.000001, 's⁻¹'), number('numerics.steadyWindow', '連続判定ステップ', 2, 10000)), 'run-form');
    html += '<button id="calculateButton" type="button" class="primary run-form"><i data-lucide="' + (running ? 'square' : 'play') + '"></i>' + (running ? '計算停止' : '定常計算を開始') + '</button>';
  }
  $('#settingsForm').innerHTML = html;
  if (step === 0) {
    $('#brush').value = brush;
    $('#brush').onchange = event => { brush = event.target.value; if (brush !== 'inspect') { mode = 'map'; draw(); } };
    $('#paintDepth').onchange = event => { const value = event.target.valueAsNumber; if (Number.isFinite(value) && value >= 1 && value <= 10000) paintDepth = value; else { event.target.value = paintDepth; toast('編集水深は1〜10000 mです。'); } };
    $('#undoTerrain').onclick = () => { if (terrainHistory.length) { config.grid.edits = terrainHistory.pop(); refresh(); } };
  }
  if (step === 1) {
    document.querySelector('[data-path="initial.tempBottom"]').disabled = config.initial.distribution === 'uniform';
    document.querySelector('[data-path="initial.saltBottom"]').disabled = config.initial.distribution === 'uniform';
    document.querySelector('[data-path="initial.tempGradient"]').disabled = config.initial.distribution !== 'gradient';
  }
  if (step === 2) {
    $('#boundarySide').onchange = event => { side = event.target.value; renderForm(); };
    for (const key of ['zeta', 'ubar', 'vbar']) document.querySelector('[data-path="boundary.' + side + '.' + key + '"]').disabled = config.boundary[side].mode !== 'specified';
    $('#averageBoundary').disabled = config.boundary[side].mode !== 'specified';
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
  if ($('#calculateButton')) $('#calculateButton').disabled = errors.length > 0 && !running;
}
function draw() {
  if (!fields) return;
  layer = Math.max(0, Math.min(config.grid.nz - 1, layer)); slice = Math.max(0, Math.min(config.grid.ny - 1, slice));
  $('#layerSelect').innerHTML = Array.from({ length: fields.nz }, (_, i) => '<option value="' + (fields.nz - 1 - i) + '">' + (i + 1) + '層' + (i === 0 ? '（表層）' : '') + '</option>').join('');
  $('#layerSelect').value = layer; $('#layerSelect').disabled = !['temp', 'salt'].includes(field);
  $('#fieldSelect').value = field;
  $('#sliceControl').hidden = mode !== 'section'; $('#sliceRow').max = fields.ny - 1; $('#sliceRow').value = slice; $('#sliceValue').textContent = slice;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
  view.set(fields, field, layer, mode, slice);
  $('#sceneTitle').textContent = LABELS[field]; $('#sceneSubtitle').textContent = results ? 'ROMS計算場' : '初期場 / 鉛直方向は強調表示';
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
  const value = event.target.type === 'number' ? event.target.valueAsNumber : event.target.value;
  if (path === 'grid.nz' && Number.isInteger(value) && value >= 2 && value <= 10) { resizeLayers(config, value); layer = value - 1; }
  else set(path, value);
  if (['grid.nx', 'grid.ny', 'grid.preset'].includes(path)) { config.grid.edits = {}; terrainHistory.length = 0; }
  if (path.endsWith('.mode')) { const opposite = { west: 'east', east: 'west', north: 'south', south: 'north' }[side]; if (value === 'periodic') config.boundary[opposite].mode = 'periodic'; else if (config.boundary[opposite].mode === 'periodic') config.boundary[opposite].mode = value; }
  if (['grid.nz', 'initial.distribution'].includes(path) || path.endsWith('.mode')) renderForm();
  refresh();
});
document.querySelectorAll('[data-step]').forEach(button => button.onclick = () => navigate(+button.dataset.step));
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { mode = button.dataset.view; draw(); });
$('#previousButton').onclick = () => navigate(Math.max(0, step - 1));
$('#nextButton').onclick = () => navigate(Math.min(3, step + 1));
$('#fieldSelect').onchange = event => { field = event.target.value; draw(); };
$('#layerSelect').onchange = event => { layer = +event.target.value; draw(); };
$('#sliceRow').oninput = event => { slice = +event.target.value; draw(); };
$('#homeView').onclick = () => view.home();
$('#projectName').value = config.name;
$('#projectName').onchange = event => { config.name = event.target.value; refresh(); };
$('#saveButton').onclick = () => { if (!errors.length) download('webroms-project.json', config); };
$('#exportButton').onclick = () => { if (!errors.length) download('webroms-arrays.json', preparedData(config, buildFields(config))); };
$('#importButton').onclick = () => $('#importFile').click();
$('#importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try { if (file.size > 5e6) throw new Error('設定ファイルは5 MB以下にしてください。'); const loaded = JSON.parse(await file.text()); const issues = validate(loaded); if (issues.length) throw new Error(issues[0]); buildFields(loaded); config = loaded; $('#projectName').value = config.name; layer = config.grid.nz - 1; terrainHistory.length = 0; navigate(0); refresh(); toast('設定を読み込みました。'); }
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
