import { buildFields, BIO_MODELS, biologyTracers, validate } from './model.js';
import { heatSettings, surfaceHeatFlux } from './heat-forcing.js';
import { buildWind, rotationCoefficients } from './forcing.js';
import { resolvedBoundaries } from './boundary-initial.js';
import { settingsJson } from './explicit-save.js';
import { tideSource } from './ocean-boundary.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';

const labels = {
  'grid.nx': ['X格子数（境界含む）', ''], 'grid.ny': ['Y格子数（境界含む）', ''],
  'grid.nz': ['鉛直層数', ''], 'grid.dx': ['X格子間隔', 'm'], 'grid.dy': ['Y格子間隔', 'm'],
  'grid.minDepth': ['最小水深', 'm'], 'grid.maxDepth': ['最大水深', 'm'],
  'grid.editDepth': ['地形の編集量（未指定時は最小水深）', 'm'],
  'numerics.dt': ['時間刻み', 's'], 'numerics.maxSteps': ['通常RUNの指定ステップ数', ''],
  'numerics.horizontalDiffusion': ['水平拡散・粘性係数', 'm2/s'],
  'numerics.verticalDiffusion': ['固定鉛直拡散・粘性係数（GLS時は不使用）', 'm2/s'],
  'numerics.calculateDiffusion': ['GLS鉛直混合', ''],
  'initial.tempSurface': ['表面水温の設定値', 'degC'], 'initial.tempBottom': ['底面水温の設定値', 'degC'],
  'initial.saltSurface': ['表面塩分の設定値', ''], 'initial.saltBottom': ['底面塩分の設定値', ''],
  'initial.mixing': ['模擬成層の混合強度', '0-1'],
  'ecosystem.shortwave': ['生物反応用短波放射（海面の正味熱フラックスではない）', 'W/m2'],
  'heat.mode': ['熱交換方式（off / air / flux、排他選択）', ''],
  'heat.airTemperature': ['気温（air時のみ）', 'degC'], 'heat.exchangeCoefficient': ['簡易熱交換係数（air時のみ）', 'W/(m2 K)'],
  'heat.netFlux': ['正味海面熱フラックス（flux時のみ、正は加熱）', 'W/m2']
};

export function chunksOfText(text, size = 16000) {
  const chunks = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + size, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push(text.slice(i, end)); i = end;
  }
  return chunks;
}

function flatten(value, prefix = '', rows = []) {
  if (value && typeof value === 'object') {
    if (Object.keys(value).length > 32 && Object.values(value).every(v => typeof v === 'number')) {
      rows.push([prefix, '数値配列・格子編集値', Object.keys(value).length, '要素', '完全設定JSONシートに全値を収録']);
    } else for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, rows);
  } else {
    const [label, unit] = labels[prefix] ?? [prefix, ''];
    for (const [i, part] of (typeof value === 'string' ? chunksOfText(value) : [value ?? 'null']).entries()) rows.push([prefix, label, part, unit, i ? `文字列の続き ${i + 1}` : '']);
  }
  return rows;
}

function summary(key, values, mask, label, unit) {
  let count = 0, sum = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < values.length; i++) if ((!mask || mask[i % mask.length]) && Number.isFinite(values[i])) {
    const v = values[i]; count++; sum += v; min = Math.min(min, v); max = Math.max(max, v);
  }
  return [key, label, unit, count, count ? min : '', count ? max : '', count ? sum / count : ''];
}

export async function loadReportProvenance() {
  const response = await fetch(new URL('../runtime/manifest.json', import.meta.url));
  if (!response.ok) throw new Error('実行核情報を取得できません。');
  const manifest = await response.json();
  const assetResponse = await fetch(new URL('../asset-manifest.json', import.meta.url));
  if (!assetResponse.ok) throw new Error('配布版の識別情報を取得できません。再ビルドしてください。');
  const templateResponse = await fetch(new URL('../runtime/roms-template.in', import.meta.url));
  if (!templateResponse.ok) throw new Error('ROMSの固定設定を取得できません。');
  return { manifest, assets: await assetResponse.json(), template: await templateResponse.text() };
}

