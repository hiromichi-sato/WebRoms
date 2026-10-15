import './src/desktop-session.js';
import { addPaneResizer } from './src/pane-resizer.js';
import { createRunTideChart } from './src/run-tide-chart.js';
import { arrangeBoundaryWorkspace, showClimateSourceInfo } from './src/boundary-workspace.js';
import { defaults, validate, buildFields, resizeLayers, inspect, preparedData, BIO_TRACERS as ALL_BIO_TRACERS, biologyTracers, biologyExecutable, SIDES, SIDE_LABELS } from './src/model.js';
import { OceanView, LABELS } from './src/view.js';
import { fieldValue } from './src/view-section.js';
import { ContourControls } from './src/contour-settings.js';
import { ResultControls } from './src/result-controls.js';
import { PinSeriesControls } from './src/pin-series-controls.js';
import { DiagnosticControls } from './src/diagnostic-controls.js';
import { DIAGNOSTICS, diagnosticAvailable, diagnosticFields } from './src/diagnostics.js';
import { coastalReceiver, invalidRiverIndices } from './src/coastal-rivers.js';
import { seedBoundary, syncBoundaryDefaults } from './src/boundary-initial.js';
import { exportTerrain } from './src/shape-io.js';
import { bindTerrainImporter } from './src/terrain-import-dialog.js';
import { buildCoastline } from './src/terrain-builder.js';
import { cropTerrainGrid, resizeTerrainGrid } from './src/terrain-domain.js';
import { rebuildTerrainGrid } from './src/terrain-rebuild.js';
import { bindTerrainCrop } from './src/terrain-crop-tool.js';
import { updateCoastlineOverlay } from './src/coastline-overlay.js';
import { updateLandDisplayMask } from './src/land-display-mask.js';
import { installLandVectorOverlay } from './src/land-vector-overlay.js';
import { chooseSaveTarget, writeToTarget, settingsJson } from './src/explicit-save.js';
import { exportPlan } from './src/export-plan.js';
import { bindInputControls } from './src/input-controls.js';
import { ensureOcean, prepareForcing } from './src/ocean-boundary.js';
import { TERRAIN_PRESETS, applyTerrainPreset, fitTerrainSpacing, terrainBlockEdits } from './src/terrain-presets.js';
import { settingsMarkup, STEP_TITLES } from './src/settings-form.js';
import { renderEcosystemPanel, bindEcosystemPanel } from './src/ecosystem-panel.js';
import * as climate from './src/climatology.js';
import { acquireGlobalClimate, climateBounds } from './src/global-climatology.js';
import { buildWind, ensureWind, syncTerrainLatitude } from './src/forcing.js';
import { WindView } from './src/wind-view.js';
import { conditionsExcel, loadReportProvenance } from './src/experiment-report.js';
import { withInterpolation } from './src/interpolation-status.js';
import { isolatedWaterCells } from './src/terrain-cleanup.js';
import { bindWindDirection } from './src/wind-direction.js';
import { particleSettings, particlePlan, initialParticleRecord, releaseCoordinates, PARTICLE_COLORS } from './src/particle-experiment.js';
import { showTideInfo } from './src/tide-info.js';
import { particleForcing } from './src/particle-tide.js';

