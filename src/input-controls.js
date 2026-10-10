import { ensureOcean, tideRequest, validateTidePackage, parseCorrection, prepareForcing, gridSignature } from './ocean-boundary.js';
import { fillCorrectionCells } from './ocean-controls.js';
import { readGeographicNetcdf, resampleInitial } from './geographic-io.js';
import { importSeaLevel, exportSeaLevel } from './shape-io.js';
import { initialNetcdf } from './initial-export.js';
import { chooseSaveTarget, writeToTarget, settingsJson } from './explicit-save.js';
import { buildFields } from './model.js';
import { seedBoundary } from './boundary-initial.js';
import { loadBundledMdt, resampleMdt, mdtSignature } from './bundled-mdt.js';
import { boundsOf } from './ocean-boundary.js';
let mdtLoadRevision = 0;

export function bindInputControls(config, fields, { commit, message, initialHistory, boundaryHistory, isBusy = () => false }) {
  const $ = id => document.getElementById(id);
  const bind = (id, event, action) => { if ($(id)) $(id).addEventListener(event, async e => { try { await action(e); } catch (error) { message(error.message); } }); };
  const save = async (name, produce) => { const target = await chooseSaveTarget(name); if (!target) return; await writeToTarget(target, await produce()); message(`保存先：${target.name}`); };
  const ocean = () => ensureOcean(config);
  bind('tideEnabled', 'change', e => { ocean().tideMode = e.target.checked ? 'auto' : 'off'; commit(); });
  const reseed = () => { const f = buildFields(config); for (const side of ['west', 'east', 'south', 'north']) if (!['closed', 'periodic'].includes(config.boundary[side].mode)) seedBoundary(config, f, side); };
  const applyMdt = async () => {
    const signature = mdtSignature(config), revision = ++mdtLoadRevision, previousSurface = config.initial.painted;
    message('同梱MDTを読み込み・補間しています。');
    const atlas = await loadBundledMdt();
    if (revision !== mdtLoadRevision) return;
    if (isBusy()) throw new Error('計算中はMDTを変更できません。終了後に再適用してください。');
    if (signature !== mdtSignature(config)) throw new Error('読込中に地形が変更されました。再度適用してください。');
    if (previousSurface !== config.initial.painted) throw new Error('読込中に初期場が変更されました。再度適用してください。');
    const result = resampleMdt(atlas, config, buildFields(config));
    const candidate = structuredClone(config); candidate.initial.painted = { ...candidate.initial.painted, ...result.painted }; buildFields(candidate);
    initialHistory(); config.initial.painted = { ...config.initial.painted, ...result.painted };
    ocean().seaLevel = result.metadata; ocean().seaLevelEnabled = true;
    reseed(); commit(); message(`MDTを適用しました。拡散外挿 ${result.metadata.interpolatedCells}、周辺値 ${result.metadata.nearbyIndices.length}、0 m補完 ${result.metadata.zeroIndices.length} セル。`);
  };
  bind('applyBundledMdt', 'click', applyMdt);
  bind('seaLevelEnabled', 'change', async e => {
    if (e.target.checked && boundsOf(config) && (!ocean().seaLevel || ocean().seaLevel.bundled && ocean().seaLevel.gridSignature !== mdtSignature(config))) {
      try { await applyMdt(); } catch (error) { e.target.checked = false; ocean().seaLevelEnabled = false; commit(); throw error; }
    } else { mdtLoadRevision++; ocean().seaLevelEnabled = e.target.checked; commit(); }
  });
  bind('oceanStart', 'change', e => { ocean().startUtc = e.target.value + ':00Z'; commit(); });
  bind('tideRequest', 'click', () => save('webroms-tide-request.json', () => settingsJson(tideRequest(config, fields))));
  bind('tideImport', 'change', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 100e6) throw new Error('潮汐データは100 MB以下にしてください。');
    const data = validateTidePackage(JSON.parse(await file.text()), config, buildFields(config));
    ocean().tides = data; ocean().startUtc = data.epoch; ocean().tideMode = 'auto';
    for (const b of Object.values(config.boundary)) if (b.mode === 'specified') b.mode = 'open';
    commit(); message('潮汐を読み込みました。海の指定境界を開放接続に変更しました。');
  });
  bind('openBoundaries', 'click', () => { boundaryHistory(); for (const b of Object.values(config.boundary)) if (b.mode === 'specified') b.mode = 'open'; commit(); });
  bind('initialNetcdfExport', 'click', () => save('webroms-initial.nc', () => initialNetcdf(config)));
  bind('seaLevelNetcdf', 'click', () => save('webroms-sea-level.nc', () => initialNetcdf(config, true)));
  bind('seaLevelShape', 'click', () => save('webroms-sea-level.zip', () => exportSeaLevel(config, buildFields(config))));
  bind('initialNetcdfImport', 'change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const time = $('initialTimeIndex').valueAsNumber, extend = $('initialDepthPolicy').value === 'extend', signature = gridSignature(config);
    const source = readGeographicNetcdf(await file.arrayBuffer(), time);
    if (signature !== gridSignature(config)) throw new Error('読込中に地形が変更されました。再度読み込んでください。');
    const result = resampleInitial(source, config, buildFields(config), { extend });
    initialHistory(); config.initial.painted = { ...config.initial.painted, ...result.painted }; config.initial.imported = { ...result.metadata, file: file.name };
    delete config.climatology; delete config.initial.regionalSeason;
    reseed(); commit(); message('初期場を緯度経度・実深度で補間しました。');
  });
  bind('seaLevelImport', 'change', async e => {
    const file = e.target.files[0]; if (!file) return;
    const kind = $('seaLevelKind').value;
    let result;
    if (/\.zip$/i.test(file.name)) result = await importSeaLevel(file, config, buildFields(config));
    else {
      const source = readGeographicNetcdf(await file.arrayBuffer());
      if (!source.attributes.vertical_datum || source.attributes.tide_included !== 'false') throw new Error('vertical_datum と tide_included="false" が必要です。潮汐の二重加算を防ぎます。');
      result = resampleInitial(source, config, buildFields(config), { seaLevelOnly: true });
      result.metadata.datum = source.attributes.vertical_datum;
    }
    if (result.metadata.datum === 'model-reference' && kind !== 'model') throw new Error('MDT / ADTには物理的な基準面が必要です。モデル基準面の出力はMDTとして扱えません。');
    const candidate = structuredClone(config); candidate.initial.painted = { ...candidate.initial.painted, ...result.painted }; buildFields(candidate);
    initialHistory(); config.initial.painted = { ...config.initial.painted, ...result.painted };
    ocean().seaLevel = { kind, datum: result.metadata.datum, source: result.metadata.source ?? file.name, file: file.name };
    reseed(); commit(); message('海面高度を初期場と開境界の基準値へ反映しました。');
  });
  if ($('correctionCell')) fillCorrectionCells($('correctionCell'), config, fields);
  bind('correctionTemplate', 'click', () => {
    const start = Date.parse(ocean().startUtc), interval = Number($('correctionInterval').value);
    $('correctionValues').value = Array.from({ length: 24 / interval + 1 }, (_, i) => `${new Date(start + i * interval * 3600000).toISOString().replace('.000Z', 'Z')},0`).join('\n');
  });
  bind('applyCorrection', 'click', () => {
    if (!$('correctionCell').value) throw new Error('補正できる海上の境界セルがありません。');
    const correction = parseCorrection($('correctionValues').value, { cell: Number($('correctionCell').value), kind: $('correctionKind').value, datumOffsetCm: $('correctionDatum').valueAsNumber, radiusKm: $('correctionRadius').valueAsNumber });
    const candidate = structuredClone(config); ensureOcean(candidate).corrections.push(correction);
    prepareForcing(candidate, buildFields(candidate));
    ocean().corrections.push(correction); commit(); message('潮位補正を適用しました。');
  });
  document.querySelectorAll('[data-remove-correction]').forEach(button => button.onclick = () => { ocean().corrections.splice(Number(button.dataset.removeCorrection), 1); commit(); });
}