export function conditionSheets(input, context = {}) {
  // Work on a copy: resolving defaults must not change the user's experiment.
  const config = JSON.parse(settingsJson(input));
  const errors = validate(config); if (errors.length) throw new Error(errors.join('\n'));
  const f = buildFields(config), n = config.numerics;
  const model = config.ecosystem.enabled ? BIO_MODELS[config.ecosystem.model] : null;
  const heat = heatSettings(config);
  const boundary = resolvedBoundaries(config, f), wind = buildWind(config), rotation = rotationCoefficients(n);
  const tables = [];
  const add = (name, header, rows, widths) => {
    // Excel limits apply per sheet; never silently drop experimental conditions.
    for (let i = 0; i < Math.max(1, rows.length); i += 50000) tables.push({ name: name + (i ? `_${i / 50000 + 1}` : ''), rows: [header, ...rows.slice(i, i + 50000)], widths });
  };
  add('概要', ['項目', '値', '単位・備考'], [
    ['実験名', config.name, ''], ['対象', context.scope ?? '現在の設定（計算結果ではありません）', ''],
    ['地形', TERRAIN_PRESETS[config.grid.preset]?.label ?? config.grid.preset, ''],
    ['生態系', model?.label ?? '計算なし', ''], ['ROMS', context.manifest?.roms?.version ?? '未記録', ''],
    ['ROMSコミット', context.manifest?.roms?.commit ?? '未記録', ''],
    ['鉛直混合', n.calculateDiffusion ? 'GLS k-epsilon / Canuto A' : '固定係数', ''],
    ['通常RUNの指定時間', n.dt * n.maxSteps, 's'],
    ['出力開始', context.start ?? '', 'モデル経過秒'], ['出力終了', context.end ?? '', 'モデル経過秒'],
    ['出力間隔', context.interval ?? '', 's。終了時刻は間隔未満でも収録'], ['出力時刻数', context.count ?? '', ''],
    ['潮汐', tideSource(config), '理想化値と実データを区別'],
    ['初期分布', config.initial.distribution, '表面・底面の設定値と実際の分布は一致しない場合があります'],
    ['再実行', '同じ配布版でproject.jsonを開いて初期状態から実行', 'Restartではありません'],
    ['配列の保存', '完全設定JSONに編集値・読込値を収録', '行番号順にB列を連結すると元の設定JSONになります'],
    ['範囲', 'アプリに保存された条件と固定計算設定', '観測方法・研究目的・外部データの未入力情報は別途記載が必要'],
    ['定常判定', '自動判定なし', '指定ステップ数の完了と定常到達は異なります']
  ], [28, 64, 70]);
  const header = ['設定キー', '項目', '値', '単位', '備考'];
  for (const [name, keys] of [['格子と初期条件', ['grid', 'initial']], ['計算と風', ['numerics', 'wind', 'heat']], ['生態系', ['ecosystem']], ['河川', ['rivers']], ['海面と出典', ['ocean', 'climatology']], ['追加実験', ['particles']]]) {
    add(name, header, keys.flatMap(key => flatten(config[key], key)), [45, 48, 48, 20, 48]);
  }
  add('実効境界', header, flatten(boundary, 'boundary'), [48, 48, 40, 18, 45]);
  add('生物反応係数', ['モデル', '係数', '使用値', '単位', '定義'], model ? model.parameters.map(p => [model.label, p.key, config.ecosystem.parameters[config.ecosystem.model][p.key], p.unit, p.key === 'BioIter' ? '生物反応の反復回数' : p.description]) : [], [24, 24, 22, 28, 95]);
  add('初期場と風の統計', ['変数', '名称', '単位', '有効値数', '最小値', '最大値', '算術平均'], [
    ...[['h', '水深', 'm'], ['temp', '水温', 'degC'], ['salt', '塩分', ''], ['zeta', '海面高度', 'm']].map(([key, label, unit]) => summary(key, f[key], f.mask, label, unit)),
    summary('u', f.u, f.maskU, '東向き流速', 'm/s'), summary('v', f.v, f.maskV, '北向き流速', 'm/s'),
    ...(model ? biologyTracers(config).map(t => summary(t.key, f.biology[t.key], f.mask, t.label, t.unit)) : []),
    summary('wind.tx', wind.tx, f.mask, '東向き風応力', 'N/m2'), summary('wind.ty', wind.ty, f.mask, '北向き風応力', 'N/m2')
  ], [26, 28, 20, 18, 24, 24, 24]);
  add('計算方式', ['項目', '値', '単位・備考'], [
    ['水平格子', '直交Arakawa C格子', '固定陸域・静水圧近似'], ['鉛直格子', '等間隔sigma', 'Vtransform=2, Vstretching=1, THETA_S=THETA_B=0'],
    ['物理トレーサー移流', '水平U3・鉛直C4', ''], ['生物トレーサー移流', '水平・鉛直HSIMT', '生態系ON時'],
    ['熱交換方式', heat.mode, 'off: 断熱 / air: 簡易気温緩和 / flux: 直接指定。重ね合わせなし'],
    ['海面正味熱フラックス', heat.mode === 'air' ? 'lambda * (Tair - SST)' : surfaceHeatFlux(config, 0), 'W/m2。正は海洋への加熱。生物反応用日射とは独立'],
    ['気温', heat.mode === 'air' ? heat.airTemperature : '不使用', 'degC'],
    ['熱交換係数', heat.mode === 'air' ? heat.exchangeCoefficient : '不使用', 'W/(m2 K)。仮定値。気象学的バルク式ではない'],
    ['海面淡水フラックス', 0, ''],
    ['底面抵抗', '線形', '実行時の詳細値はROMS入力シートを参照'],
    ['鉛直背景係数', n.calculateDiffusion ? .0001 : n.verticalDiffusion, 'm2/s'],
    ['中心コリオリ係数', rotation.f0, 's-1'], ['beta', rotation.beta, 'm-1 s-1'],
    ['生物濃度の質量換算', 'C:N:P = 106:16:1', '元素相当量。乾燥重量ではない'],
    ['境界の自動流速', config.ocean?.velocityMode === 'auto', 'specifiedを開放条件へ変換。海面Cha・鉛直平均Fla・層流速Gra・トレーサーRadNud'],
    ['時間刻み分割数 NDTFAST', Math.max(20, Math.ceil(n.dt * Math.sqrt(9.81 * Math.max(...f.h)) / Math.min(f.dx, f.dy) / .3)), '']
  ], [32, 64, 88]);
  add('実行核', header, flatten(context.manifest ?? { note: '未記録' }), [48, 48, 80, 18, 32]);
  if (context.romsInput) add('ROMS入力', ['行番号', '実行に使用した入力'], context.romsInput.split(/\r?\n/).map((line, i) => [i + 1, line]), [12, 120]);
  if (context.biologyInput) add('生物入力', ['行番号', '実行に使用した入力'], context.biologyInput.split(/\r?\n/).map((line, i) => [i + 1, line]), [12, 100]);
  if (!context.romsInput && context.template) add('ROMSテンプレート', ['行番号', '固定設定の原本（可変値は他シートで上書き）'], context.template.split(/\r?\n/).map((line, i) => [i + 1, line]), [12, 120]);
  add('完全設定JSON', ['連結順序', 'JSON断片（文字列）'], chunksOfText(settingsJson(config)).map((part, i) => [i + 1, part]), [14, 110]);
  return tables;
}