const $ = selector => document.querySelector(selector);
const resultHeading = document.createElement('div'); resultHeading.className = 'result-heading';
const resultTitle = $('#resultActions strong'); resultTitle.before(resultHeading); resultHeading.append(resultTitle);
const projectRunSummary = document.createElement('div'); projectRunSummary.id = 'projectRunSummary'; projectRunSummary.className = 'project-run-summary'; $('.project-bar .phase').after(projectRunSummary);
const runStateBadge = document.createElement('span'); runStateBadge.id = 'runStateBadge'; runStateBadge.className = 'run-state-badge'; runStateBadge.setAttribute('role', 'status'); runStateBadge.setAttribute('aria-live', 'polite'); projectRunSummary.append(runStateBadge);
const runProgressPercent = document.createElement('output'); runProgressPercent.id = 'runProgressPercent'; runProgressPercent.title = '指定ステップ数に対する完了率';
let runProgress;
function updateRunBadge() {
  const convergence = $('#convergence').textContent;
  const state = exporting ? 'exporting' : running ? 'running' : convergence === 'エラー' || results?.outcome === 'error' ? 'error' : pausedRun ? 'stopped' : convergence === '完了' || results?.outcome === 'completed' ? 'completed' : convergence === '中断' || results?.outcome === 'cancelled' ? 'stopped' : 'idle';
  const [icon, label] = ({ idle: ['circle', '未計算'], running: ['loader-circle', '計算中'], completed: ['circle-check', '計算完了'], stopped: ['circle-stop', '停止'], error: ['triangle-alert', 'エラー'], exporting: ['hourglass', '保存用RUN・出力中'] })[state];
  if (runStateBadge.dataset.state !== state) {
    runStateBadge.dataset.state = state; runStateBadge.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>`;
    window.lucide.createIcons();
  }
  runStateBadge.title = state === 'completed' ? '指定ステップ数の計算が完了しました。定常到達は時間変化から確認してください。' : label;
  projectRunSummary.hidden = !(running || exporting || results || step >= 6);
  if (running || exporting) $('#phaseText').textContent = '条件設定';
  $('.project-bar .phase').hidden = ['completed', 'stopped', 'error'].includes(state);
  const percent = runProgress?.total > 0 ? Math.max(0, Math.min(100, Math.floor(runProgress.done * 100 / runProgress.total))) : 0;
  runProgressPercent.hidden = !running && !exporting && !runProgress;
  const progressText = `${percent}% 終了`;
  if (runProgressPercent.textContent !== progressText) runProgressPercent.textContent = progressText;
}
const errorSummary = document.createElement('section'); errorSummary.id = 'errorSummary'; errorSummary.className = 'error-summary'; errorSummary.hidden = true; errorSummary.setAttribute('role', 'alert'); errorSummary.tabIndex = -1;
const checkToolbar = document.createElement('div'); checkToolbar.className = 'input-check-toolbar'; checkToolbar.setAttribute('role', 'toolbar'); checkToolbar.setAttribute('aria-label', '各工程の入力チェック');
$('.steps').after(checkToolbar);
const extraStep = document.createElement('button'); extraStep.dataset.step = '7'; $('.steps').append(extraStep);
document.querySelectorAll('.steps [data-step]').forEach(button => { const label = `${String(Number(button.dataset.step) + 1).padStart(2, '0')} ${STEP_TITLES[Number(button.dataset.step)]}`; button.setAttribute('aria-label', label); button.title = label; button.replaceChildren(); });
const checkDialog = document.createElement('dialog'); checkDialog.id = 'inputCheckDialog';
const checkClose = document.createElement('button'); checkClose.textContent = '閉じる'; checkClose.onclick = () => checkDialog.close();
checkDialog.append(errorSummary, $('#exportButton'), checkClose); document.body.append(checkDialog);
let checkMessages = [];
function checkCategory(message) {
  if (/粒子|放流|追跡/.test(message)) return 7;
  if (/河川/.test(message)) return 4;
  if (/境界|周期端|bar|層流速/.test(message)) return 3;
  if (/風/.test(message)) return 5;
  if (/生態系|生物|NPZD|捕食|光合成/.test(message)) return 1;
  if (/初期|プロファイル|気候値/.test(message)) return 2;
  if (/格子|水深|地形|経度|緯度|地図/.test(message)) return 0;
  return 6;
}
function updateCheckToolbar() {
  checkToolbar.replaceChildren();
  STEP_TITLES.forEach((label, index) => {
    const messages = index === 7 && particleIssue ? [{ type: !config.particles?.sources?.length ? 'warning' : 'error', text: particleIssue }] : checkMessages.filter(item => checkCategory(item.text) === index);
    const state = messages.some(item => item.type === 'error') ? 'error' : messages.length ? 'warning' : 'ok';
    const button = document.createElement('button'); button.type = 'button'; button.dataset.checkStep = index; button.dataset.state = state;
    button.title = `${label}：${state === 'error' ? 'エラー' : state === 'warning' ? '注意・警告' : '注意・警告なし'}`; button.setAttribute('aria-label', button.title);
    if (index === step) button.setAttribute('aria-current', 'step');
    button.innerHTML = `<span class="check-step-number">${String(index + 1).padStart(2, '0')}</span><span class="check-step-name">${label}</span><i data-lucide="${state === 'error' ? 'circle-alert' : state === 'warning' ? 'triangle-alert' : 'circle-check'}" aria-hidden="true"></i>`;
    button.onclick = () => {
      errorSummary.replaceChildren(); errorSummary.hidden = false;
      const title = document.createElement('strong'); title.textContent = `${label}の入力チェック`; errorSummary.append(title);
      for (const item of messages.length ? messages : [{ text: '注意・警告はありません。', type: 'ok' }]) { const p = document.createElement('p'); p.textContent = item.text; p.className = item.type; errorSummary.append(p); }
      checkDialog.showModal();
    };
    checkToolbar.append(button);
  });
  window.lucide.createIcons();
}
function showErrors(messages) {
  checkMessages = checkMessages.filter(item => item.type !== 'error').concat(messages.map(text => ({ type: 'error', text })));
  updateCheckToolbar();
  errorSummary.hidden = true;
}
let invalidRivers = [];
const icons = () => window.lucide.createIcons();
const conditionsButton = document.createElement('button');
conditionsButton.id = 'conditionsButton'; conditionsButton.title = '現在の実験条件をExcelで保存';
conditionsButton.innerHTML = '<i data-lucide="sheet"></i>条件表Excel';
$('#saveButton').after(conditionsButton);
const terrainSaveButton = document.createElement('button'); terrainSaveButton.id = 'terrainDownload'; terrainSaveButton.innerHTML = '<i data-lucide="download"></i>地形データZIPを保存';
const initialSaveButton = document.createElement('button'); initialSaveButton.id = 'initialNetcdfExport'; initialSaveButton.innerHTML = '<i data-lucide="download"></i>初期場を保存';
conditionsButton.after(terrainSaveButton, initialSaveButton);
conditionsButton.onclick = async () => {
  const captured = structuredClone(config);
  try {
    const target = await chooseSaveTarget('webroms-conditions.xlsx');
    if (!target) { toast('保存をキャンセルしました。'); return; }
    conditionsButton.disabled = true;
    await writeToTarget(target, await conditionsExcel(captured, await loadReportProvenance()));
    toast(`保存先：${target.name}`);
  } catch (error) { toast('保存できません：' + error.message); }
  finally { conditionsButton.disabled = errors.length > 0; }
};
const storageKey = 'webroms.project.v1';
try { localStorage.removeItem(storageKey); } catch {}
let savedSettings = null, savedSettingsName = '', exportTarget = null;
let exportWriter = null;
const contourControls = new ContourControls($('.view-options'), () => draw());
const sectionContourControls = new ContourControls($('.section-tools'), () => draw(), { prefix: 'section', label: '鉛直断面のカラーバー' });
const companionColumn = document.createElement('div'); companionColumn.id = 'companionColumn';
$('.secondary-scene').before(companionColumn); companionColumn.append($('.secondary-scene'));
const companionStack = document.createElement('div'); companionStack.id = 'companionStack';
companionColumn.before(companionStack); companionStack.append(companionColumn);
const updateRunTideChart = createRunTideChart(companionColumn);
const sectionHeightResizer = addPaneResizer(companionColumn, $('#runTidePanel'), { id: 'sectionHeightResizer', label: '断面図と潮汐図の高さを調整', property: '--section-height', ratio: true, axis: 'y' });
const boundaryHeightResizer = addPaneResizer(companionColumn, $('.secondary-scene'), { id: 'boundaryHeightResizer', label: '境界潮汐図と断面図の高さを調整', property: '--boundary-tide-height', ratio: true, axis: 'y' });
function updateCompanionLayout() {
  companionStack.hidden = companionColumn.hidden;
  if (companionColumn.hidden) return;
  const hasTide = !$('#runTidePanel').hidden;
  const boundaryTide = $('#boundaryTidePanel');
  const hasBoundaryTide = Boolean(boundaryTide && !boundaryTide.hidden && !$('#boundaryTidePlot')?.hidden);
  const hasSeaLevel = Boolean($('#seaLevelEditor') && !$('#seaLevelEditor').hidden && step === 3);
  companionColumn.classList.toggle('has-run-tide', hasTide);
  companionColumn.classList.toggle('has-boundary-tide', hasBoundaryTide);
  companionColumn.classList.toggle('has-boundary-forcing', hasBoundaryTide || hasSeaLevel);
  companionColumn.classList.toggle('has-sea-level', hasSeaLevel);
  sectionHeightResizer.hidden = !hasTide;
  boundaryHeightResizer.hidden = !(hasBoundaryTide || hasSeaLevel);
  const pinPanel = $('#pinSeries'), hasPin = Boolean(pinPanel && !pinPanel.hidden);
  companionStack.classList.toggle('has-pin-series', hasPin);
  if ($('#pinHeightResizer')) $('#pinHeightResizer').hidden = !hasPin;
  const workspace = $('.workspace'), viewport = $('#viewport');
  let height = viewport.getBoundingClientRect().height;
  if (matchMedia('(min-width:1101px)').matches) {
    const top = viewport.getBoundingClientRect().top - workspace.getBoundingClientRect().top + workspace.scrollTop;
    height = step === 3 ? Math.max(220, workspace.clientHeight - top - 20) : Math.max(height, workspace.clientHeight - top - 20);
  } else if (hasTide || hasBoundaryTide || hasSeaLevel) height = Math.max(640, height);
  if (hasPin && matchMedia('(min-width:1101px)').matches) {
    const top = companionStack.getBoundingClientRect().top;
    const bottom = Math.min(workspace.getBoundingClientRect().bottom, window.innerHeight);
    height = Math.max(300, bottom - Math.max(top, workspace.getBoundingClientRect().top) - 20);
  }
  if (height > 0) companionStack.style.setProperty('--companion-height', Math.round(height) + 'px');
  if (step === 3 && matchMedia('(min-width:1101px)').matches) viewport.style.setProperty('--boundary-scene-height', Math.round(height) + 'px');
  else viewport.style.removeProperty('--boundary-scene-height');
}
companionColumn.addEventListener('companion-layout', updateCompanionLayout);
const companionLayoutObserver = new ResizeObserver(updateCompanionLayout);
companionLayoutObserver.observe($('#viewport')); companionLayoutObserver.observe($('.workspace'));
companionLayoutObserver.observe($('.view-toolbar'));
new ResizeObserver(() => view.resize()).observe($('.secondary-scene'));
addPaneResizer($('main'), $('.workspace'), { id: 'settingsResizer', label: '設定欄の幅を調整', property: '--settings-width' });
addPaneResizer($('#scenePair'), companionStack, { id: 'sceneResizer', label: '立体図と断面図の幅を調整', property: '--scene-width', ratio: true });
const editHistoryTools = document.createElement('div'); editHistoryTools.id = 'editHistoryTools'; editHistoryTools.className = 'edit-history-tools';
document.querySelector('.view-toolbar .segmented').after(editHistoryTools);
const editToolButtons = document.createElement('div'); editToolButtons.id = 'editToolButtons'; editToolButtons.className = 'edit-tool-buttons'; editToolButtons.setAttribute('role', 'group'); editToolButtons.setAttribute('aria-label', '編集ツール');
const editToolOptions = document.createElement('div'); editToolOptions.id = 'editToolOptions'; editToolOptions.className = 'edit-tool-options';
const editModeInputs = document.createElement('div'); editModeInputs.id = 'editModeInputs'; editModeInputs.hidden = true; document.body.append(editModeInputs);
const riverHelp = document.createElement('dialog'); riverHelp.id = 'riverHelpDialog'; riverHelp.innerHTML = '<h3>河川の配置</h3><p>「追加」を選び、海に辺で接する陸地をクリックします。隣接する内側の海セルへ河川水を流入させます。外周の海だけでは配置できません。</p><p>複数の海セルに接する場合は、西・東・南・北の順で流入先を選びます。「削除」で河口をクリックすると削除でき、戻す・進めるにも対応します。</p><p>流量・水温・塩分・生物濃度は「05 河川の設定」で設定します。</p><button type="button">閉じる</button>'; riverHelp.querySelector('button').onclick = () => riverHelp.close(); document.body.append(riverHelp);
const resultControls = new ResultControls($('.view-toolbar'), () => draw());
const diagnosticControls = new DiagnosticControls($('#fieldSelect'), key => { field = key; draw(); });
let diagnosticCache;
const compactRunMetrics = document.createElement('div'); compactRunMetrics.id = 'compactRunMetrics'; compactRunMetrics.hidden = true;
compactRunMetrics.append($('#modelTime').parentElement, $('#iterations').parentElement); contourControls.element.after(compactRunMetrics);
const particleTimeMetric = document.createElement('div'); particleTimeMetric.id = 'particleTimeMetric'; particleTimeMetric.hidden = true;
particleTimeMetric.innerHTML = '<span>追加実験</span><strong id="particleElapsedTime">0.00 h</strong>';
compactRunMetrics.append(particleTimeMetric);
const mainSceneTools = document.createElement('div'); mainSceneTools.className = 'main-scene-tools'; $('#viewport').prepend(mainSceneTools);
mainSceneTools.append(contourControls.element, compactRunMetrics, $('#zoomOut'), $('#zoomIn'), $('#homeView'));
mainSceneTools.prepend($('.view-toolbar .segmented'));
projectRunSummary.append(compactRunMetrics, runProgressPercent);
const tideClock = document.createElement('span'); tideClock.id = 'tideClock'; tideClock.hidden = true; compactRunMetrics.append(tideClock);
$('.section-tools').prepend(sectionContourControls.element);
const boundaryTerrainControl = document.createElement('label'); boundaryTerrainControl.id = 'boundaryTerrainControl'; boundaryTerrainControl.className = 'boundary-terrain-toggle'; boundaryTerrainControl.hidden = true;
boundaryTerrainControl.innerHTML = '<input id="boundaryTerrainToggle" type="checkbox" checked>地形を加味';
$('#sectionZoomIn').after(boundaryTerrainControl); $('#boundaryTerrainToggle').onchange = () => draw();
const displayOptions = document.createElement('div'); displayOptions.className = 'display-options'; $('.view-toolbar').after(displayOptions); displayOptions.append($('.view-options'));
const verticalSelector = resultControls.mode.closest('label'); verticalSelector.firstChild.textContent = '鉛直位置 '; $('.vector-toggle').after(verticalSelector); resultControls.mode.setAttribute('aria-label', '鉛直位置');
const mainDisplayControls = document.createElement('div'); mainDisplayControls.className = 'main-display-controls'; $('#viewport').append(mainDisplayControls); mainDisplayControls.append($('.vector-toggle'), verticalSelector);
diagnosticControls.root.after(verticalSelector);
mainSceneTools.append($('.vector-toggle'));
const landMaskControl=document.createElement('label');landMaskControl.className='land-mask-toggle';
landMaskControl.innerHTML='<input id="n03LandToggle" type="checkbox"><span>N03陸域</span>';mainSceneTools.append(landMaskControl);
$('#n03LandToggle').onchange=()=>draw();
const landMaskColor=document.createElement('input');landMaskColor.id='n03LandColor';landMaskColor.type='color';landMaskColor.value='#ffdead';landMaskColor.title='N03陸域の色';landMaskColor.setAttribute('aria-label','N03陸域の色');landMaskColor.style.cssText='width:28px;height:24px;min-height:24px;padding:2px;';mainSceneTools.append(landMaskColor);
landMaskColor.oninput=()=>draw();
const gridMetrics = $('#wetCount').closest('.metrics'); gridMetrics.classList.add('compact-grid-metrics'); $('#gridSummary').before(gridMetrics);
$('.legend').hidden = true;
for (const [key, label] of [['u', '東向き流速 U'], ['v', '北向き流速 V']]) $('#fieldSelect').append(new Option(label, key));
let BIO_TRACERS = ALL_BIO_TRACERS;
let config = defaults(), step = 0, side = 'west', mode = '3d', field = 'h', layer = 2, slice = 16, brush = 'inspect', brushSize = 1, initialBrush = 'inspect';
let editVariable = 'temp', editValue = 12, boundaryVariable = 'temp';
let initialPanel = 'physical';
let renderingForm = false;
let particlePlacing = false, particleRunning = false, particleResults, particleRecords = [], particleStatus = '', particleIssue = '', particleSource = 0, particleSourceIndex;
let particleColorRequest = 0;
let particleDeleting = false;
let particleTiming, particleBase;
function updateTimeMetrics() {
  updateRunBadge();
  const split = step === 7 && Boolean(results);
  $('#modelTime').previousElementSibling.textContent = split ? '海洋場の計算' : 'モデル時間';
  particleTimeMetric.hidden = !split;
  if (split) {
    const currentDuration = particleTiming ? Math.max(0, particleTiming.end - particleTiming.start) : 0, added = (particleTiming?.total ?? 0) + currentDuration;
    const total = Math.max(results?.time ?? 0, particleTiming?.end ?? 0);
    $('#modelTime').textContent = ((particleBase?.results.time ?? Math.max(0, total - added)) / 3600).toFixed(2) + ' h';
    $('#particleElapsedTime').textContent = (added / 3600).toFixed(2) + ' h';
    particleTimeMetric.title = `追加実験の実施時間合計。今回 ${(currentDuration / 3600).toFixed(2)} h。今回のモデル時刻 ${(total / 3600).toFixed(2)} h`;
  } else if (results) $('#modelTime').textContent = (results.time / 3600).toFixed(2) + ' h';
}
const expandedCalculationGroups = new Set();
let boundaryBrush = 'inspect', boundaryStroke = false, boundaryContext;
const boundaryHistory = [], boundaryFuture = [];
function recordBoundaryEdit() {
  boundaryHistory.push(structuredClone(config.boundary));
  if (boundaryHistory.length > 50) boundaryHistory.shift();
  boundaryFuture.length = 0;
}
function restoreBoundary(redo) {
  const from = redo ? boundaryFuture : boundaryHistory, to = redo ? boundaryHistory : boundaryFuture;
  if (!from.length) return;
  to.push(structuredClone(config.boundary)); config.boundary = from.pop();
  boundaryBrush = 'inspect'; boundaryStroke = false;
  renderForm(); refresh();
}
let fields, errors = [], worker, results, runConfig, toastTimer, running = false, stopping = false, pausedRun;
let exporting = false;
const terrainHistory = [], terrainFuture = [], initialHistory = [], initialFuture = [];
let disposeTerrainCrop;
const windHistory = [], windFuture = [], windCells = new Set();
const riverHistory = [], riverFuture = [];
function recordRiverEdit() { riverHistory.push(structuredClone(config.rivers)); if (riverHistory.length > 100) riverHistory.shift(); riverFuture.length = 0; }
function restoreRiver(redo) {
  const from = redo ? riverFuture : riverHistory, to = redo ? riverHistory : riverFuture;
  if (!from.length) return; to.push(structuredClone(config.rivers)); config.rivers = from.pop();
  strokeCells.clear(); view.selectedRiver = undefined; renderForm(); refresh();
}
let windBrush = 'inspect', windEditU = 5, windEditV = 0, windStroke = false;
let terrainStroke, initialStroke;
const strokeCells = new Set();
const terrainSnapshot = () => structuredClone(config.grid);
const initialSnapshot = () => structuredClone({ initial: config.initial, climatology: config.climatology, biology: config.ecosystem.initial });
function restoreEdit(kind, redo) {
  const past = kind === 'terrain' ? terrainHistory : initialHistory, future = kind === 'terrain' ? terrainFuture : initialFuture;
  const from = redo ? future : past, to = redo ? past : future;
  if (!from.length) return;
  const domainEdit = kind === 'terrain' && from.at(-1).domainConfig;
  to.push(domainEdit ? { domainConfig: structuredClone(config) } : kind === 'terrain' ? terrainSnapshot() : initialSnapshot());
  if (domainEdit) config = from.pop().domainConfig;
  else if (kind === 'terrain') config.grid = from.pop();
  else { const saved = from.pop(); config.initial = saved.initial; config.climatology = saved.climatology; config.ecosystem.initial = saved.biology; }
  renderForm(); refresh();
}
layer = config.grid.nz - 1;
const set = (path, value) => { const keys = path.split('.'); const key = keys.pop(); keys.reduce((value, k) => value[k], config)[key] = value; };
const VALUE_UNITS = { h: 'm', temp: '°C', salt: 'PSU', zeta: 'm', u: 'm/s', v: 'm/s', ...Object.fromEntries(BIO_TRACERS.map(({ key, unit }) => [key, unit])) };
const VALUE_LABELS = { h: '水深', temp: '水温', salt: '塩分', zeta: '海面高度', u: '東向き流速 U', v: '北向き流速 V', ...Object.fromEntries(BIO_TRACERS.map(({ key, label }) => [key, label])) };
function formatValue(value, key) { return Number.isFinite(value) ? `${Number(value.toPrecision(4))} ${VALUE_UNITS[key] ?? ''}`.trim() : 'データなし'; }
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
    const amount = config.grid.editDepth ?? config.grid.minDepth;
    const labels = { inspect: '参照', dig: `掘る（${amount} m）`, fill: `盛る（${amount} m）`, 'river-add': '河川を追加', 'river-delete': '河川を削除' };
    box.textContent = brush === 'inspect' ? '参照モード' : `地形編集 · ${labels[brush]} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
    box.hidden = brush === 'inspect'; return;
  }
  if (step === 2) box.textContent = `初期条件 · ${VALUE_LABELS[editVariable]} · ${layer === fields.nz - 1 ? '表層' : layer === 0 ? '底層' : `${fields.nz - layer}層`} · 塗布値 ${formatValue(editValue, editVariable)} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
  else if (step === 3) box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · ${layer === fields.nz - 1 ? '表層' : layer === 0 ? '底層' : `${fields.nz - layer}層`} · 塗布値 ${formatValue(editValue, boundaryVariable)} · ブラシ ${brushSize * 2 - 1}×${brushSize * 2 - 1}`;
  else { box.hidden = true; return; }
  if (step === 3 && !['specified', 'open', 'radiation'].includes(config.boundary[side].mode)) box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · ${config.boundary[side].mode === 'closed' ? '閉鎖' : '周期'} · 参照`;
  else if (step === 3 && boundaryBrush === 'inspect') box.textContent = `境界 ${SIDE_LABELS[side]} · ${VALUE_LABELS[boundaryVariable]} · 参照`;
  box.hidden = step === 2 && initialBrush === 'inspect';
}
function inspectCell(p, hitLayer, hit) {
  $('#hoverValue').classList.toggle('land-hover', [2, 3].includes(step) && !fields.mask[p]);
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
    } else {
      const sectionDepth = step === 6 && Number.isFinite(view.depth) && hit?.source === 'section' ? hit.depth : undefined;
      const value = DIAGNOSTICS[key] ? Number.isInteger(hitLayer) ? fieldValue(view.fields, key, p, hitLayer) : view.sample(key, p, sectionDepth) : step === 6 && !Number.isInteger(hitLayer) ? view.sample(key, p, sectionDepth) : displayCellValue(key, p, key === 'zeta' ? 0 : Number.isInteger(hitLayer) ? hitLayer : layer);
      if (Number.isFinite(sectionDepth)) parts.push(`海面下 ${sectionDepth.toFixed(1)} m`);
      parts.push(`${DIAGNOSTICS[key]?.label ?? VALUE_LABELS[key]} ${formatValue(value, key)}${DIAGNOSTICS[key] ? ' ' + DIAGNOSTICS[key].unit : ''}`);
    }
  }
  $('#hoverValue').textContent = parts.join('  ·  ');
}
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function updateSaveStatus() {
  const text = savedSettingsName ? `保存先：${savedSettingsName}${savedSettings === settingsJson(config) ? '（保存済み）' : '（未保存の変更）'}` : '未保存（終了・再読込で破棄）';
  $('#saveStatus').textContent = text; $('#saveStatus').title = text;
}
async function download(name, value, settings = false) {
  try {
    const target = await chooseSaveTarget(name); if (!target) { toast('保存をキャンセルしました。ファイルは保存していません。'); return; }
    const text = settingsJson(value); await writeToTarget(target, text);
    if (settings) { savedSettings = text; savedSettingsName = target.name; updateSaveStatus(); }
    toast(`保存先：${target.name}`);
  } catch (error) { toast('保存できません：' + error.message); }
}
const view = new OceanView($('#threeView'), $('#mapCanvas'), (p, paint, release, hitLayer, hit) => {
  if (p === null) { terrainStroke = undefined; initialStroke = undefined; boundaryStroke = false; strokeCells.clear(); return; }
  if (!fields) return;
  if (step === 7 && paint && particleDeleting && !running && !exporting) {
    const index = config.particles.sources.findIndex(s => s.cell === p);
    if (index >= 0) removeParticleSource(index);
    return;
  }
  if (step === 7 && paint && particlePlacing && !running && !exporting) {
    const x = p % fields.nx, y = Math.floor(p / fields.nx);
    if (!fields.mask[p] || x < 1 || x >= fields.nx - 1 || y < 1 || y >= fields.ny - 1) { toast('放流位置は境界を除く水域セルに指定してください。'); return; }
    config.particles = particleSettings(config);
    const existing = config.particles.sources.findIndex(s => s.cell === p);
    if (existing >= 0) particleSource = existing;
    else {
      particleSource = config.particles.sources.length;
      config.particles.sources.push({ id: 'release-' + crypto.randomUUID(), cell: p, count: 25, depth: 1, color: PARTICLE_COLORS[particleSource % PARTICLE_COLORS.length] });
      particleResults = undefined; particleRecords = []; particleSourceIndex = undefined; particleStatus = '';
    }
    renderForm(); draw(); updateSaveStatus(); return;
  }
  if (!paint) {
    const target = step === 0 && brush === 'fill' && Number.isInteger(hit?.neighbor) ? hit.neighbor : p;
    let cells = [];
    if (step === 7 && (particlePlacing || particleDeleting)) cells = [p];
    if ([0, 4].includes(step) && brush !== 'inspect') {
      cells = brush.startsWith('river') ? [target] : Object.keys(terrainBlockEdits(config.grid, fields, target, brush, brushSize, hit)).map(Number);
      if (!cells.length) cells = [target];
    } else if ([2, 3].includes(step)) {
      const x = p % fields.nx, y = Math.floor(p / fields.nx);
      for (let j = Math.max(0, y - brushSize + 1); j < Math.min(fields.ny, y + brushSize); j++) for (let i = Math.max(0, x - brushSize + 1); i < Math.min(fields.nx, x + brushSize); i++) cells.push(j * fields.nx + i);
    }
    view.setPreview(cells, hit, Number.isInteger(hitLayer) ? hitLayer : layer);
  }
  if ([2, 3].includes(step) && Number.isInteger(hitLayer) && paint) { layer = hitLayer; const selector = $(step === 2 ? '#editLayer' : '#boundaryLayer'); if (selector) selector.value = String(layer); updateEditStatus(); }
  inspectCell(p, hitLayer, hit);
  if (step === 0 && !paint) { const river = config.rivers.find(r => (r.landCell ?? r.cell) === p); if (river) { view.selectedRiver = p; view.setRivers(config.rivers); } }
  if (!paint || running || exporting || (errors.length && !([0, 4].includes(step) && brush === 'river-delete'))) return;
  if ([0, 4].includes(step) && brush.startsWith('river')) editRiver(p);
  else if (step === 0 && brush !== 'inspect') paintTerrain(brush === 'fill' && Number.isInteger(hit?.neighbor) ? hit.neighbor : p, hit);
  if (step === 2 && initialBrush === 'paint') paintInitial(p);
  if (step === 3 && boundaryBrush === 'paint' && ['specified', 'open', 'radiation'].includes(config.boundary[side].mode)) paintBoundary(p);
  inspectCell(p, hitLayer, hit);
});
view.onVectorScaleChange = (maximum, pixels, mode) => resultControls.drawLegend(maximum, pixels, mode);
view.onSectionChange = row => { slice = row; draw(); };
installLandVectorOverlay(view);
const pinSeries = new PinSeriesControls(view, mainSceneTools, companionColumn, LABELS);
const pinHeightResizer = addPaneResizer(companionStack, pinSeries.root, { id: 'pinHeightResizer', label: '潮汐・断面図とピン時系列の高さを調整', property: '--upper-height', ratio: true, axis: 'y' });
pinHeightResizer.hidden = true;
new MutationObserver(updateCompanionLayout).observe(pinSeries.root, { attributes: true, attributeFilter: ['hidden'] });
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
view.onBoundarySelect = selected => { if (step !== 3 || running || exporting) return; side = selected; boundaryBrush = 'inspect'; boundaryStroke = false; renderForm(); draw(); };
function selectRiverEditor(index, focus = false) {
  if (step !== 4 || running || exporting || !config.rivers[index]) return;
  const p = config.rivers[index].landCell ?? config.rivers[index].cell;
  const changed = view.selectedRiver !== p; view.selectedRiver = p;
  for (const group of document.querySelectorAll('[data-river-editor]')) {
    const selected = Number(group.dataset.riverEditor) === index;
    group.classList.toggle('river-editor-selected', selected);
    if (selected) group.setAttribute('aria-current', 'true'); else group.removeAttribute('aria-current');
  }
  if (changed) view.setRivers(config.rivers);
  if (focus) {
    const group = $(`[data-river-editor="${index}"]`);
    group?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    group?.querySelector('input,select')?.focus({ preventScroll: true });
  }
}
view.onRiverSelect = cell => { if (step !== 4 || brush !== 'inspect') return; selectRiverEditor(config.rivers.findIndex(r => (r.landCell ?? r.cell) === cell), true); };
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
  if (!Object.keys(edits).length && brush === 'dig' && fields.mask[p] && fields.h[p] >= config.grid.maxDepth) toast('最大水深に達しています。さらに掘る場合は最大水深を大きくしてください。');
  if (!Object.keys(edits).length && brush === 'dig' && !fields.mask[p] && (config.grid.editDepth ?? config.grid.minDepth) < config.grid.minDepth) toast(`陸地を掘るには、編集量を最小水深 ${config.grid.minDepth} m以上にしてください。`);
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
    if (index >= 0) { recordRiverEdit(); config.rivers.splice(index, 1); }
  } else if (brush === 'river-add' && index < 0) {
    try {
      const cell = coastalReceiver(fields, p);
      if (config.rivers.some(r => r.cell === cell)) throw new Error('この海セルには既に河川が流入しています。別の沿岸セルを選択してください。');
      recordRiverEdit(); config.rivers.push({ id: 'river-' + Date.now(), landCell: p, cell, flow: 100, temp: 18, salt: 0, biology: { ...config.ecosystem.initial } });
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
  const iAt = p % g.nx, jAt = Math.floor(p / g.nx);
  if ((side === 'west' && iAt !== 0) || (side === 'east' && iAt !== g.nx - 1) || (side === 'south' && jAt !== 0) || (side === 'north' && jAt !== g.ny - 1)) return;
  if (!boundaryStroke) { recordBoundaryEdit(); boundaryStroke = true; }
  if (boundaryVariable === 'zeta') {
    if (b.fromInitial) seedBoundary(config, fields, side);
    b.fromInitial = false; b.painted ??= {}; b.painted.zeta ??= [{}]; b.painted.zeta[0] ??= {};
    const along = ['west', 'east'].includes(side) ? jAt : iAt, length = ['west', 'east'].includes(side) ? g.ny : g.nx;
    for (let q = Math.max(0, along - brushSize + 1); q < Math.min(length, along + brushSize); q++) {
      const cell = side === 'west' ? q * g.nx : side === 'east' ? q * g.nx + g.nx - 1 : side === 'south' ? q : (g.ny - 1) * g.nx + q;
      if (fields.mask[cell]) b.painted.zeta[0][q] = editValue;
    }
    refresh(); return;
  }
  b.fromInitial = false;
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
function configureEditToolbar() {
  const tools = ({
    0: [['brush', 'inspect', 'mouse-pointer-2', '参照'], ['brush', 'dig', 'shovel', '掘る'], ['brush', 'fill', 'blocks', '盛る'], ['riverBrush', 'river-add', 'git-merge', '河川を追加'], ['riverBrush', 'river-delete', 'git-merge', '河川を削除']],
    2: [['initialBrush', 'inspect', 'mouse-pointer-2', '参照'], ['initialBrush', 'paint', 'paintbrush', '塗る']],
    3: [['boundaryBrush', 'inspect', 'mouse-pointer-2', '参照'], ['boundaryBrush', 'paint', 'paintbrush', '塗る']],
    4: [['riverBrush', 'inspect', 'mouse-pointer-2', '参照'], ['riverBrush', 'river-add', 'git-merge', '河川を追加'], ['riverBrush', 'river-delete', 'git-merge', '河川を削除']],
    5: [['windBrush', 'inspect', 'mouse-pointer-2', '参照'], ['windBrush', 'paint', 'paintbrush', '設定'], ['windBrush', 'erase', 'eraser', '元の分布に戻す']]
  })[step] ?? [];
  if (step === 4) { const modeInput = document.createElement('select'); modeInput.id = 'riverBrush'; for (const value of ['inspect', 'river-add', 'river-delete']) modeInput.add(new Option(value, value)); modeInput.value = brush; editModeInputs.append(modeInput); }
  const modeIds = new Set(tools.map(t => t[0]));
  for (const id of modeIds) { const select = $('#' + id), label = select?.closest('label'); if (select) editModeInputs.append(select); label?.remove(); }
  const current = [0, 4].includes(step) ? brush : step === 2 ? initialBrush : step === 3 ? boundaryBrush : windBrush;
  for (const [id, value, icon, label] of tools) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'icon edit-tool'; button.dataset.editTool = value;
    if (value.startsWith('river-')) button.classList.add(value === 'river-add' ? 'river-add-tool' : 'river-delete-tool');
    button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(current === value));
    button.innerHTML = `<i data-lucide="${icon}"></i>`;
    button.disabled = running || exporting || step === 3 && value === 'paint' && !['specified', 'open', 'radiation'].includes(config.boundary[side].mode);
    button.onclick = () => { const select = $('#' + id); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
    let group = editToolButtons.querySelector(`[data-tool-group="${value.startsWith('river-') || step === 4 ? 'river' : 'terrain'}"]`);
    if (!group) { group = document.createElement('div'); group.className = 'labelled-tool-group'; group.dataset.toolGroup = value.startsWith('river-') || step === 4 ? 'river' : 'terrain'; const caption = document.createElement('span'); caption.textContent = group.dataset.toolGroup === 'river' ? '河川' : step === 0 ? '地形' : '編集'; group.append(caption); editToolButtons.append(group); }
    group.append(button);
  }
  const options = ({ 0: ['brushSize', 'terrainEditDepth'], 2: ['editVariable', 'editLayer', 'editValue', 'editBrushSize'], 3: ['boundaryVariable', 'boundaryLayer', 'editValue', 'boundaryBrushSize'], 5: ['windEditU', 'windEditV'] })[step] ?? [];
  for (const id of options) { const label = $('#' + id)?.closest('label'); if (label) editToolOptions.append(label); }
  if (step === 3 && boundaryVariable === 'zeta') $('#boundaryLayer').closest('label').hidden = true;
  if (step === 3) {
    const selector = $('#boundarySide'), label = selector.closest('label'); editModeInputs.append(selector); label.remove();
    const boundaryMode = $(`[data-path="boundary.${side}.mode"]`); editToolOptions.prepend(boundaryMode.closest('label'));
  }
  if (step === 0) { for (const path of ['grid.minDepth', 'grid.maxDepth']) { const label = $(`[data-path="${path}"]`)?.closest('label'); if (label) editToolOptions.append(label); } }
  const host = step === 5 ? $('.wind-toolbar') : $('.view-toolbar');
  host.prepend(editHistoryTools, editToolButtons, editToolOptions);
  const riverGroup = editToolButtons.querySelector('[data-tool-group="river"]');
  if (riverGroup) { const help = document.createElement('button'); help.type = 'button'; help.className = 'icon river-help'; help.title = '河川の配置方法'; help.setAttribute('aria-label', help.title); help.innerHTML = '<i data-lucide="circle-help"></i>'; help.onclick = () => riverHelp.showModal(); riverGroup.querySelector('span').after(help); }
  if (step === 0) for (const group of $('#settingsForm').querySelectorAll('fieldset.form-group')) if (group.querySelector('legend')?.textContent === '河川の位置') group.remove();
  for (const unused of $('#settingsForm').querySelectorAll('.history-undo,.history-redo')) unused.remove();
  for (const fieldset of $('#settingsForm').querySelectorAll('.form-group')) {
    for (const empty of fieldset.querySelectorAll('.fields:empty')) empty.remove();
    if ([...fieldset.children].every(el => el.tagName === 'LEGEND')) fieldset.remove();
  }
  editToolButtons.hidden = !tools.length; editToolOptions.hidden = !options.length;
  if (step === 7) {
    const group = document.createElement('div'); group.className = 'labelled-tool-group';
    const caption = document.createElement('span'); caption.textContent = '粒子'; group.append(caption);
    const inspect = document.createElement('button'); inspect.type = 'button'; inspect.id = 'inspectParticleCells'; inspect.innerHTML = '<i data-lucide="mouse-pointer-2"></i>参照'; inspect.setAttribute('aria-pressed', String(!particlePlacing && !particleDeleting));
    const remove = document.createElement('button'); remove.type = 'button'; remove.id = 'deleteParticleCells'; remove.title = '放流地点を削除'; remove.setAttribute('aria-label', remove.title); remove.innerHTML = '<i data-lucide="map-pin-minus"></i>削除'; remove.setAttribute('aria-pressed', String(particleDeleting));
    group.append(inspect, $('#chooseParticleCell'), remove);
    editToolButtons.append(group); editToolButtons.hidden = false;
  }
  for (const button of editHistoryTools.querySelectorAll('button')) { button.setAttribute('aria-label', button.title); for (const node of [...button.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove(); const text = document.createElement('span'); text.textContent = button.title; button.append(text); button.classList.add('icon'); }
}
function renderForm() {
  if (renderingForm) return;
  syncTerrainLatitude(config);
  disposeTerrainCrop?.();disposeTerrainCrop=undefined;
  renderingForm = true;
  try {
  updateRunBadge();
  if (step === 2) { if (!config.ecosystem.enabled) initialPanel = 'physical'; if (['temp', 'salt'].includes(editVariable) !== (initialPanel === 'physical')) editVariable = field = initialPanel === 'physical' ? 'temp' : biologyTracers(config)[0].key; }
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
  if (step === 3 && !validate(config).length) {
    const initialFields = buildFields(config);
    syncBoundaryDefaults(config, initialFields);
  }
  const keys = ['temp', 'salt', ...BIO_TRACERS.map(t => t.key)];
  if (!keys.includes(editVariable)) editVariable = 'temp';
  if (![...keys, ...(config.ocean?.seaLevelEnabled ? ['zeta'] : [])].includes(boundaryVariable)) boundaryVariable = 'temp';
  $('#stepTitle').textContent = STEP_TITLES[step];
  $('#stepNumber').textContent = String(step + 1).padStart(2, '0') + ' / 08';
  document.querySelectorAll('.steps [data-step]').forEach(button => {
    if (+button.dataset.step === step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
  updateCheckToolbar();
  for (const id of ['calculateButton', 'resumeCalculation', 'recalculateButton']) $('#' + id)?.remove();
  editModeInputs.replaceChildren(); editToolOptions.replaceChildren(); editToolButtons.replaceChildren();
  $('#boundaryForcingColumn')?.remove(); $('#boundaryForcingTools')?.remove(); $('#initialClimateInfo')?.remove();
  if (step === 3) editToolOptions.dataset.editorLabel = '境界値の編集'; else delete editToolOptions.dataset.editorLabel;
  config.particles = particleSettings(config);
  particleSource = Math.min(particleSource, Math.max(0, config.particles.sources.length - 1));
  $('#settingsForm').innerHTML = settingsMarkup(config, { step, side, brush, brushSize, layer, editVariable, boundaryVariable, editValue, initialBrush, boundaryBrush, running, stopping, mainOutcome: pausedRun ? 'cancelled' : results?.outcome, windBrush, windEditU, windEditV, riverFields: fields, particleReady: Boolean(worker && results), particlePlacing, particleRunning, particleSource, particleCoordinates: config.particles.sources[particleSource] ? releaseCoordinates(config, config.particles.sources[particleSource].cell) : null });
  if (step === 4) {
    [...$('#settingsForm').querySelectorAll('fieldset.form-group')].forEach((group, index) => {
      group.dataset.riverEditor = index; group.setAttribute('aria-label', `河川 ${index + 1} の設定`);
      group.addEventListener('focusin', () => selectRiverEditor(index));
      group.onpointerdown = () => selectRiverEditor(index);
    });
    let selected = config.rivers.findIndex(r => (r.landCell ?? r.cell) === view.selectedRiver);
    if (selected < 0 && config.rivers.length) selected = 0;
    if (selected >= 0) selectRiverEditor(selected);
  }
  if ($('#tideInfo')) $('#tideInfo').onclick = () => showTideInfo(config, buildFields(config));
  if (step === 3) { const toggles = document.createElement('div'); toggles.className = 'boundary-forcing-toggles'; toggles.append($('#tideEnabled').closest('label'), $('#seaLevelEnabled').closest('label')); $('#settingsForm').prepend(toggles); const sideSettings = [...$('#settingsForm').querySelectorAll('fieldset.form-group')].find(group => group.querySelector('legend')?.textContent === '側面境界'); toggles.after($('#boundaryFromInitial').closest('label'), sideSettings); }
  if (step === 3) for (const [toggle, info] of [['tideEnabled', 'tideDataInfo'], ['seaLevelEnabled', 'mdtDataInfo']]) {
    const label = $('#' + toggle).closest('label'), group = document.createElement('div'); group.className = 'forcing-toggle-group';
    label.before(group); group.append(label, $('#' + info));
  }
  if (step === 0) { for (const [path, label] of [['grid.minDepth', '最小水深（浅い側）'], ['grid.maxDepth', '最大水深（深い側）']]) { const input = $(`[data-path="${path}"]`); if (input) { input.title = label; input.closest('label').querySelector('span').firstChild.textContent = label; } } }
  if (step === 1 && !config.ecosystem.enabled) { const selector = $('[data-path="ecosystem.model"]'); selector.replaceChildren(new Option('なし', 'none')); selector.disabled = true; }
  if (step === 2) { const formula = $('#settingsForm .rotation-formula'); if (formula) { const details = document.createElement('details'); details.className = 'advanced-settings'; const summary = document.createElement('summary'); summary.textContent = '詳細：成層の式'; formula.before(details); details.append(summary, formula); } }
  editHistoryTools.replaceChildren();
  if (step === 6) { const groups = [...$('#settingsForm').querySelectorAll('fieldset.form-group')]; const mixing = groups.find(g => g.querySelector('legend')?.textContent === '混合・拡散'), rotation = groups.find(g => g.querySelector('legend')?.textContent === 'コリオリ力'); if (mixing && rotation) rotation.after(mixing, $('#mixingAdvanced')); }
  if (step === 6) {
    const advancedItems = [...$('#settingsForm').querySelectorAll('details.advanced-settings')].filter(details => details.querySelector('summary')?.textContent.startsWith('高度な設定'));
    const advanced = document.createElement('details'); advanced.className = 'advanced-settings'; advanced.id = 'calculationAdvanced'; advanced.open = advancedItems.some(item => item.open);
    const summary = document.createElement('summary'); summary.textContent = '高度な設定'; advanced.append(summary);
    for (const item of advancedItems) { const section = document.createElement('section'); section.className = 'calculation-advanced-section'; const title = document.createElement('h4'); title.textContent = item.id === 'mixingAdvanced' ? '鉛直混合・拡散' : item.querySelector('summary').textContent.includes('フラックス') ? '海面熱フラックス' : '熱交換係数'; section.append(title, ...[...item.children].filter(child => child.tagName !== 'SUMMARY')); item.remove(); advanced.append(section); }
    const mixing = [...$('#settingsForm').querySelectorAll('fieldset.form-group')].find(group => group.querySelector('legend')?.textContent === '混合・拡散'); mixing.after(advanced);
  }
  if (step === 5 && config.wind.pattern === 'uniform') { const input = $('[data-path="wind.direction"]'); const canvas = document.createElement('canvas'); canvas.id = 'windDirectionDial'; canvas.width = canvas.height = 180; canvas.tabIndex = 0; canvas.setAttribute('role', 'slider'); canvas.setAttribute('aria-label', '風が吹いていく方位'); canvas.setAttribute('aria-valuemin', '0'); canvas.setAttribute('aria-valuemax', '359'); input.closest('label').before(canvas); bindWindDirection($('#settingsForm'), angle => { config.wind.direction = angle; delete config.wind.legacyStress; config.wind.edits = {}; windView.set(fields, buildWind(config), false, 'inspect'); }); }
  const historyName = ({ 0: brush.startsWith('river') ? 'River' : 'Terrain', 2: 'Initial', 3: 'Boundary', 4: 'River', 5: 'Wind' })[step];
  if (historyName) {
    for (const action of ['undo', 'redo']) { let button = $('#' + action + historyName); if (!button && historyName === 'River') { button = document.createElement('button'); button.id = action + 'River'; button.title = action === 'undo' ? '戻す' : '進める'; button.className = action === 'undo' ? 'history-undo' : 'history-redo'; button.innerHTML = `<i data-lucide="${action === 'undo' ? 'undo-2' : 'redo-2'}"></i>`; } if (button) editHistoryTools.append(button); }
  }
  if (step === 5) $('.wind-toolbar strong').after(editHistoryTools); else $('.view-toolbar').prepend(editHistoryTools);
  editHistoryTools.hidden = !historyName;
  configureEditToolbar();
  if (step === 6) {
    for (const group of [...$('#settingsForm').querySelectorAll(':scope > fieldset.form-group')]) {
      const legend = group.querySelector('legend'), title = legend?.textContent;
      if (!['大気との熱交換', 'コリオリ力', '混合・拡散'].includes(title)) continue;
      const details = document.createElement('details'); details.className = 'calculation-group'; details.dataset.group = title; details.open = expandedCalculationGroups.has(title);
      const summary = document.createElement('summary'); summary.textContent = title; group.before(details); legend.remove(); details.append(summary, group);
      details.ontoggle = () => { if (!details.isConnected) return; if (details.open) expandedCalculationGroups.add(title); else expandedCalculationGroups.delete(title); };
    }
  }
  if (step === 0 && $('#fillIsolatedWater')) { const cleanup = $('#fillIsolatedWater'); cleanup.classList.add('toolbar-cleanup'); editToolButtons.querySelector('[data-tool-group="terrain"]').append(cleanup); }
  if (step === 2) {
    if (!config.ecosystem.enabled) initialPanel = 'physical';
    const form = $('#settingsForm'), nodes = [...form.children], bio = nodes.find(n => n.querySelector('legend')?.textContent === '生物濃度');
    const tabs = document.createElement('div'); tabs.className = 'initial-item-tabs segmented'; tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '初期条件の項目');
    const physical = document.createElement('div'), biological = document.createElement('div'); physical.id = 'physicalInitialItems'; biological.id = 'biologicalInitialItems'; physical.className = biological.className = 'initial-item-panel';
    for (const node of nodes.slice(1)) (node === bio ? biological : physical).append(node);
    for (const [key, label] of [['physical', '物理項目'], ['biological', '生物項目']]) { const button = document.createElement('button'); button.type = 'button'; button.dataset.initialPanel = key; button.textContent = label; button.setAttribute('aria-pressed', String(initialPanel === key)); button.disabled = key === 'biological' && !config.ecosystem.enabled; button.onclick = () => { initialPanel = key; editVariable = field = key === 'physical' ? 'temp' : biologyTracers(config)[0].key; renderForm(); draw(); }; tabs.append(button); }
    physical.hidden = initialPanel !== 'physical'; biological.hidden = initialPanel !== 'biological'; form.append(tabs, physical, biological);
    const select = $('#editVariable'); for (const option of select.options) { const allowed = ['temp', 'salt'].includes(option.value) === (initialPanel === 'physical'); option.hidden = !allowed; option.disabled = !allowed; }
  }
  if ($('#undoBoundary')) $('#undoBoundary').disabled = !boundaryHistory.length;
  if ($('#redoBoundary')) $('#redoBoundary').disabled = !boundaryFuture.length;
  const calculateButton = $('#calculateButton');
  $('.settings').classList.toggle('has-calculation-action', Boolean(calculateButton));
  if (calculateButton) $('.step-actions').prepend(...['calculateButton', 'resumeCalculation', 'recalculateButton'].map(id => $('#' + id)).filter(Boolean));
  document.body.dataset.step = String(step);
  const bind = (id, event, handler) => { const element = $('#' + id); if (element) element['on' + event] = handler; };
  bind('initialSourceMode', 'change', event => { config.initial.sourceMode = event.target.value; renderForm(); refresh(); });
  bind('fixedVerticalDiffusion', 'change', e => { config.numerics.calculateDiffusion = !e.target.checked; renderForm(); refresh(); });
  bind('brush', 'change', e => { brush = e.target.value; renderForm(); draw(); });
  for (const id of ['brushSize', 'editBrushSize', 'boundaryBrushSize']) bind(id, 'change', e => { brushSize = +e.target.value; draw(); });
  bind('terrainEditDepth', 'change', e => {
    const value = e.target.value === '' ? undefined : Number(e.target.value);
    if (value !== undefined && (!Number.isFinite(value) || value < .01 || value > 10000)) { toast('地形の編集量は0.01〜10000 mで指定してください。'); e.target.value = config.grid.editDepth ?? config.grid.minDepth; return; }
    if (value === undefined) delete config.grid.editDepth; else config.grid.editDepth = value;
    renderForm(); draw(); updateSaveStatus();
  });
  bind('initialBrush', 'change', e => { initialBrush = e.target.value; draw(); });
  bind('boundaryBrush', 'change', e => { boundaryBrush = e.target.value; boundaryStroke = false; draw(); });
  bind('undoBoundary', 'click', () => restoreBoundary(false));
  bind('redoBoundary', 'click', () => restoreBoundary(true));
  bind('windBrush', 'change', e => { windBrush = e.target.value; draw(); });
  bind('windEditU', 'change', e => { windEditU = e.target.valueAsNumber; });
  bind('windEditV', 'change', e => { windEditV = e.target.valueAsNumber; });
  bind('undoWind', 'click', () => restoreWind(false));
  bind('redoWind', 'click', () => restoreWind(true));
  bind('undoRiver', 'click', () => restoreRiver(false)); bind('redoRiver', 'click', () => restoreRiver(true));
  bind('terrainDownload', 'click', async () => { try { const target = await chooseSaveTarget('webroms-terrain.zip'); if (!target) { toast('保存をキャンセルしました。'); return; } await writeToTarget(target, await exportTerrain(config, fields)); toast(`保存先：${target.name}`); } catch (e) { toast(e.message); } });
  bind('terrainSourceMode', 'change', e => {
    const selected = e.target.value;
    if (selected === 'packaged' && config.grid.geoSource) { terrainHistory.push(terrainSnapshot()); terrainFuture.length = 0; applyTerrainPreset(config, 'bay'); }
    config.grid.sourceMode = selected; brush = 'inspect'; renderForm(); refresh();
  });
  if (step === 0) {
    disposeTerrainCrop=bindTerrainCrop({
      view,group:editToolButtons.querySelector('[data-tool-group="terrain"]'),blocked:()=>running||exporting,
      activateMap:()=>{brush='inspect';mode='map';draw();},notify:toast,
      apply:async selection=>{
        const snapshot=JSON.stringify(config);
        const bounds=config.grid.geoBounds??TERRAIN_PRESETS[config.grid.preset]?.bounds;
        let grid=cropTerrainGrid(config.grid,fields,selection,bounds);
        if(!await confirmRun('計算範囲を変更しますか？', `計算格子は${grid.nx} × ${grid.ny}マスです。元の地形は削除せず保持し、選択範囲を基準地形から再補間します。初期場・境界・河川・風・潮汐・粒子配置と計算結果はリセットされます。条件は「戻す」で復元できますが、計算結果は復元できません。`, '計算範囲を適用'))return false;
        if(JSON.stringify(config)!==snapshot||running||exporting)throw new Error('条件が変更されたため切り出しを中止しました。');
        grid=await withInterpolation(()=>rebuildTerrainGrid(grid,text=>{const node=$('#interpolationStatus strong');if(node)node.textContent=text;}),{title:'地形を再補完中…',description:'切り出した範囲の陸海と水深を照合しています。'});
        if(JSON.stringify(config)!==snapshot||running||exporting)throw new Error('条件が変更されたため切り出しを中止しました。');
        const candidate=structuredClone(config),fresh=defaults();
        candidate.grid=grid;candidate.initial=fresh.initial;candidate.boundary=fresh.boundary;
        candidate.ecosystem.initial=fresh.ecosystem.initial;candidate.ecosystem.distribution='summer';
        resizeLayers(candidate,grid.nz);candidate.rivers=[];candidate.wind=null;
        candidate.numerics.windX=candidate.numerics.windY=0;candidate.numerics.windPattern='uniform';
        delete candidate.ocean;delete candidate.particles;delete candidate.climatology;
        if(bounds&&candidate.numerics.rotationMode==='latitude')candidate.numerics.latitude=(grid.geoBounds.south+grid.geoBounds.north)/2;
        const problems=validate(candidate);if(problems.length)throw new Error(problems[0]);buildFields(candidate);
        terrainHistory.push({domainConfig:structuredClone(config)});terrainFuture.length=0;
        if(completedSettings||pausedRun){discardPausedRun();discardCompletedRun();}
        config=candidate;brush='inspect';renderForm();refresh();view.home();
        toast('計算範囲を変更しました。元の地形は保持しています。');return true;
      }
    });
  }
  bindTerrainImporter({
    getConfig: () => config, blocked: () => running || exporting, notify: toast,
    commit: grid => {
      const candidate=structuredClone(config);candidate.grid=grid;candidate.rivers=[];candidate.initial.painted={};delete candidate.initial.imported;
      const problems=validate(candidate);if(problems.length)throw new Error(problems[0]);buildFields(candidate);
      terrainHistory.push(terrainSnapshot());terrainFuture.length=0;config=candidate;
      if(config.climatology)config.climatology.stale=true;
      brush='inspect';renderForm();refresh();
    }
  });
  for(const button of document.querySelectorAll('[data-terrain-info]')) button.onclick=()=>{
    const dialog=document.createElement('dialog');dialog.className='terrain-info-dialog';dialog.setAttribute('aria-label',button.getAttribute('aria-label'));
    const text=document.createElement('p');text.textContent=button.dataset.terrainInfo;
    const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.onclick=()=>dialog.close();
    dialog.append(text,close);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  };
  bind('riverBrush', 'change', e => { brush = e.target.value; strokeCells.clear(); renderForm(); draw(); });
  bind('fillIsolatedWater', 'click', () => {
    const cells = isolatedWaterCells(fields);
    if (!cells.length) { toast('陸埋めする孤立水域はありません。'); return; }
    terrainHistory.push(terrainSnapshot()); terrainFuture.length = 0;
    for (const p of cells) config.grid.edits[p] = 0;
    brush = 'inspect'; renderForm(); refresh(); toast(`${cells.length} セルの孤立水域を陸埋めしました。「戻す」で復元できます。`);
  });
  bind('boundaryFromInitial', 'change', event => { recordBoundaryEdit(); if (event.target.checked) seedBoundary(config, buildFields(config), side); else config.boundary[side].fromInitial = false; boundaryBrush = 'inspect'; renderForm(); refresh(); });

  document.querySelectorAll('[data-remove-river]').forEach(button => button.onclick = () => { recordRiverEdit(); config.rivers.splice(+button.dataset.removeRiver, 1); brush = 'river-delete'; view.selectedRiver = undefined; strokeCells.clear(); renderForm(); refresh(); });
  document.querySelectorAll('[data-river-receiver]').forEach(select => select.onchange = () => {
    if (running || exporting || renderingForm) return;
    try {
      const index = +select.dataset.riverReceiver, river = config.rivers[index];
      const cell = coastalReceiver(fields, river.landCell, +select.value);
      if (config.rivers.some((other, i) => i !== index && other.cell === cell)) throw new Error('この海セルには既に河川が流入しています。');
      recordRiverEdit(); river.cell = cell; brush = 'inspect'; renderForm(); refresh();
    } catch (error) { toast(error.message); renderForm(); }
  });
  bind('undoTerrain', 'click', () => restoreEdit('terrain', false));
  bind('redoTerrain', 'click', () => restoreEdit('terrain', true));
  bind('undoInitial', 'click', () => restoreEdit('initial', false));
  bind('redoInitial', 'click', () => restoreEdit('initial', true));
  bind('editVariable', 'change', e => { editVariable = field = e.target.value; renderForm(); draw(); });
  bind('editLayer', 'change', e => { layer = +e.target.value; draw(); });
  bind('boundaryLayer', 'change', e => { layer = +e.target.value; draw(); });
  bind('editValue', 'change', e => { if (Number.isFinite(e.target.valueAsNumber)) editValue = e.target.valueAsNumber; draw(); });
  bind('boundarySide', 'change', e => { side = e.target.value; boundaryBrush = 'inspect'; boundaryStroke = false; renderForm(); draw(); });
  bind('boundaryVariable', 'change', e => { boundaryVariable = field = e.target.value; if (boundaryVariable === 'zeta') editValue = config.boundary[side].zeta ?? 0; boundaryBrush = 'inspect'; boundaryStroke = false; renderForm(); draw(); });
  if (fields) bindInputControls(config, fields, { side, commit: () => { initialBrush = boundaryBrush = 'inspect'; renderForm(); refresh(); }, message: toast, onError: message => { showErrors([message]); toast(message); }, isBusy: () => running || exporting, initialHistory: () => { initialHistory.push(initialSnapshot()); initialFuture.length = 0; }, boundaryHistory: recordBoundaryEdit });
  if (step === 3) arrangeBoundaryWorkspace(config, companionColumn, $('#scenePair'), running || exporting);
  if (step === 2) {
    const info = document.createElement('button'); info.type = 'button'; info.id = 'initialClimateInfo'; info.className = 'forcing-info-button'; info.title = '気候値のデータ情報'; info.setAttribute('aria-label', info.title); info.innerHTML = '<i data-lucide="info"></i>';
    info.onclick = showClimateSourceInfo; $('#stepTitle').after(info);
  }
  bind('skipEcosystem', 'click', () => { config.ecosystem.enabled = false; navigate(2); refresh(); });
  bind('calculateButton', 'click', startOrStop);
  bind('recalculateButton', 'click', async () => { if (!running && !exporting && await confirmRun('再計算しますか？', '現在の条件を使い、初期場から計算し直します。現在の計算場は破棄します。')) startOrStop(true); });
  bind('resumeCalculation', 'click', resumeCalculation);
  $('#ecosystemLesson').hidden = step !== 1 || !config.ecosystem.enabled;
  if (step === 1) {
    $('#ecosystemLesson').innerHTML = renderEcosystemPanel(config);
    bindEcosystemPanel($('#ecosystemLesson'), config, () => { refresh(); });
  }
  bind('initialDistribution', 'change', async event => {
    const selected = event.target.value;
    if (selected.startsWith('regional-')) {
      event.stopPropagation();
      try { await withInterpolation(async () => {
        const original = JSON.stringify(config), season = selected.slice(9);
        const profile = climateBounds(config) ? await acquireGlobalClimate(config, season) : null;
        if (JSON.stringify(config) !== original) throw new Error('条件が変更されたため取得結果を適用しませんでした。');
        const next = profile ? climate.applyGlobalClimate(config, profile, season) : climate.applyRegionalClimate(config, season);
        initialHistory.push(initialSnapshot()); initialFuture.length = 0; config = next; initialBrush = 'inspect'; renderForm(); refresh();
      }); }
      catch (error) { toast(error.message); renderForm(); }
    } else { delete config.initial.regionalSeason; event.target.dataset.path = 'initial.distribution'; }
  });
  for (const [name, past, future] of [['Terrain', terrainHistory, terrainFuture], ['Initial', initialHistory, initialFuture], ['Wind', windHistory, windFuture]]) {
    if ($('#undo' + name)) $('#undo' + name).disabled = !past.length;
    if ($('#redo' + name)) $('#redo' + name).disabled = !future.length;
  }
  $('#previousButton').disabled = step === 0 || running || exporting;
  $('#nextButton').hidden = step === 7;
  $('#nextButton').innerHTML = '次へ<i data-lucide="arrow-right"></i>';
  $('#computation').hidden = true;
  $('#resultActions').hidden = step !== 6 && !results;
  $('#settingsForm').querySelectorAll('input, select, button').forEach(element => { if (exporting || running && element.id !== 'calculateButton') element.disabled = true; });
  updateRunTideChart(step === 6, worker && (results || running) && runConfig ? runConfig : config);
  icons(); updateActions();
  if (step === 7) bindParticleControls();
  } finally { renderingForm = false; }
}
function bindParticleControls() {
  document.querySelectorAll('[data-particle-source]').forEach(button => { button.disabled = running || exporting; button.onclick = () => { particleSource = +button.dataset.particleSource; renderForm(); draw(); }; });
  if ($('#removeParticleSource')) $('#removeParticleSource').onclick = () => removeParticleSource(particleSource);
  $('#inspectParticleCells').disabled = $('#deleteParticleCells').disabled = running || exporting;
  $('#inspectParticleCells').onclick = () => { particlePlacing = particleDeleting = false; renderForm(); draw(); };
  $('#deleteParticleCells').onclick = () => { particleDeleting = !particleDeleting; particlePlacing = false; renderForm(); draw(); };
  $('#chooseParticleCell').disabled = running || exporting;
  $('#chooseParticleCell').onclick = () => { particlePlacing = !particlePlacing; particleDeleting = false; renderForm(); draw(); };
  $('#particleRun').onclick = startParticles;
  $('#particleRun').disabled = exporting || !particleRunning && !worker;
  $('#particleDownload').disabled = running || exporting || !particleResults?.bytes;
  $('#particleDownload').onclick = async () => {
    try {
      const bytes = particleResults?.bytes;
      if (!bytes) return;
      const target = await chooseSaveTarget('webroms-particles.nc');
      if (!target) return;
      await writeToTarget(target, bytes);
      if (particleResults?.bytes === bytes) { particleStatus = '軌跡を保存しました：' + target.name; if ($('#particleStatus')) $('#particleStatus').textContent = particleStatus; }
      toast('保存先：' + target.name);
    } catch (error) { toast('保存できません：' + error.message); }
  };
  $('#particleStatus').textContent = particleStatus;
  try {
    const plan = particlePlan(runConfig ? { ...runConfig, particles: config.particles } : config, fields, particleBase?.results.step ?? results?.step ?? 0, { repeatForcing: true });
    particleIssue = '';
    $('#particleSummary').textContent = `${plan.sources.length}地点 · 合計${plan.count}粒子 · 追跡 ${Number((plan.duration / 3600).toFixed(4))} h · 記録間隔 ${plan.actualInterval} s`;
    if (results) {
      const start = particleBase?.results.time ?? results.time;
      $('#particleSummary').textContent += ` · 固定開始 ${Number((start / 3600).toFixed(4))} h`;
    }
  } catch (error) {
    particleIssue = error.message;
    $('#particleSummary').textContent = error.message;
    if (!particleRunning) $('#particleRun').disabled = true;
  }
  updateCheckToolbar();
}
function removeParticleSource(index) {
  config.particles.sources.splice(index, 1); particleResults = undefined; particleRecords = []; particleSourceIndex = undefined; particleStatus = '';
  renderForm(); draw(); updateSaveStatus();
}
function startParticles() {
  if (particleRunning) { worker?.postMessage({ type: 'cancel-particles' }); $('#particleRun').disabled = true; return; }
  if (!worker || !results || running || exporting) return;
  try {
    particleBase ??= { results, fields };
    const plan = particlePlan({ ...runConfig, particles: config.particles }, particleBase.fields, particleBase.results.step, { repeatForcing: true });
    particleForcing(runConfig, particleBase.fields, particleBase.results.time, plan.duration);
    runConfig.particles = structuredClone(config.particles);
    particleRecords = [initialParticleRecord(plan, particleBase.results.time)]; particleSourceIndex = plan.sourceIndex; particleResults = undefined;
    const previousDuration = particleTiming ? particleTiming.total + Math.max(0, particleTiming.end - particleTiming.start) : 0;
    particleTiming = { start: particleBase.results.time, end: particleBase.results.time, total: previousDuration };
    runProgress = { done: 0, total: plan.steps };
    particlePlacing = particleDeleting = false; particleRunning = running = true; particleStatus = '粒子追跡を開始しています…';
    renderForm(); draw(); worker.postMessage({ type: 'particles', settings: structuredClone(config.particles) });
  } catch (error) { toast(error.message); }
}
function handleParticleMessage(data) {
  if (data.type === 'particles-preparing') {
    particleStatus = '07終了場の一時データを読み込み中…';
    if ($('#particleStatus')) $('#particleStatus').textContent = particleStatus;
    return;
  }
  if (data.type === 'particles-recolored') {
    if (data.requestId !== particleColorRequest) return;
    if (data.error) toast(data.error);
    else if (particleResults) { particleResults.bytes = data.bytes; particleStatus = '粒子の色を更新しました。未保存です。'; if ($('#particleStatus')) $('#particleStatus').textContent = particleStatus; }
    if ($('#particleDownload')) $('#particleDownload').disabled = !particleResults?.bytes;
    return;
  }
  if (data.record && particleRecords.at(-1)?.time !== data.record.time) particleRecords.push(data.record);
  if (data.type === 'particles-progress') {
    runProgress = { done: data.done, total: data.total };
    if (particleTiming) particleTiming.end = data.time;
    if (data.state) { fields = { ...fields, ...data.state }; results = { ...results, step: data.step, time: data.time, state: data.state }; }
    $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString();
    updateTimeMetrics();
    particleStatus = `粒子追跡中：${data.done.toLocaleString()} / ${data.total.toLocaleString()} ステップ · 今回の追加実験 ${((data.time - (particleTiming?.start ?? data.time)) / 3600).toFixed(2)} h`;
    if ($('#particleStatus')) $('#particleStatus').textContent = particleStatus;
    if (data.record) draw(); return;
  }
  particleRunning = running = false;
  if (particleTiming) particleTiming.end = data.time;
  if (data.state) { results = { step: data.step, time: data.time, state: data.state, outcome: 'completed' }; fields = { ...fields, ...data.state }; }
  $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString();
  if (data.type === 'particles-complete') {
    if (runProgress && !data.cancelled) runProgress.done = runProgress.total;
    particleResults = data; particleRecords = data.records;
    particleStatus = `${data.cancelled ? '追跡を停止しました' : '追跡が完了しました'}：${data.records.length}時刻。未保存です。`;
  } else {
    particleStatus = data.message;
    if (!data.ready) { worker?.terminate(); worker = undefined; }
    toast(data.message);
  }
  renderForm(); draw();
}
function updateActions() {
  for (const button of editToolButtons.querySelectorAll('[data-edit-tool]')) button.disabled = running || exporting || step === 3 && button.dataset.editTool === 'paint' && !['specified', 'open', 'radiation'].includes(config.boundary[side].mode);
  for (const control of editToolOptions.querySelectorAll('input,select')) control.disabled = running || exporting || control.dataset.tideInactive === 'true';
  if ($('#fillIsolatedWater')) $('#fillIsolatedWater').disabled = running || exporting || errors.length > 0;
  for (const [name, past, future] of [['Terrain', terrainHistory, terrainFuture], ['Initial', initialHistory, initialFuture], ['Wind', windHistory, windFuture]]) {
    if ($('#undo' + name)) $('#undo' + name).disabled = running || exporting || !past.length;
    if ($('#redo' + name)) $('#redo' + name).disabled = running || exporting || !future.length;
  }
  if ($('#undoRiver')) $('#undoRiver').disabled = running || exporting || !riverHistory.length;
  if ($('#redoRiver')) $('#redoRiver').disabled = running || exporting || !riverFuture.length;
  if ($('#undoBoundary')) $('#undoBoundary').disabled = running || !boundaryHistory.length;
  if ($('#redoBoundary')) $('#redoBoundary').disabled = running || !boundaryFuture.length;
  for (const id of ['saveButton', 'exportButton', 'conditionsButton', 'terrainDownload', 'initialNetcdfExport']) $('#' + id).disabled = errors.length > 0 || running || exporting;
  $('#nextButton').disabled = errors.length > 0 && !(step === 0 && invalidRivers.length) || running || exporting;
  for (const id of ['importButton', 'resetButton', 'projectName']) $('#' + id).disabled = running || exporting;
  document.querySelectorAll('.steps [data-step]').forEach(button => button.disabled = running || exporting);
  if ($('#calculateButton')) $('#calculateButton').disabled = exporting || stopping || !running && (pausedRun || results?.outcome === 'completed' || errors.length > 0 || !biologyExecutable(config));
  if ($('#recalculateButton')) $('#recalculateButton').disabled = running || exporting || errors.length > 0 || !biologyExecutable(config);
  if ($('#resumeCalculation')) $('#resumeCalculation').disabled = running || exporting || !pausedRun;
}
function draw() {
  if (!fields) return;
  updateCoastlineOverlay(view,step===0?(config.grid.geoBounds??TERRAIN_PRESETS[config.grid.preset]?.bounds):null,()=>{view.rebuild();view.draw();},toast);
  if (step === 3 && $('#boundaryFromInitial')) $('#boundaryFromInitial').checked = config.boundary[side].fromInitial === true;
  const currentTool = [0, 4].includes(step) ? brush : step === 2 ? initialBrush : step === 3 ? boundaryBrush : windBrush;
  for (const button of editToolButtons.querySelectorAll('[data-edit-tool]')) button.setAttribute('aria-pressed', String(button.dataset.editTool === currentTool));
  if (DIAGNOSTICS[field] && (step < 6 || !diagnosticAvailable(field, config, fields))) field = 'temp';
  diagnosticControls.update(step >= 6, config, field, fields);
  const displayHost = step >= 6 ? resultHeading : $('.view-options');
  for (const control of [$('#fieldSelect'), diagnosticControls.root, verticalSelector]) if (control.parentElement !== displayHost) displayHost.append(control);
  $('#hoverValue').textContent = 'セル未選択';
  const biologyOptions = config.ecosystem.enabled ? BIO_TRACERS : [], biologySignature = biologyOptions.map(tracer => tracer.key).join(',');
  if ($('#fieldSelect').dataset.biologySignature !== biologySignature) {
    $('#fieldSelect').dataset.biologySignature = biologySignature;
    $('#fieldSelect').querySelectorAll('[data-biology]').forEach(option => option.remove());
    for (const tracer of biologyOptions) { const option = new Option(tracer.label, tracer.key); option.dataset.biology = ''; $('#fieldSelect').append(option); }
  }
  if (ALL_BIO_TRACERS.some(t => t.key === field) && (!config.ecosystem.enabled || !BIO_TRACERS.some(t => t.key === field))) field = 'temp';
  if (config.ecosystem.enabled && !fields.biology) fields.biology = buildFields(config).biology;
  if ([0, 2, 3, 4, 6].includes(step) && mode === 'section') mode = '3d';
  const vectors = $('#vectorToggle').checked;
  const volumetric = !['h', 'zeta'].includes(field) || vectors;
  view.depth = resultControls.update(step >= 6, fields, vectors, volumetric, layer);
  view.vectorScale = step >= 6 ? resultControls.scale.value : 'log';
  $('[data-view="section"]').hidden = [0, 2, 3, 4, 5, 6, 7].includes(step);
  layer = Math.max(0, Math.min(config.grid.nz - 1, layer)); slice = Math.max(0, Math.min(config.grid.ny - 1, slice));
  if ($('#layerSelect').options.length !== fields.nz) $('#layerSelect').innerHTML = Array.from({ length: fields.nz }, (_, i) => '<option value="' + (fields.nz - 1 - i) + '">' + (i + 1) + '層' + (i === 0 ? '（表層）' : '') + '</option>').join('');
  $('#layerSelect').value = layer; $('#layerSelect').disabled = !volumetric;
  if (!DIAGNOSTICS[field] && $('#fieldSelect').value !== field) $('#fieldSelect').value = field;
  $('#sliceControl').hidden = mode !== 'section'; $('#sliceRow').max = fields.ny - 1; $('#sliceRow').value = slice; $('#sliceValue').textContent = slice;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
  view.independentSectionColors = [0, 2, 3, 6].includes(step); view.externalSectionColorbar = true;
  const colorKey = `${step}:${step === 3 ? side + ':' : ''}${field}`;
  view.colorSettings = [0, 2, 3, 6, 7].includes(step) ? contourControls.get(colorKey) : undefined;
  view.sectionColorSettings = sectionContourControls.get(colorKey);
  view.blockDepth = config.grid.editDepth ?? config.grid.minDepth;
  view.boundaryTerrain = $('#boundaryTerrainToggle').checked;
  view.setCompanion([0, 2, 6].includes(step) ? 'section' : step === 3 ? 'boundary' : null, { side, boundary: config.boundary[side], variable: boundaryVariable });
  let displayFields = fields;
  if (DIAGNOSTICS[field]) {
    if (diagnosticCache?.source !== fields || diagnosticCache?.key !== field) diagnosticCache = { source: fields, key: field, fields: diagnosticFields(fields, config, field) };
    displayFields = diagnosticCache.fields;
  }
  view.particles = step === 7 ? { records: particleRecords, sources: config.particles?.sources, sourceIndex: particleSourceIndex } : undefined;
  const landBounds=config.grid.geoBounds??TERRAIN_PRESETS[config.grid.preset]?.bounds;
  view.landDisplayColor=landMaskColor.value;
  $('#n03LandToggle').disabled=!landBounds;
  landMaskControl.title=landBounds?'N03の陸域を表示に重ねます（計算地形は変更しません）':'緯度経度付きの地形が必要です';
  updateLandDisplayMask(view,landBounds,$('#n03LandToggle').checked,()=>{view.rebuild();view.draw();},toast,displayFields);
  view.set(displayFields, field, layer, mode, slice, $('#vectorToggle').checked);
  contourControls.update(colorKey, view, [0, 2, 3, 6, 7].includes(step));
  view.showRiverDirections = step === 4;
  view.setRivers(config.rivers ?? []);
  view.editTool = [0, 4].includes(step) ? brush : step === 2 ? initialBrush : step === 3 ? boundaryBrush : 'inspect';
  view.setEditing(!running && !exporting && ([0, 4].includes(step) ? brush !== 'inspect' : step === 2 ? initialBrush === 'paint' : step === 3 && boundaryBrush === 'paint' && ['specified', 'open', 'radiation'].includes(config.boundary[side].mode)));
  if (step === 7) { view.editTool = particleDeleting ? 'erase' : 'paint'; view.setEditing((particlePlacing || particleDeleting) && !running && !exporting); }
  view.drawPreview();
  $('#scenePair').classList.toggle('has-companion', [0, 2, 3, 6].includes(step));
  $('.secondary-scene').hidden = ![0, 2, 3, 6].includes(step);
  $('#boundaryTerrainControl').hidden = step !== 3;
  companionColumn.hidden = ![0, 2, 3, 6].includes(step);
  updateCompanionLayout();
  $('#scenePair').hidden = [1, 5].includes(step);
  $('.view-toolbar').hidden = [1, 5, 6].includes(step);
  displayOptions.hidden = [1, 5].includes(step);
  $('#windWorkspace').hidden = step !== 5;
  if (step === 5) windView.set(fields, buildWind(config), windBrush !== 'inspect', windBrush);
  if ($('#boundaryNotice')) $('#boundaryNotice').hidden = step !== 3;
  $('#boundaryFaceTitle').hidden = step !== 3;
  $('#boundaryFaceTitle').textContent = step === 3 ? `${SIDE_LABELS[side]} 境界面` : '';
  document.querySelector('.main-scene-tools .segmented').hidden = false;
  document.querySelector('.vector-toggle').hidden = step === 3;
  document.querySelector('.scene-caption').hidden = false;
  document.querySelector('.axis-label').hidden = false;
  $('#sliceControl').hidden = mode !== 'section' || [1, 3, 5].includes(step);
  for (const id of ['fieldSelect', 'layerSelect', 'vectorToggle']) $('#' + id).hidden = step === 3;
  $('#layerSelect').hidden = [3, 6, 7].includes(step) || view.depth !== null;
  $('#sceneTitle').textContent = LABELS[field]; $('#sceneSubtitle').textContent = results ? 'ROMS計算場' : '初期場 / 鉛直方向は強調表示';
  updateEditStatus();
  compactRunMetrics.hidden = step < 6 && !running && !exporting && !results;
  updateTimeMetrics();
  verticalSelector.hidden = step < 6;
  tideClock.hidden = step < 6 || config.ocean?.tideMode === 'off' || !config.ocean;
  if (!tideClock.hidden) { const instant = Date.parse(config.ocean.startUtc) + (results?.time ?? 0) * 1000; tideClock.textContent = Number.isFinite(instant) ? new Date(instant).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : ''; }
  view.resize();
  const sectionRange = view.companion?.range;
  if (sectionRange) sectionContourControls.update(colorKey, { ...sectionRange, label: LABELS[sectionRange.variable], canvas: $('#sectionCanvas'), palette: (variable = sectionRange.variable, settings = view.sectionColorSettings) => view.palette(variable, settings) }, [0, 2, 3, 6].includes(step) && !(step === 3 && config.boundary[side].mode === 'closed'));
  else sectionContourControls.element.hidden = true;
  pinSeries.update(step === 6, worker, results?.time, field, layer, view.depth);
  if (step === 6) updateRunTideChart.setTime(results?.time ?? 0, running ? '計算中' : results?.outcome === 'completed' ? '計算終了' : pausedRun ? '停止中' : '計算時刻');
}
let completedSettings, confirmingResultReset = false;
function calculationSettings(value) {
  const { name, particles, ...conditions } = value;
  return JSON.stringify(conditions);
}
function discardCompletedRun() {
  completedSettings = undefined;
  worker?.terminate(); worker = undefined; results = undefined; particleBase = undefined;
}
function refresh() {
  // UI-only changes must not destroy the worker's final state used by step 08.
  if (completedSettings && worker && !running) {
    if (confirmingResultReset) return;
    if (calculationSettings(config) === calculationSettings(completedSettings)) {
      draw(); updateActions(); updateSaveStatus(); icons(); return;
    }
    confirmingResultReset = true;
    confirmRun('計算結果をリセットしますか？', '計算条件が変更されました。リセットすると完了した計算結果と追加実験の結果を破棄します。停止・工程の移動では結果は破棄しません。', 'リセットする').then(accepted => {
      confirmingResultReset = false;
      if (accepted) { discardCompletedRun(); renderForm(); refresh(); }
      else {
        const { name, particles } = config;
        config = { ...structuredClone(completedSettings), name, particles };
        terrainHistory.length = terrainFuture.length = initialHistory.length = initialFuture.length = windHistory.length = windFuture.length = boundaryHistory.length = boundaryFuture.length = riverHistory.length = riverFuture.length = 0;
        layer = Math.min(layer, config.grid.nz - 1);
        renderForm(); draw(); updateSaveStatus();
      }
    });
    return;
  }
  particleTiming = undefined;
  particleBase = undefined;
  runProgress = pausedRun ? { done: pausedRun.results.step, total: pausedRun.config.numerics.maxSteps } : undefined;
  particleResults = undefined; particleRecords = []; particleStatus = ''; particlePlacing = false; particleIssue = '';
  invalidRivers = [];
  const context = JSON.stringify([config.grid, config.initial, config.ecosystem]);
  if (boundaryContext !== context) { boundaryHistory.length = boundaryFuture.length = 0; boundaryStroke = false; boundaryBrush = 'inspect'; boundaryContext = context; if ($('#boundaryBrush')) $('#boundaryBrush').value = 'inspect'; }
  if (worker !== pausedRun?.worker) worker?.terminate(); worker = undefined;
  results = undefined;
  $('#resultButton').disabled = true;
  $('#modelTime').textContent = '0 s';
  $('#iterations').textContent = '0';
  $('#convergence').textContent = '未計算';
    $('#phaseText').textContent = '条件設定';
    $('#solverStatus').textContent = 'ROMS実行待ち';
  $('#runLog').textContent = '';
  if (pausedRun) { $('#modelTime').textContent = (pausedRun.results.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = pausedRun.results.step.toLocaleString(); }
  errors = validate(config);
  let warnings = [];
  if (!errors.length) {
    try { fields = buildFields(config); syncBoundaryDefaults(config, fields); warnings = inspect(config, fields); results = undefined; $('#resultButton').disabled = true; draw(); }
    catch (error) {
      errors = [error.message];
      // Invalid river mouths must not prevent editing the updated terrain.
      if (config.rivers.length) {
        try { fields = buildFields({ ...config, rivers: [] }); invalidRivers = invalidRiverIndices(fields, config.rivers); draw(); }
        catch { /* Keep the validation error if the grid itself is invalid. */ }
      }
    }
  }
  const validation = $('#validation'); validation.replaceChildren();
  validation.closest('.review').hidden = true;
  checkMessages = warnings.map(text => ({ type: 'warning', text }));
  showErrors(errors);
  if (fields) { $('#wetCount').textContent = fields.wetCount.toLocaleString(); $('#domainSize').textContent = ((fields.nx - 2) * fields.dx / 1000).toFixed(0) + ' × ' + ((fields.ny - 2) * fields.dy / 1000).toFixed(0) + ' km'; $('#layerMetric').textContent = fields.nz + ' 層'; $('#slopeMetric').textContent = fields.rFactor.toFixed(3); }
  $('#gridSummary').textContent = config.grid.nx + ' × ' + config.grid.ny + ' × ' + config.grid.nz;
  updateActions(); updateSaveStatus(); icons();
}
function navigate(index) {
  if (!running && particleBase) {
    if (index !== 7) { results = particleBase.results; fields = particleBase.fields; $('#iterations').textContent = results.step.toLocaleString(); }
    else if (particleResults?.state) { results = { ...particleResults, outcome: 'completed' }; fields = { ...particleBase.fields, ...particleResults.state }; }
  }
  if (step === 0 && index > 0 && invalidRivers.length) {
    const removed = invalidRivers.map(i => i + 1);
    config.rivers = config.rivers.filter((_, i) => !invalidRivers.includes(i));
    view.selectedRiver = undefined; refresh();
    toast(`地形に合わない河川 ${removed.join('、')} を除外しました。地形は変更していません。`);
    if (errors.length) return;
  }
  step = index; particlePlacing = particleDeleting = false; brush = initialBrush = windBrush = boundaryBrush = 'inspect'; boundaryStroke = false; if ([0, 4].includes(step)) field = 'h'; if (step === 2) field = editVariable; if (step >= 6 && field === 'h') field = 'temp'; if ([2, 3, 6, 7].includes(step)) { mode = '3d'; $('#vectorToggle').checked = false; } renderForm(); draw(); view.resize(); updateSaveStatus();
  for (const element of [$('.settings'), $('#settingsForm'), $('.workspace')]) element.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}
$('#settingsForm').onsubmit = event => event.preventDefault();
$('#settingsForm').addEventListener('input', event => {
  const path = event.target.dataset.path;
  if (running || event.target.type !== 'range' || !['wind.speed', 'initial.mixing'].includes(path)) return;
  set(path, event.target.valueAsNumber);
  if (path === 'wind.speed') { delete config.wind.legacyStress; config.wind.edits = {}; windHistory.length = windFuture.length = 0; $('#windSpeedOutput').textContent = config.wind.speed.toFixed(1) + ' m/s'; }
  else { config.initial.anchors = {}; config.initial.painted = {}; initialHistory.length = initialFuture.length = 0; event.target.closest('label').querySelector('output').textContent = Math.round(config.initial.mixing * 100) + '%'; }
  refresh();
});
document.addEventListener('change', async event => {
  if (renderingForm) return;
  if (!event.target.closest('#settingsForm,#editToolOptions') || running) return;
  const path = event.target.dataset.path;
  if(['grid.nx','grid.ny'].includes(path)&&(config.grid.geoSource||config.grid.domainCrop||config.grid.terrainResampling)) {
    const value=event.target.valueAsNumber;
    if(value===config.grid[path.slice(5)])return;
    try {
      await withInterpolation(async()=>{
        const snapshot=JSON.stringify(config);
        const resized=resizeTerrainGrid(config.grid,path==='grid.nx'?value:config.grid.nx,path==='grid.ny'?value:config.grid.ny);
        const grid=await rebuildTerrainGrid(resized,text=>{const node=$('#interpolationStatus strong');if(node)node.textContent=text;});
        if(JSON.stringify(config)!==snapshot||running||exporting)throw new Error('条件が変更されたため地形の変更を中止しました。');
        applySettingsChange(event,grid);
      },{title:'地形を再補完中…',description:'新しい格子に合わせて陸海と水深を照合しています。'});
    }catch(error){toast(error.message);renderForm();}
    return;
  }
  const biologyClimate = (path === 'ecosystem.distribution' && event.target.value === 'climatology') || (['ecosystem.carbonChl', 'ecosystem.zooRatio', 'ecosystem.detritusRatio'].includes(path) && config.ecosystem.distribution === 'climatology');
  const windClimate = (path === 'wind.pattern' && event.target.value === 'climatology') || (['wind.climate', 'wind.reference'].includes(path) && config.wind?.pattern === 'climatology');
  if (!biologyClimate && !windClimate) return applySettingsChange(event);
  try {
    await withInterpolation(async () => {
      if (biologyClimate && climateBounds(config)) {
        const season = config.initial.regionalSeason ?? 'annual';
        const original = JSON.stringify(config), profile = await acquireGlobalClimate(config, season);
        if (JSON.stringify(config) !== original) throw new Error('条件が変更されたため取得結果を適用しませんでした。');
        config.climatology ??= {}; config.climatology.globalProfile = profile;
      }
      applySettingsChange(event);
    }, biologyClimate
      ? { title: '生物濃度を計算中…', description: '気候値から生物濃度を推定し、格子・実深度に合わせています。' }
      : { title: '風の気候値を計算中…', description: 'NOAAの気候値を参照し、風の分布を格子に合わせています。' });
  } catch (error) { toast(error.message); renderForm(); }
});
function applySettingsChange(event,preparedGrid) {
  if (!event.target.closest('#settingsForm,#editToolOptions')) return;
  const path = event.target.dataset.path; if (!path || running) return;
  if (path.startsWith('rivers.')) recordRiverEdit();
  if (path.startsWith('boundary.')) { recordBoundaryEdit(); boundaryBrush = 'inspect'; boundaryStroke = false; }
  const value = event.target.type === 'checkbox' ? event.target.checked : path === 'ecosystem.enabled' ? event.target.value === 'true' : ['number', 'range'].includes(event.target.type) ? event.target.valueAsNumber : event.target.value;
  if (Object.is(path.split('.').reduce((value, key) => value?.[key], config), value)) return;
  let resizedGrid;
  if(['grid.nx','grid.ny'].includes(path)&&(config.grid.geoSource||config.grid.domainCrop||config.grid.terrainResampling)){
    try{resizedGrid=preparedGrid??resizeTerrainGrid(config.grid,path==='grid.nx'?value:config.grid.nx,path==='grid.ny'?value:config.grid.ny);}
    catch(error){toast(error.message);renderForm();return;}
    terrainHistory.push({domainConfig:structuredClone(config)});terrainFuture.length=0;
    if(terrainHistory.length>100)terrainHistory.shift();
  }
  if (path.startsWith('particles.')) {
    set(path, value);
    if (!path.endsWith('.color')) { particleResults = undefined; particleRecords = []; particleSourceIndex = undefined; particleStatus = ''; }
    renderForm(); draw(); updateSaveStatus();
    if (path.endsWith('.color') && particleResults) { $('#particleDownload').disabled = true; worker?.postMessage({ type: 'particles-recolor', requestId: ++particleColorRequest, sources: structuredClone(config.particles.sources) }); }
    return;
  }
  if (path === 'grid.nz' && Number.isInteger(value) && value >= 2 && value <= 15) { resizeLayers(config, value); layer = value - 1; }
  else if (path === 'grid.preset') applyTerrainPreset(config, value);
  else if (resizedGrid) config.grid=resizedGrid;
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
  if (['grid.nx', 'grid.ny'].includes(path)&&!resizedGrid) fitTerrainSpacing(config.grid);
  if (path.startsWith('grid.')) { brush = 'inspect'; if(!resizedGrid)terrainHistory.length = terrainFuture.length = 0; if (config.climatology) config.climatology.stale = true; }
  if (['grid.nx', 'grid.ny', 'grid.preset'].includes(path)) {
    if(!resizedGrid){config.grid.edits={};config.grid.geoBounds=null;config.grid.geoSource=null;delete config.grid.contourInterpolation;delete config.grid.importedUncoveredCells;delete config.grid.coastline;delete config.grid.domainCrop;delete config.grid.terrainResampling;}
    config.rivers=[];config.initial.painted={};delete config.initial.imported;for(const b of Object.values(config.boundary))b.painted={};
    if(resizedGrid)delete config.particles;
  }
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
  if (path.startsWith('boundary.') && path.endsWith('.mode') && ['specified', 'open'].includes(value)) seedBoundary(config, buildFields(config), side);
  if (path.startsWith('boundary.') && path.endsWith('.mode')) { const opposite = { west: 'east', east: 'west', north: 'south', south: 'north' }[side]; delete config.boundary[side].autoClosed; if (value !== 'specified') config.boundary[side].fromInitial = false; if (value === 'periodic' || config.boundary[opposite].mode === 'periodic') { config.boundary[opposite].mode = value; config.boundary[opposite].fromInitial = value === 'specified'; delete config.boundary[opposite].autoClosed; } }
  renderForm();
  refresh();
}
document.querySelectorAll('.steps [data-step]').forEach(button => button.onclick = () => navigate(+button.dataset.step));
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { mode = button.dataset.view; draw(); });
$('#previousButton').onclick = () => navigate(Math.max(0, step - 1));
$('#nextButton').onclick = () => navigate(Math.min(7, step + 1));
$('#fieldSelect').onchange = event => { field = event.target.value; if (step === 7 && field === 'h') mode = '3d'; draw(); };
$('#layerSelect').onchange = event => { layer = +event.target.value; draw(); };
$('#vectorToggle').onchange = () => draw();
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
$('#projectName').onchange = event => { config.name = event.target.value; updateSaveStatus(); };
$('#saveButton').onclick = () => { if (!errors.length) download('webroms-project.json', config, true); };
$('#exportButton').onclick = () => { if (!errors.length) download('webroms-arrays.json', preparedData(config, buildFields(config))); };
$('#importButton').onclick = () => $('#importFile').click();
$('#importFile').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  if ((completedSettings || pausedRun) && !await confirmRun('計算結果をリセットして開きますか？', '設定ファイルを開くと、現在の計算場と追加実験の結果を破棄します。', 'リセットして開く')) { event.target.value = ''; return; }
  savedSettings = null; savedSettingsName = '';
  boundaryContext = undefined;
  try { if (file.size > 50e6) throw new Error('設定ファイルは50 MB以下にしてください。'); const source = JSON.parse(await file.text()); const loaded = { ...defaults(), ...source, numerics: { ...defaults().numerics, ...source.numerics, calculateDiffusion: source.numerics?.calculateDiffusion ?? false } }; const issues = validate(loaded); if (issues.length) throw new Error(issues[0]); buildFields(loaded); discardPausedRun(); discardCompletedRun(); config = loaded; $('#projectName').value = config.name; layer = config.grid.nz - 1; terrainHistory.length = terrainFuture.length = initialHistory.length = initialFuture.length = windHistory.length = windFuture.length = 0; navigate(0); refresh(); toast('設定を読み込みました。'); }
  catch (error) { showErrors([error.message]); toast('読み込めません: ' + error.message); }
  finally { event.target.value = ''; }
};
$('#resetButton').onclick = () => $('#resetDialog').showModal();
$('#cancelReset').onclick = () => $('#resetDialog').close();
$('#confirmReset').onclick = () => { discardPausedRun(); discardCompletedRun(); savedSettings = null; savedSettingsName = ''; boundaryContext = undefined; config = defaults(); layer = config.grid.nz - 1; terrainHistory.length = terrainFuture.length = initialHistory.length = initialFuture.length = windHistory.length = windFuture.length = 0; $('#projectName').value = config.name; $('#resetDialog').close(); navigate(0); refresh(); };
function discardPausedRun() { if (pausedRun?.worker !== worker) pausedRun?.worker.terminate(); pausedRun = undefined; }
function confirmRun(title, explanation, acceptLabel) {
  if ($('#runConfirmDialog')) return Promise.resolve(false);
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.id = 'runConfirmDialog'; dialog.setAttribute('aria-labelledby', 'runConfirmTitle');
    const heading = document.createElement('h2'); heading.id = 'runConfirmTitle'; heading.textContent = title;
    const note = document.createElement('p'); note.textContent = explanation;
    const actions = document.createElement('div'); actions.className = 'fields';
    const cancel = document.createElement('button'); cancel.textContent = 'キャンセル';
    const accept = document.createElement('button'); accept.className = 'recalculate-action'; accept.textContent = acceptLabel ?? (title.startsWith('再計算') ? '再計算する' : '計算を再開する');
    let accepted = false;
    cancel.onclick = () => dialog.close(); accept.onclick = () => { accepted = true; dialog.close(); };
    dialog.onclose = () => { dialog.remove(); resolve(accepted); };
    actions.append(cancel, accept); dialog.append(heading, note, actions); document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}
async function resumeCalculation() {
  if (running || exporting || !pausedRun) return;
  const changed = JSON.stringify(config) !== JSON.stringify(pausedRun.config);
  if (changed && !await confirmRun('中止時の条件で計算を再開しますか？', '変更した条件は中止時の条件に戻します。停止した計算場とモデル時刻から、元の目標ステップ数まで計算を続けます。')) return;
  const saved = pausedRun;
  config = structuredClone(saved.config); runConfig = structuredClone(saved.config); worker = saved.worker; results = saved.results; fields = saved.fields;
  runProgress = { done: results.step, total: runConfig.numerics.maxSteps }; pausedRun = undefined;
  particleBase = undefined; particleTiming = undefined; particleResults = undefined; particleRecords = [];
  errors = validate(config); checkMessages = inspect(config, fields).map(text => ({ type: 'warning', text }));
  showErrors(errors);
  if (changed) { terrainHistory.length = terrainFuture.length = initialHistory.length = initialFuture.length = windHistory.length = windFuture.length = boundaryHistory.length = boundaryFuture.length = riverHistory.length = riverFuture.length = 0; boundaryContext = undefined; }
  $('#gridSummary').textContent = config.grid.nx + ' × ' + config.grid.ny + ' × ' + config.grid.nz;
  $('#wetCount').textContent = fields.wetCount.toLocaleString(); $('#layerMetric').textContent = fields.nz + ' 層'; $('#slopeMetric').textContent = fields.rFactor.toFixed(3);
  $('#domainSize').textContent = ((fields.nx - 2) * fields.dx / 1000).toFixed(0) + ' × ' + ((fields.ny - 2) * fields.dy / 1000).toFixed(0) + ' km';
  layer = Math.min(layer, config.grid.nz - 1); $('#projectName').value = config.name;
  running = true; stopping = false; results.outcome = 'running'; $('#convergence').textContent = '計算中'; $('#resultButton').disabled = true;
  $('#modelTime').textContent = (results.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = results.step.toLocaleString();
  renderForm(); draw(); $('#solverStatus').textContent = '中止した計算場から再開しています。潮汐のモデル時刻も引き継ぎます。';
  worker.postMessage({ type: 'resume' });
}
function finishRun(message, keepRuntime = false) { running = false; stopping = false; if (particleRunning) { particleRunning = false; particleStatus = message; } if (!keepRuntime) { discardPausedRun(); worker?.terminate(); worker = undefined; } $('#resultButton').disabled = !worker; $('#solverStatus').textContent = message; $('#phaseText').textContent = results?.outcome === 'completed' ? '計算完了' : '計算停止'; renderForm(); pinSeries.update(step === 6, worker, results?.time, field, layer, view.depth); }
function startOrStop(recalculate = false) {
  if (running) { if (stopping) return; stopping = true; worker?.postMessage({ type: 'cancel-run' }); renderForm(); $('#solverStatus').textContent = '安全なステップ区切りで停止しています。'; return; }
  if (exporting) return;
  if (recalculate !== true && (pausedRun || results?.outcome === 'completed')) { confirmRun('再計算しますか？', '現在の条件で初期場から計算し直し、現在の計算場を破棄します。').then(accepted => { if (accepted) startOrStop(true); }); return; }
  if (errors.length) return;
  try { ensureOcean(config); prepareForcing(config, buildFields(config)); } catch (error) { showErrors([error.message]); toast(error.message); $('#solverStatus').textContent = error.message; return; }
  if (!biologyExecutable(config)) { toast('Fennelの計算用WASMは未対応です。NPZDまたはNEMUROを選択してください。'); return; }
  discardPausedRun(); discardCompletedRun();
  particleResults = undefined; particleRecords = []; particleStatus = ''; particlePlacing = false;
  particleTiming = undefined;
  particleBase = undefined;
  running = true; runConfig = structuredClone(config); results = undefined;
  runProgress = { done: 0, total: runConfig.numerics.maxSteps };
  $('#modelTime').textContent = '0 s'; $('#iterations').textContent = '0'; $('#convergence').textContent = '計算中'; $('#runLog').textContent = ''; $('#phaseText').textContent = '条件設定'; $('#resultButton').disabled = true;
  renderForm(); $('#solverStatus').textContent = 'ROMS実行核を起動中';
  worker = new Worker(new URL('./runtime/roms-worker.js', import.meta.url), { type: 'module' });
  worker.onerror = async event => { try { await exportWriter?.abort(); } catch {} exportWriter = null; exportTarget = null; if (exporting) { setExportBusy(false); $('#exportSummary').textContent = '実行核エラー: ' + event.message; } if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; finishRun('実行核でエラーが発生しました: ' + event.message); $('#downloadResults').disabled = !worker; };
  worker.onmessage = ({ data }) => {
    if (data.type.startsWith('particles-')) { handleParticleMessage(data); return; }
    if (data.type === 'pin-series') { pinSeries.receive(data); return; }
    if (data.type.startsWith('export-')) { handleExportMessage(data); return; }
    if (data.type === 'status') $('#solverStatus').textContent = data.message;
    if (data.type === 'progress') {
      runProgress = { done: data.step, total: runConfig.numerics.maxSteps };
      results = { ...data, outcome: 'running' }; fields = { ...fields, ...data.state }; $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString(); $('#solverStatus').textContent = '計算ステップ ' + data.step.toLocaleString() + ' / ' + runConfig.numerics.maxSteps.toLocaleString(); draw();
      worker?.postMessage({ type: 'progress-ack' });
    }
    if (data.logs) $('#runLog').textContent = data.logs.join('\n');
    if (data.type === 'complete' || data.type === 'stopped') {
      results = { ...data, outcome: data.type === 'stopped' ? 'cancelled' : 'completed' };
      fields = { ...fields, ...data.state }; runProgress = { done: data.step, total: runConfig.numerics.maxSteps };
      $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString();
      if (data.type === 'stopped') {
        pausedRun = { worker, config: structuredClone(runConfig), results, fields };
        $('#convergence').textContent = '中断'; finishRun('計算を中止しました。この計算場・モデル時刻から再開できます。', true);
      } else { pausedRun = undefined; completedSettings = structuredClone(config); $('#convergence').textContent = '完了'; finishRun('指定した ' + data.step.toLocaleString() + ' ステップの計算が完了しました。', true); }
      draw();
    }
    if (data.type === 'error') { if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; showErrors([data.message], '計算エラー'); finishRun(data.message); }
  };
  worker.postMessage({ type: 'run', config: runConfig });
}
$('#resultButton').onclick = () => {
  if (step === 7 && particleBase) navigate(6);
  if (running || exporting) return;
  if (!worker || !results) { toast('計算終了後に保存できます。'); return; }
  $('#exportLayer').replaceChildren(...Array.from({ length: runConfig.grid.nz }, (_, i) => new Option(i === 0 ? '表層' : i === runConfig.grid.nz - 1 ? '底層' : `第${i + 1}層`, runConfig.grid.nz - i - 1)));
  updateExportSummary();
  $('#resultsDialog').showModal();
};
function updateExportSummary() {
  $('#exportLayerField').hidden = $('#exportFormat').value !== 'shape';
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
  if (event.target.value !== 'custom') { $('#exportHours').value = event.target.value; if (+event.target.value >= 336 && $('#exportFormat').value === 'netcdf') $('#exportFormat').value = 'netcdf-series'; updateExportSummary(); }
};
$('#exportHours').addEventListener('input', () => { $('#exportDurationPreset').value = 'custom'; });
$('#closeResults').onclick = () => $('#resultsDialog').close();
$('#resultsDialog').addEventListener('cancel', event => { if (exporting) event.preventDefault(); });
$('#cancelExport').onclick = () => { worker?.postMessage({ type: 'cancel-export' }); $('#cancelExport').disabled = true; };
function setExportBusy(busy) {
  if (busy) runProgress = { done: 0, total: 1 };
  exporting = busy;
  $('#resultsDialog').querySelectorAll('input, select').forEach(input => { input.disabled = busy; });
  $('#closeResults').disabled = busy; $('#downloadResults').disabled = busy || !worker;
  $('#cancelExport').hidden = !busy; $('#cancelExport').disabled = false;
  $('#resultButton').disabled = busy || !worker;
  renderForm();
}
async function handleExportMessage(data) {
  if (data.type === 'export-chunk') {
    try { if (!exportWriter) throw new Error('保存先が閉じられました。'); await exportWriter.write(data.bytes); worker?.postMessage({ type: 'export-chunk-ack' }); }
    catch (error) { worker?.postMessage({ type: 'export-chunk-ack', error: error.message }); }
    return;
  }
  if (data.type === 'export-progress') { runProgress = { done: data.done, total: data.total }; $('#exportSummary').textContent = `保存用追加RUN：${data.done.toLocaleString()} / ${data.total.toLocaleString()} ステップ`; updateRunBadge(); icons(); return; }
  if (data.type === 'export-writing') { $('#exportSummary').textContent = '保存ファイルを作成中…'; $('#cancelExport').disabled = true; return; }
  if (data.type === 'export-complete' && runProgress) runProgress.done = runProgress.total;
  if (data.state) {
    particleBase = undefined; particleTiming = undefined; particleResults = undefined; particleRecords = [];
    results = { step: data.step, time: data.time, state: data.state, outcome: 'completed' };
    fields = { ...fields, ...data.state };
    if (pausedRun?.worker === worker) {
      if (data.step < pausedRun.config.numerics.maxSteps) { results.outcome = 'cancelled'; pausedRun.results = results; pausedRun.fields = fields; }
      else pausedRun = undefined;
    }
    $('#modelTime').textContent = (data.time / 3600).toFixed(2) + ' h'; $('#iterations').textContent = data.step.toLocaleString(); draw();
  }
  if (data.type === 'export-error' && !data.ready) { discardPausedRun(); worker?.terminate(); worker = undefined; if (results) results.outcome = 'error'; $('#convergence').textContent = 'エラー'; $('#phaseText').textContent = '計算停止'; $('#solverStatus').textContent = data.message; }
  if (data.type === 'export-error') { try { await exportWriter?.abort(); } catch {} exportWriter = null; exportTarget = null; setExportBusy(false); $('#exportSummary').textContent = data.message; return; }
  $('#solverStatus').textContent = `追加RUN後の状態を保持しています（累計 ${data.step.toLocaleString()} ステップ）。`;
  if (data.type === 'export-cancelled') { try { await exportWriter?.abort(); } catch {} exportWriter = null; exportTarget = null; setExportBusy(false); $('#exportSummary').textContent = '保存用RUNを中断しました。結果データは保存していません。次のRUNは中断時点から再開します。'; return; }
  try {
    if (!exportTarget) throw new Error('保存先が指定されていないため出力を破棄しました。');
    $('#cancelExport').disabled = true;
    if (data.streamed) { if (!exportWriter) throw new Error('保存先がありません。'); await exportWriter.close(); }
    else await writeToTarget(exportTarget, data.bytes);
    $('#exportSummary').textContent = `保存先：${exportTarget.name}。${data.count}時刻（${data.start} ～ ${data.time} s）。`;
  } catch (error) { try { await exportWriter?.abort(); } catch {} $('#exportSummary').textContent = '保存できません：' + error.message; }
  finally { exportWriter = null; exportTarget = null; setExportBusy(false); }
}
$('#downloadResults').onclick = async () => {
  if (exporting) return;
  const hours = $('#exportHours').valueAsNumber, interval = $('#exportInterval').valueAsNumber, format = $('#exportFormat').value;
  try { if (!worker || !results) throw new Error('先に計算を実行してください。'); exportPlan(runConfig, hours, interval, format, results.step); }
  catch (error) { toast(error.message); return; }
  setExportBusy(true); $('#cancelExport').disabled = true;
  try {
    exportTarget = await chooseSaveTarget('webroms-results.' + (format === 'netcdf' ? 'nc' : 'zip'));
    if (!exportTarget) { setExportBusy(false); $('#exportSummary').textContent = '保存先未指定のため追加RUN・保存は行いません。'; return; }
    if (format !== 'netcdf') exportWriter = await exportTarget.createWritable();
    $('#cancelExport').disabled = false;
    $('#exportSummary').textContent = `保存先：${exportTarget.name}。保存用追加RUNを開始…`;
    worker.postMessage({ type: 'export', hours, interval, format, layer: Number($('#exportLayer').value) });
  } catch (error) { exportTarget = null; setExportBusy(false); $('#exportSummary').textContent = error.message; }
};
renderForm(); refresh(); view.resize();
