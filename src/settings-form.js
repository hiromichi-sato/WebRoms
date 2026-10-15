import { biologyTracers, BIO_MODELS, SIDES, SIDE_LABELS } from './model.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';
import { massEquivalent } from './ecosystem-panel.js';
import { ensureWind, WIND_CLIMATES, rotationCoefficients, windBounds } from './forcing.js';
import { oceanMarkup, initialIoMarkup } from './ocean-controls.js';
import { ensureOcean } from './ocean-boundary.js';
import { heatSettings } from './heat-forcing.js';
import { coastalReceiverOptions } from './coastal-rivers.js';
import { runPeriod } from './run-period.js';

export const STEP_TITLES = ['海底地形', '生態系モデル', '初期条件', '境界条件', '河川の設定', '風の強制力', '定常計算', '追加実験'];
export function settingsMarkup(config, ui) {
  const { step, side, brush, brushSize, layer, editVariable, boundaryVariable, editValue, initialBrush } = ui;
  const g = config.grid, tracers = biologyTracers(config);
  config.ecosystem.distribution ??= 'summer'; config.ecosystem.carbonChl ??= 50; config.ecosystem.zooRatio ??= .5; config.ecosystem.detritusRatio ??= .2;
  const terrainSource = TERRAIN_PRESETS[g.preset]?.bounds
    ? 'NOAA ETOPO 2022を間引いた地形です。水深は最小・最大水深で制限され、細い海峡は格子数により省略されます。航海には使用できません。'
    : '学習用の理想化地形です。実データに基づく地形はETOPO地形を選択できます。';
  const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const value = path => path.split('.').reduce((v, key) => v?.[key], config);
  const number = (path, label, min, max, increment = 1, unit = '') => `<label class="field"><span>${label}<small>${unit}</small></span><input data-path="${path}" aria-label="${label}" type="number" value="${esc(value(path))}" min="${min}" max="${max}" step="${increment}"></label>`;
  const options = (choices, selected) => Object.entries(choices).map(([key, label]) => `<option value="${key}"${String(selected) === key ? ' selected' : ''}>${label}</option>`).join('');
  const select = (path, label, choices) => `<label class="field"><span>${label}</span><select data-path="${path}" aria-label="${label}">${options(choices, value(path))}</select></label>`;
  const control = (id, label, choices, selected) => `<label class="field"><span>${label}</span><select id="${id}" aria-label="${label}">${options(choices, selected)}</select></label>`;
  const pair = (...parts) => `<div class="fields">${parts.join('')}</div>`;
  const group = (title, content) => `<fieldset class="form-group"><legend>${title}</legend>${content}</fieldset>`;
  const advanced = content => `<details class="advanced-settings"><summary>高度な設定</summary>${content}</details>`;
  const history = name => pair(`<button type="button" id="undo${name}" class="history-undo" title="戻す"><i data-lucide="undo-2"></i>戻す</button>`, `<button type="button" id="redo${name}" class="history-redo" title="進める"><i data-lucide="redo-2"></i>進める</button>`);
  const sizes = { 1: '1 × 1', 2: '3 × 3', 3: '5 × 5', 4: '7 × 7', 5: '9 × 9' };
  const layers = Object.fromEntries(Array.from({ length: g.nz }, (_, i) => [g.nz - 1 - i, i === 0 ? '表層' : i === g.nz - 1 ? '底層' : `第${i + 1}層`]));
  const variables = { temp: '水温', salt: '塩分', ...(config.ecosystem.enabled ? Object.fromEntries(tracers.map(t => [t.key, t.label])) : {}) };
  const paintValue = `<label class="field"><span>塗る値</span><input id="editValue" type="number" step="0.01" value="${editValue}"></label>`;
  const concentration = (path, tracer) => number(path, tracer.label, 0, 10000, 0.01, tracer.unit) + `<small class="mass-equivalent">${esc(massEquivalent(value(path) ?? 0, tracer.unit))}</small>`;
  const terrainMode = g.geoSource ? 'external' : g.sourceMode ?? 'packaged';
  if (step === 0) return group('地形の選択', control('terrainSourceMode', '地形の入力方法', { packaged: 'パッケージの地形を使う', external: 'その他の地形を使う' }, terrainMode)
      + (terrainMode === 'packaged' ? select('grid.preset', '地形の種類', Object.fromEntries(Object.entries(TERRAIN_PRESETS).map(([k, v]) => [k, v.label]))) + `<p class="source-note">${terrainSource}</p>`
        : '<div class="terrain-file-heading"><span>GIS地形データを追加</span><button id="terrainFileInfo" type="button" class="terrain-info-button" aria-label="GIS地形データの説明" aria-expanded="false" aria-controls="terrainFileHelp"><i data-lucide="info"></i></button></div><div id="terrainFileHelp" class="terrain-file-help" hidden><strong>ベクターデータ（Shapefile）：同じ名前の3ファイルが必須</strong><p><code>terrain.shp</code> 形状 ／ <code>terrain.dbf</code> 水深属性 ／ <code>terrain.prj</code> 座標系</p><p>あれば <code>.shx</code>・<code>.cpg</code> も追加。Ctrl／Shiftでまとめて選択、または1つずつ追加できます。</p><p><strong>格子データ（NetCDF）：</strong>水深・緯度経度を持つ.ncを1ファイル選択してください。<br><strong>ZIP：</strong>Shapefile一式をまとめたZIPも1ファイルで選択できます。どちらも個別のShapefileと混ぜずに選択してください。</p><p>水深属性DEPTH_M／DEPTH（大文字・小文字不問、m・正の水深）付きポリゴン・等深線・水深点に対応。水深点はセル内平均し、点のない格子・等深線の間は自動補間します。格子に合わせて陸域を推定します。実測の海岸線ではないため、生成した陸海の分布を確認してください。</p></div><label class="field"><input id="terrainImport" aria-label="GIS地形データを追加" type="file" accept=".zip,.nc,.shp,.dbf,.prj,.shx,.cpg" multiple aria-describedby="terrainFileHelp terrainSelectedFiles terrainFileStatus"></label><div id="terrainFileStatus" class="terrain-file-status" role="status"></div><p id="terrainSelectedFiles" class="source-note" role="status">未選択</p><button id="terrainClearFiles" type="button" disabled>選択をクリア</button><p class="source-note">' + (g.geoSource ? esc(g.geoSource) : 'ファイルを読み込むまでは現在の地形を表示します。') + '</p>'))
    + (g.contourInterpolation?.inferredLandDepths ? '<label class="forcing-toggle"><input id="pointLandMask" type="checkbox"' + (g.contourInterpolation.landInferenceEnabled ? ' checked' : '') + '>水深点のない外周を推定陸域にする</label><p class="source-note">観測セルと隣接1セルは海として保持。海岸線の確定ではありません。</p>' : '')
    + group('計算格子', pair(number('grid.nx', 'X格子数', 8, 100), number('grid.ny', 'Y格子数', 8, 100)) + pair(number('grid.dx', 'X格子間隔', 10, 2500000, 100, 'm'), number('grid.dy', 'Y格子間隔', 10, 2500000, 100, 'm')) + number('grid.nz', '鉛直層数', 2, 15))
    + group('水深', pair(number('grid.minDepth', g.preset === 'uniform' ? '水深' : '最小水深', 1, 10000, 10, 'm'), number('grid.maxDepth', '最大水深', 1, 10000, 10, 'm')))
    + group('ブロック地形編集', control('brush', 'ツール', { inspect: '参照', dig: '掘る', fill: '盛る' }, brush) + control('brushSize', 'ブラシ範囲', sizes, brushSize) + `<label class="field"><span>編集量<small>m</small></span><input id="terrainEditDepth" aria-label="地形の編集量" title="標準は最小水深。盛った後の水深が最小水深未満なら陸地になります。空欄で標準に戻ります。" type="number" min="0.01" max="10000" step="any" value="${esc(g.editDepth ?? g.minDepth)}"></label>` + history('Terrain'))
    + '<button type="button" id="fillIsolatedWater" title="辺でつながる水域を判定し、外周に接しない水域を陸埋めします。外周に接する水域がない場合は最大の水域を残します。"><i data-lucide="brick-wall"></i>孤立を陸埋め</button>'
    + group('河川の位置', control('riverBrush', '河川の編集モード', { inspect: '参照', 'river-add': '追加', 'river-delete': '削除' }, brush.startsWith('river') ? brush : 'inspect') + '<p class="source-note">海に辺で接する陸地を選択。隣の内側の海セルへ体積源として流入します。外周の海だけでは配置できません。複数の海に接する場合は西・東・南・北の順で流入先を決めます。</p>' + (config.rivers ?? []).map((r, i) => `<div class="river-row"><strong>河川 ${i + 1}：陸 (${(r.landCell ?? r.cell) % g.nx}, ${Math.floor((r.landCell ?? r.cell) / g.nx)}) → 海 (${r.cell % g.nx}, ${Math.floor(r.cell / g.nx)})</strong><button type="button" data-remove-river="${i}" title="河川 ${i + 1} を削除" aria-label="河川 ${i + 1} を削除"><i data-lucide="trash-2"></i></button></div>`).join(''));
  if (step === 1) return group('生態系モデル', select('ecosystem.enabled', '生態系の計算', { true: '計算する', false: '計算しない' }) + select('ecosystem.model', 'モデル', { npzd: 'NPZD (Franks)', nemuro: 'NEMURO' }) + (config.ecosystem.model === 'nemuro' ? number('ecosystem.shortwave', '海面の短波放射', 0, 1500, 1, 'W/m²') : '') + '<button type="button" id="skipEcosystem"><i data-lucide="skip-forward"></i>計算をスキップ</button>');
  if (step === 2) {
    const distribution = config.initial.distribution, seasonal = ['summer', 'winter', 'stratified'].includes(distribution);
    const northern = g.geoBounds ? g.geoBounds.south >= 0 : TERRAIN_PRESETS[g.preset]?.hemisphere !== 'south';
    const distributions = { uniform: '一様', ...(northern ? { summer: '夏季の成層（北半球・模擬）' } : {}), winter: '冬季の混合（模擬）', stratified: '鉛直成層', 'gradient-x': '東西水温差', 'gradient-y': '南北水温差', 'regional-summer': '該当地域の平均値（夏季）', 'regional-winter': '該当地域の平均値（冬季）', 'regional-annual': '該当地域の平均値（通年）', climatology: '気候値を個別選択' };
    let html = group('初期分布', control('initialDistribution', '初期分布', distributions, config.initial.regionalSeason && distribution === 'climatology' ? 'regional-' + config.initial.regionalSeason : distribution)
      + (distribution === 'climatology' ? '<label class="field"><span>気候値</span><select id="climatePreset" aria-label="気候値"></select></label><button type="button" id="applyClimate"><i data-lucide="thermometer"></i>気候値を適用</button><p id="climateSource" class="source-note"></p>' : seasonal ? pair(number('initial.tempSurface', '表面水温', -5, 45, 0.1, '°C'), number('initial.tempBottom', '底面水温', -5, 45, 0.1, '°C')) + pair(number('initial.saltSurface', '表面塩分', 0, 50, 0.1), number('initial.saltBottom', '底面塩分', 0, 50, 0.1)) + (distribution !== 'stratified' ? `<label class="field"><span>混合の強さ <output>${Math.round((config.initial.mixing ?? 0) * 100)}%</output></span><input data-path="initial.mixing" aria-label="混合の強さ" type="range" min="0" max="1" step="0.01" value="${config.initial.mixing ?? 0}"></label><div class="range-labels"><span>成層</span><span>一様混合</span></div>` : '') : pair(number('initial.tempSurface', '基準水温', -5, 45, 0.1, '°C'), number('initial.saltSurface', '基準塩分', 0, 50, 0.1)))
      + (['gradient', 'gradient-x', 'gradient-y'].includes(distribution) ? number('initial.tempGradient', distribution === 'gradient-y' ? '北端 − 南端 水温差' : '東端 − 西端 水温差', -20, 20, 0.1, '°C') : ''));
    html += `<p id="regionalClimateSource" class="source-note" hidden>${config.climatology?.regionLabel ?? ''}${config.climatology ? ' NOAA WOA23：1°格子の地域平均。湾内の観測値ではありません。深度間は線形補間、範囲外は端値を使用。' : ''}</p>`;
    if (seasonal) { const m = config.initial.mixing ?? 0; html += `<div class="rotation-formula">成層の強さ S = 1 − m = ${(1 - m).toFixed(2)}<br>躍層中心 d/H = 0.15 + 0.70m = ${(0.15 + .7 * m).toFixed(3)}<br>遷移幅 w/H = 0.025 + 0.15m = ${(.025 + .15 * m).toFixed(3)}<br>T(d) = T底 + (T表 − T底)(1−tanh((d/H−d₀/H)/(w/H)))/2<br>T混合 = (1−m)T(d) + m(T表+T底)/2<br><small>夏季・冬季の模擬分布に適用。各層内で平均して値を与えます。通常の鉛直成層は線形分布です。</small></div>`; }
    html += advanced(group('水位・流速', number('initial.zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number('initial.u', '東向き流速 U', -10, 10, 0.01, 'm/s'), number('initial.v', '北向き流速 V', -10, 10, 0.01, 'm/s'))));
    if (config.ecosystem.enabled) html += group('生物濃度', select('ecosystem.distribution', '生物濃度の初期分布', { summer: '夏季の成層（模擬）', winter: '冬季の混合（模擬）', climatology: '気候値から推定', manual: '個別設定・既存設定' }) + (config.ecosystem.distribution === 'climatology' ? number('ecosystem.carbonChl', '炭素／Chl質量比（仮定）', 1, 200, 1) + pair(number('ecosystem.zooRatio', 'Z／P比（仮定）', 0, 10, .1), number('ecosystem.detritusRatio', 'D／P比（仮定）', 0, 10, .1)) + '<p class="source-note">P = Chl × C:Chl ÷ (12.011 × 106/16)。ChlはNOAA配信MODISの2003年1月〜2019年2月累積平均で、季節別観測ではありません。N・SiはWOA23。Z・DはPに対する仮定比。鉛直分布は混合層下で40 mの指数減衰。NEMUROのPは大小1/2、Zは3等分、DON=PON、Opal=PONと仮定します。</p>' : '<p class="source-note">数値は表層・基準濃度。夏季は混合層20 m、冬季は100 mとして、その下のP/Z/Dを40 mで指数減衰、栄養塩を深さとともに増やす模擬分布です。</p>') + tracers.map(t => `<div data-eco-value="${t.key}">${concentration('ecosystem.initial.' + t.key, t)}</div>`).join(''));
    html += group('初期値を格子に塗る', control('initialBrush', '編集モード', { inspect: '参照', paint: '塗る' }, initialBrush) + control('editVariable', '変数', variables, editVariable) + pair(control('editLayer', '層', layers, layer), paintValue) + control('editBrushSize', 'ブラシ範囲', sizes, brushSize) + history('Initial'));
    return initialIoMarkup(config) + html;
  }
  if (step === 3) {
    const ocean = ensureOcean(config);
    const b = config.boundary[side], prefix = `boundary.${side}.`, editable = ['specified', 'open', 'radiation'].includes(b.mode);
    const table = keys => `<table class="boundary-table"><caption>各層の境界値（第1層：表層）</caption><thead><tr><th>層</th>${keys.map(key => `<th>${key === 'temp' ? '°C' : key === 'salt' ? '塩分' : key === 'u' || key === 'v' ? key.toUpperCase() + ' m/s' : tracers.find(t => t.key === key)?.label}</th>`).join('')}</tr></thead><tbody>${[...b.layers].reverse().map((values, i) => `<tr><th>${i + 1}</th>${keys.map(key => `<td><input data-path="${prefix}layers.${g.nz - i - 1}.${key}" aria-label="${SIDE_LABELS[side]} 第${i + 1}層 ${key}" type="number" step="0.01" value="${values[key]}"${editable ? '' : ' disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return oceanMarkup(config) + group('側面境界', control('boundarySide', '境界面', SIDE_LABELS, side) + select(prefix + 'mode', '境界形式', { closed: '閉鎖', specified: ocean.velocityMode === 'auto' ? '値を指定（水温・塩分など／流れは開放）' : '値を指定（固定）', open: '開放接続（潮汐・外洋）', periodic: '周期（対向面と同時）' }) + control('boundaryVariable', '境界値を塗る項目', variables, boundaryVariable) + pair(control('boundaryLayer', '編集層', layers, layer), paintValue) + control('boundaryBrushSize', 'ブラシ範囲', sizes, brushSize))
      + control('boundaryBrush', '境界の編集', editable ? { inspect: '参照', paint: '塗る' } : { inspect: '参照' }, ui.boundaryBrush ?? 'inspect')
      + history('Boundary')
      + `<label class="forcing-toggle boundary-initial-toggle"><input id="boundaryFromInitial" type="checkbox"${b.fromInitial ? ' checked' : ''}>初期場から設定</label>`
      + `<details class="boundary-baseline"><summary>水温・塩分・生物濃度を層ごとに設定</summary>${table(['temp', 'salt'])}${config.ecosystem.enabled ? table(tracers.map(t => t.key)) : ''}</details>`
      + `<details class="advanced-settings"><summary>高度な設定：外部からの流速</summary>${select('ocean.velocityMode', '流速の与え方', { auto: '直接指定しない（開放接続）', manual: '外部流速を層ごとに指定' })}${ocean.velocityMode === 'manual' ? table(['u', 'v']) : ''}<p class="source-note">通常は外部流速を固定せず、海面変動に応じて流出入します。閉鎖・周期境界は維持します。手動指定時の深さ平均は層厚から自動算出します。</p></details>`
      ;
  }
  if (step === 4) {
    if (!config.rivers?.length) return '<p class="river-empty"><i data-lucide="info"></i>河川は配置されていません。</p>';
    return config.rivers.map((river, i) => group(`河川 ${i + 1}`,
      (river.landCell !== undefined && ui.riverFields ? (() => {
        try {
          const choices = coastalReceiverOptions(ui.riverFields, river.landCell);
          return `<label class="field"><span>流入方向（流入先）</span><select data-river-receiver="${i}" aria-label="河川 ${i + 1} の流入方向">${choices.map(choice => `<option value="${choice.cell}"${choice.cell === river.cell ? ' selected' : ''}>${choice.label}</option>`).join('')}</select></label><details class="advanced-settings"><summary>詳細</summary><p class="source-note">矢印は河口の陸地から流入先の海セルへの向きです。河川は体積源として流入し、水平の噴流速度を強制するものではありません。</p></details>`;
        } catch { return '<p class="source-note">流入方向を設定するには沿岸地形を修正してください。</p>'; }
      })() : '') + number(`rivers.${i}.flow`, '流量', 0, 100000, 1, 'm³/s')
      + pair(number(`rivers.${i}.temp`, '河川水温', -5, 45, 0.1, '°C'), number(`rivers.${i}.salt`, '河川塩分', 0, 50, 0.1))
      + (config.ecosystem.enabled ? tracers.map(t => concentration(`rivers.${i}.biology.${t.key}`, t) + `<small>流入量：${((river.biology?.[t.key] ?? 0) * river.flow).toFixed(2)} ${t.unit.replace('/m³', '/s')}</small>`).join('') : '')
      + `<button type="button" data-remove-river="${i}"><i data-lucide="trash-2"></i>河川を削除</button>`)).join('');
  }
  if (step === 5) {
    const w = ensureWind(config), climate = w.pattern === 'climatology';
    const southern = windBounds(config).north <= 0;
    const climates = { ...WIND_CLIMATES, ...(southern ? { JJA: '冬季：6–8月平均（1991–2020）', DJF: '夏季：12–2月平均（1991–2020）' } : {}) };
    return group('海面の風', select('wind.pattern', '風の分布', { uniform: '一様風', gyre: '風成循環（東西風の南北変化）', coastal: '沿岸風', climatology: 'NOAA 再解析の気候値' })
      + (climate ? select('wind.climate', '風の気候値', climates)
        + (!TERRAIN_PRESETS[g.preset]?.bounds && !g.geoBounds ? select('wind.reference', '気候値の参照地域', Object.fromEntries(Object.entries(TERRAIN_PRESETS).filter(([, p]) => p.bounds).map(([id, p]) => [id, p.label]))) : '')
        + '<p class="source-note">NOAA NCEP/NCAR再解析1・10 m風。約1.9°格子の広域風で、湾内の局地風は解像しません。JJAは6–8月、DJFは12–2月（南半球では季節が逆）。ENSOは冬季3事例の合成値です。<br>El Niño: 1982/83・1997/98・2015/16<br>La Niña: 1988/89・1999/2000・2010/11</p>'
        : `<label class="field"><span>風の強さ <output id="windSpeedOutput">${w.speed.toFixed(1)} m/s</output></span><input data-path="wind.speed" aria-label="風の強さ" type="range" min="0" max="30" step="0.1" value="${w.speed}"></label><div class="range-labels"><span>0 m/s</span><span>30 m/s</span></div>` + number('wind.direction', '吹いていく向き（北0°・東90°）', 0, 360, 1, '°'))
      + '<p class="source-note">設定した分布を計算開始から時間一定で与えます。τ = ρₐ Cᴅ |U₁₀| U₁₀（ρₐ = 1.225 kg/m³、Cᴅ = 0.0013）。気候値の応力は各月の風から換算して平均しており、短周期変動の寄与は含みません。</p>')
      + group('風を1マスずつ編集', control('windBrush', '風の編集モード', { inspect: '参照', paint: '設定', erase: '元の分布に戻す' }, ui.windBrush ?? 'inspect')
        + pair(`<label class="field"><span>東向き風速 U</span><input id="windEditU" aria-label="東向き風速 U" type="number" min="-60" max="60" step="0.1" value="${ui.windEditU ?? 5}"></label>`, `<label class="field"><span>北向き風速 V</span><input id="windEditV" aria-label="北向き風速 V" type="number" min="-60" max="60" step="0.1" value="${ui.windEditV ?? 0}"></label>`) + history('Wind'));
  }
  if (step === 7) {
    const p = config.particles, ready = ui.particleReady, index = ui.particleSource ?? 0, source = p.sources[index];
    const location = source ? ui.particleCoordinates : null;
    return group('粒子追跡 · ROMS FLOATS', '<p class="source-note">' + (ready ? '現在の計算場から放流し、海洋場とともに時間を進めます。' : '先に07で海洋場を計算してください。条件JSONから読み込んだ場合も、海洋場の再計算が必要です。') + '</p>'
      + `<div class="particle-sources">${p.sources.map((s, i) => `<button type="button" data-particle-source="${i}" aria-pressed="${i === index}"><span class="particle-swatch" style="background:${/^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#c52c64'}"></span>地点 ${i + 1}</button>`).join('')}</div>`
      + `<div class="particle-location">${source ? `放流セル：X ${source.cell % g.nx + 1} · Y ${Math.floor(source.cell / g.nx) + 1}` : '放流位置：未選択'}${location ? `<br>経度 ${location.longitude.toFixed(5)}°<br>緯度 ${location.latitude.toFixed(5)}°` : ''}</div><button type="button" id="chooseParticleCell" title="放流地点を追加" aria-label="放流地点を追加" aria-pressed="${ui.particlePlacing}"><i data-lucide="map-pin-plus"></i>追加</button>`
      + (source ? pair(number(`particles.sources.${index}.count`, 'この地点の粒子数', 1, 512, 1), number(`particles.sources.${index}.depth`, '放流深度', .01, 10000, .1, 'm'))
        + `<label class="field particle-color"><span>地点 ${index + 1} の粒子色</span><input type="color" data-path="particles.sources.${index}.color" aria-label="粒子の色" value="${esc(source.color)}"></label><button type="button" id="removeParticleSource"><i data-lucide="trash-2"></i>この地点を削除</button>` : '')
      + '<p class="source-note">開始時点は海洋計算の終了時点に固定。潮汐ありの場合は約24.84時間の同じ波形・振幅を繰り返します。再実験も同じ開始状態から計算します。</p>'
      + select('particles.mode', '追跡方式', { '3d': '3次元の受動粒子', depth: '一定深度（Geopotential）' })
      + pair(number('particles.hours', '追跡期間', .001, 720, 1, 'h'), number('particles.interval', '記録間隔', config.numerics.dt, 2592000, 1, 's'))
      + '<p id="particleSummary" class="source-note" role="status"></p><p id="particleStatus" role="status"></p>'
      + `<button type="button" id="particleRun" class="primary"><i data-lucide="${ui.particleRunning ? 'square' : 'play'}"></i>${ui.particleRunning ? '追跡を停止' : '粒子追跡を開始'}</button><button type="button" id="particleDownload"><i data-lucide="download"></i>軌跡をNetCDFで保存</button>`
      + '<details class="advanced-settings"><summary>詳細</summary><p class="source-note">ROMS標準FLOATSのMilne予測・Hamming修正法を使います。粒子数は全地点の合計で512までです。乱数による拡散・魚の行動モデルは含みません。07の終了状態を一時NetCDFから直接引き継ぎ、初期条件から再計算はしません。一時データはブラウザー内だけで使い、セッション終了時に破棄します。潮汐１周期の終点と始点の差を線形に除いて継ぎ目を連続にした理想化波形です。補正込みの波形を繰り返し、MDTは維持します。結果の保存は手動です。</p></details>');
  }
  const n = config.numerics;
  n.rotationMode ??= 'latitude'; n.latitude ??= (TERRAIN_PRESETS[g.preset]?.bounds ? (TERRAIN_PRESETS[g.preset].bounds.north + TERRAIN_PRESETS[g.preset].bounds.south) / 2 : 35); n.rotationPlane ??= 'beta';
  const rotation = rotationCoefficients(n);
  config.heat = heatSettings(config);
  const heat = config.heat;
  let periodText = '時間刻み・ステップ数・開始日を確認してください。';
  try { const p = runPeriod(config); periodText = `${Number(p.days.toFixed(3))} 日（累計 ${Number(p.hours.toFixed(2))} 時間）<br>${p.startDate} → ${p.endDate}（UTC）`; } catch {}
  return group('時間積分', pair(number('numerics.dt', '時間刻み', 0.01, 600, 1, 's'), number('numerics.maxSteps', '計算ステップ数', 1, 1000000, 100)) + `<output class="source-note" id="runPeriod">${periodText}</output>`)
    + '<button type="button" id="tideInfo"><i data-lucide="info"></i>潮汐の情報</button>'
    + group('大気との熱交換', select('heat.mode', '熱の与え方', { off: 'なし（断熱）', air: '気温から計算（簡易）', flux: '熱フラックスを直接指定（高度）' })
      + (heat.mode === 'air' ? number('heat.airTemperature', '気温', -80, 60, .1, '℃')
        + '<details class="advanced-settings"><summary>詳細：熱交換の式</summary><p class="source-note">Q = λ(T気温 − T海面)。正は海への加熱、負は冷却。気温は時間・空間一様、海面水温は計算に応じて変化します。湿度・潜熱・長波放射を個別には計算しない理想化熱交換です。</p></details>'
        + advanced(number('heat.exchangeCoefficient', '熱交換係数 λ（仮定）', 0, 200, 1, 'W/(m² K)')) : '')
      + (heat.mode === 'flux' ? `<details class="advanced-settings" open><summary>高度な設定：海面熱フラックス</summary>${number('heat.netFlux', '正味海面熱フラックス', -2000, 2000, 1, 'W/m²')}<p class="source-note">正は加熱、負は冷却。時間・空間一様で、気温による熱交換は加算しません。</p></details>` : '')
      + '<p class="source-note">生物反応用の日射とは独立した正味熱交換です。気候変動の予測値ではなく、条件差を調べるための設定です。</p>')
    + group('混合・拡散', number('numerics.horizontalDiffusion', '水平拡散・粘性', 0, 10000, 1, 'm²/s'))
    + `<details class="advanced-settings" id="mixingAdvanced"${!n.calculateDiffusion ? ' open' : ''}><summary>高度な設定</summary><label class="forcing-toggle"><input id="fixedVerticalDiffusion" type="checkbox"${!n.calculateDiffusion ? ' checked' : ''}>鉛直拡散を一定値にする</label>${!n.calculateDiffusion ? number('numerics.verticalDiffusion', '鉛直拡散・粘性', 0, 1, 0.0001, 'm²/s') : ''}<p class="source-note">通常はGLS乱流混合（k-ε・Canuto A）で鉛直拡散・粘性を計算します。水平係数は一定です。</p></details>`
    + group('コリオリ力', select('numerics.rotationMode', 'コリオリの設定方法', { manual: '係数を直接指定', latitude: '緯度から計算' })
      + (n.rotationMode === 'latitude' ? number('numerics.latitude', '基準緯度（北緯＋・南緯−）', -90, 90, 0.1, '°') + '<button id="rotationFromTerrain" type="button"><i data-lucide="map-pin"></i>地形の中央緯度を使う</button>' + select('numerics.rotationPlane', '回転の近似', { beta: 'β平面', f: 'f平面（一定）' }) : pair(number('numerics.coriolisF0', '基準コリオリ係数 f₀', -0.001, 0.001, 0.000001, 's⁻¹'), number('numerics.coriolisBeta', '南北勾配 β', -1e-9, 1e-9, 1e-12, 's⁻¹ m⁻¹')))
      + `<p class="rotation-values">f₀ = ${rotation.f0.toExponential(4)} s⁻¹<br>β = ${rotation.beta.toExponential(4)} s⁻¹ m⁻¹</p><details class="advanced-settings"><summary>詳細：回転の式</summary><div class="rotation-formula">f₀ = 2Ω sin φ₀<br>β = 2Ω cos φ₀ / R<br>f(y) = f₀ + β(y − y₀)<br><small>Ω = 7.292115 × 10⁻⁵ s⁻¹<br>R = 6,371,000 m<br>φ₀：領域中央の緯度、y：北向きの距離。f平面では β = 0。</small></div></details>`)
    + `<button id="calculateButton" type="button" class="primary"><i data-lucide="${ui.running ? 'square' : 'play'}"></i>${ui.stopping ? '停止中' : ui.running ? '計算停止' : '定常計算を開始'}</button>`
    + (!ui.running && ui.mainOutcome === 'cancelled' ? '<button id="resumeCalculation" type="button" class="primary"><i data-lucide="play"></i>計算再開</button>' : '')
    + (!ui.running && ['completed', 'cancelled'].includes(ui.mainOutcome) ? '<button id="recalculateButton" type="button" class="recalculate-action"><i data-lucide="rotate-cw"></i>再計算</button>' : '');
}