export async function conditionsExcel(config, context = {}) {
  const { default: writeXlsxFile } = await import('../vendor/write-excel-file.js');
  const sheets = conditionSheets(config, context);
  const data = sheets.map(sheet => sheet.rows.map((row, i) => row.map(value => ({
    value: value ?? '', type: typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String,
    ...(typeof value === 'number' ? { format: '0.###############' } : {}),
    fontFamily: 'Yu Gothic', fontSize: 10, alignVertical: 'top', wrap: true,
    ...(i === 0 ? { fontWeight: 'bold', backgroundColor: '#17675B', color: '#FFFFFF', height: 30 } : { height: sheet.name === '完全設定JSON' ? 45 : 42 })
  }))));
  const blob = await writeXlsxFile(data, { sheets: sheets.map(s => s.name), columns: sheets.map(s => s.widths.map(width => ({ width }))), stickyRowsCount: 1 });
  return new Uint8Array(await blob.arrayBuffer());
}

export async function experimentAttachments(config, context) {
  const { strToU8 } = await import('../vendor/fflate.js');
  return {
    'project.json': strToU8(settingsJson(config)),
    'conditions.xlsx': await conditionsExcel(config, { ...context, scope: 'このZIPに含まれる計算結果の実験条件' }),
    'runtime-manifest.json': strToU8(settingsJson(context.manifest)),
    'asset-manifest.json': strToU8(settingsJson(context.assets)),
    'experiment.json': strToU8(settingsJson({ format: 'webroms-experiment-v1', start: context.start, end: context.end, interval: context.interval, count: context.count, restart: false })),
    'README.txt': strToU8('WebROMS experiment package\n\nproject.json: Open with WebROMS to rerun from the INITIAL state.\nconditions.xlsx: Experimental conditions, provenance and complete configuration.\ntime_*.nc: Saved three-dimensional results; times are model elapsed seconds.\nruntime-manifest.json and asset-manifest.json: Identify the required WebROMS distribution.\n\nThis package does not include the application, original external datasets, a restart state, or a classical ROMS distribution. Use the same WebROMS release and check data redistribution terms before sharing. Completion of a RUN does not establish steady state.\n')
  };
}
