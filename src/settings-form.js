import { biologyTracers, BIO_MODELS, SIDES, SIDE_LABELS } from './model.js';
import { TERRAIN_PRESETS } from './terrain-presets.js';
import { massEquivalent } from './ecosystem-panel.js';
import { ensureWind, WIND_CLIMATES, rotationCoefficients, windBounds } from './forcing.js';

export const STEP_TITLES = ['海底地形', '生態系モデル', '初期条件', '境界条件', '河川の設定', '風の強制力', '定常計算'];
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
  if (step === 0) return group('計算格子', pair(number('grid.nx', 'X格子数', 8, 100), number('grid.ny', 'Y格子数', 8, 100)) + pair(number('grid.dx', 'X格子間隔', 10, 2500000, 100, 'm'), number('grid.dy', 'Y格子間隔', 10, 2500000, 100, 'm')) + number('grid.nz', '鉛直層数', 2, 15))
    + group('地形', select('grid.preset', '地形の種類', Object.fromEntries(Object.entries(TERRAIN_PRESETS).map(([k, v]) => [k, v.label]))) + pair(number('grid.minDepth', g.preset === 'uniform' ? '水深' : '最小水深', 1, 10000, 10, 'm'), ...(g.preset === 'uniform' ? [] : [number('grid.maxDepth', '最大水深', 1, 10000, 10, 'm')])) + `<p class="source-note">${terrainSource}</p>`)
    + '<button type="button" id="terrainDownload"><i data-lucide="download"></i>地形をダウンロード（Shape）</button><label class="field"><span>地形をインポート（Shape ZIP）</span><input id="terrainImport" type="file" accept=".zip"></label>'
    + group('ブロック地形編集', control('brush', 'ツール', { inspect: '参照', dig: '掘る', fill: '盛る', land: '陸地にする', water: '水域にする' }, brush) + control('brushSize', 'ブラシ範囲', sizes, brushSize) + history('Terrain'))
    + group('河川の位置', control('riverBrush', '河川の編集モード', { inspect: '参照', 'river-add': '追加', 'river-delete': '削除' }, brush.startsWith('river') ? brush : 'inspect') + '<p class="source-note">海に辺で接する陸地を選択。隣の内側の海セルへ体積源として流入します。外周の海だけでは配置できません。複数の海に接する場合は西・東・南・北の順で流入先を決めます。</p>' + (config.rivers ?? []).map((r, i) => `<div class="river-row"><strong>河川 ${i + 1}：陸 (${(r.landCell ?? r.cell) % g.nx}, ${Math.floor((r.landCell ?? r.cell) / g.nx)}) → 海 (${r.cell % g.nx}, ${Math.floor(r.cell / g.nx)})</strong></div>`).join(''));
  if (step === 1) return group('生態系モデル', select('ecosystem.enabled', '生態系の計算', { true: '計算する', false: '計算しない' }) + select('ecosystem.model', 'モデル', { npzd: 'NPZD (Franks)', nemuro: 'NEMURO' }) + (config.ecosystem.model === 'nemuro' ? number('ecosystem.shortwave', '海面の短波放射', 0, 1500, 1, 'W/m²') : '') + '<button type="button" id="skipEcosystem"><i data-lucide="skip-forward"></i>計算をスキップ</button>');
  if (step === 2) {
    const distribution = config.initial.distribution, seasonal = ['summer', 'winter', 'stratified'].includes(distribution);
    const northern = g.geoBounds ? g.geoBounds.south >= 0 : TERRAIN_PRESETS[g.preset]?.hemisphere !== 'south';
    const distributions = { uniform: '一様', ...(northern ? { summer: '夏季の成層（北半球・模擬）' } : {}), winter: '冬季の混合（模擬）', stratified: '鉛直成層', 'gradient-x': '東西水温差', 'gradient-y': '南北水温差', 'regional-summer': '該当地域の平均値（夏季）', 'regional-winter': '該当地域の平均値（冬季）', 'regional-annual': '該当地域の平均値（通年）', climatology: '気候値を個別選択' };
    let html = group('初期分布', control('initialDistribution', '初期分布', distributions, config.initial.regionalSeason && distribution === 'climatology' ? 'regional-' + config.initial.regionalSeason : distribution)
      + (distribution === 'climatology' ? '<label class="field"><span>気候値</span><select id="climatePreset" aria-label="気候値"></select></label><button type="button" id="applyClimate"><i data-lucide="thermometer"></i>気候値を適用</button><p id="climateSource" class="source-note"></p>' : seasonal ? pair(number('initial.tempSurface', '表面水温', -5, 45, 0.1, '°C'), number('initial.tempBottom', '底面水温', -5, 45, 0.1, '°C')) + pair(number('initial.saltSurface', '表面塩分', 0, 50, 0.1), number('initial.saltBottom', '底面塩分', 0, 50, 0.1)) + (distribution !== 'stratified' ? `<label class="field"><span>混合の強さ <output>${Math.round((config.initial.mixing ?? 0) * 100)}%</output></span><input data-path="initial.mixing" aria-label="混合の強さ" type="range" min="0" max="1" step="0.01" value="${config.initial.mixing ?? 0}"></label><div class="range-labels"><span>成層</span><span>一様混合</span></div>` : '') : pair(number('initial.tempSurface', '基準水温', -5, 45, 0.1, '°C'), number('initial.saltSurface', '基準塩分', 0, 50, 0.1)))
      + (['gradient', 'gradient-x', 'gradient-y'].includes(distribution) ? number('initial.tempGradient', distribution === 'gradient-y' ? '北端 − 南端 水温差' : '東端 − 西端 水温差', -20, 20, 0.1, '°C') : ''));
    html += `<p class="source-note">${config.climatology?.regionLabel ?? ''}${config.climatology ? ' NOAA WOA23：1°格子の地域平均。湾内の観測値ではありません。深度間は線形補間、範囲外は端値を使用。' : ''}</p>`;
    if (seasonal) { const m = config.initial.mixing ?? 0; html += `<div class="rotation-formula">成層の強さ S = 1 − m = ${(1 - m).toFixed(2)}<br>躍層中心 d/H = 0.15 + 0.70m = ${(0.15 + .7 * m).toFixed(3)}<br>遷移幅 w/H = 0.025 + 0.15m = ${(.025 + .15 * m).toFixed(3)}<br>T(d) = T底 + (T表 − T底)(1−tanh((d/H−d₀/H)/(w/H)))/2<br>T混合 = (1−m)T(d) + m(T表+T底)/2<br><small>夏季・冬季の模擬分布に適用。各層内で平均して値を与えます。通常の鉛直成層は線形分布です。</small></div>`; }
    html += advanced(group('水位・流速', number('initial.zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number('initial.u', '東向き流速 U', -10, 10, 0.01, 'm/s'), number('initial.v', '北向き流速 V', -10, 10, 0.01, 'm/s'))));
    if (config.ecosystem.enabled) html += group('生物濃度', select('ecosystem.distribution', '生物濃度の初期分布', { summer: '夏季の成層（模擬）', winter: '冬季の混合（模擬）', climatology: '気候値から推定', manual: '個別設定・既存設定' }) + (config.ecosystem.distribution === 'climatology' ? number('ecosystem.carbonChl', '炭素／Chl質量比（仮定）', 1, 200, 1) + pair(number('ecosystem.zooRatio', 'Z／P比（仮定）', 0, 10, .1), number('ecosystem.detritusRatio', 'D／P比（仮定）', 0, 10, .1)) + '<p class="source-note">P = Chl × C:Chl ÷ (12.011 × 106/16)。ChlはNOAA配信MODISの2003年1月〜2019年2月累積平均で、季節別観測ではありません。N・SiはWOA23。Z・DはPに対する仮定比。鉛直分布は混合層下で40 mの指数減衰。NEMUROのPは大小1/2、Zは3等分、DON=PON、Opal=PONと仮定します。</p>' : '<p class="source-note">数値は表層・基準濃度。夏季は混合層20 m、冬季は100 mとして、その下のP/Z/Dを40 mで指数減衰、栄養塩を深さとともに増やす模擬分布です。</p>') + tracers.map(t => `<div data-eco-value="${t.key}">${concentration('ecosystem.initial.' + t.key, t)}</div>`).join(''));
    html += group('初期値を格子に塗る', control('initialBrush', '編集モード', { inspect: '参照', paint: '塗る' }, initialBrush) + control('editVariable', '変数', variables, editVariable) + pair(control('editLayer', '層', layers, layer), paintValue) + control('editBrushSize', 'ブラシ範囲', sizes, brushSize) + history('Initial'));
    return html;
  }
  if (step === 3) {
    const b = config.boundary[side], prefix = `boundary.${side}.`, editable = ['specified', 'radiation'].includes(b.mode);
    const table = keys => `<table class="boundary-table"><caption>各層の境界値（第1層：表層）</caption><thead><tr><th>層</th>${keys.map(key => `<th>${key === 'temp' ? '°C' : key === 'salt' ? '塩分' : key === 'u' || key === 'v' ? key.toUpperCase() + ' m/s' : tracers.find(t => t.key === key)?.label}</th>`).join('')}</tr></thead><tbody>${[...b.layers].reverse().map((values, i) => `<tr><th>${i + 1}</th>${keys.map(key => `<td><input data-path="${prefix}layers.${g.nz - i - 1}.${key}" aria-label="${SIDE_LABELS[side]} 第${i + 1}層 ${key}" type="number" step="0.01" value="${values[key]}"${editable ? '' : ' disabled'}></td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return group('側面境界', control('boundarySide', '境界面', SIDE_LABELS, side) + select(prefix + 'mode', '境界形式', { closed: '閉鎖', specified: '値を指定（Clamped）', periodic: '周期（対向面と同時）' }) + control('boundaryVariable', '境界値を塗る項目', variables, boundaryVariable) + pair(control('boundaryLayer', '編集層', layers, layer), paintValue) + control('boundaryBrushSize', 'ブラシ範囲', sizes, brushSize))
      + control('boundaryBrush', '境界の編集', editable ? { inspect: '参照', paint: '塗る' } : { inspect: '参照' }, ui.boundaryBrush ?? 'inspect')
      + history('Boundary')
      + '<button type="button" id="seedBoundary"><i data-lucide="copy"></i>初期場から境界値を設定</button>'
      + `<details class="boundary-baseline"><summary>層別の基準値</summary>${table(['temp', 'salt'])}${config.ecosystem.enabled ? table(tracers.map(t => t.key)) : ''}</details>`
      + advanced(group('潮汐による効果の推定', '<label class="field"><span>NOAA観測点ID（米国沿岸）</span><input id="tideStation" inputmode="numeric" maxlength="7" value="' + esc(b.tideEstimate?.station ?? (g.preset === 'california' ? '9414290' : '')) + '"></label><label class="field"><span>開始日（UTC）</span><input id="tideStart" type="date"></label><label class="field"><span>期間（日）</span><input id="tideDays" type="number" min="1" max="31" value="3"></label><label class="field"><span>データ</span><select id="tideProduct"><option value="predictions">天文潮予測</option><option value="hourly_height">毎時の観測潮位</option></select></label><button id="fetchTides" type="button"><i data-lucide="cloud-download"></i>時系列をAPI取得</button><p class="source-note">NOAA CO-OPSのMSL基準・1時間値。例：9414290 サンフランシスコ。日本の検潮所はこのAPIの対象外です。予測と観測を区別し、観測欠測は補間しません。参照用の潮差推定であり、定常計算への潮汐強制は適用しません。</p><canvas id="tideCanvas" class="tide-series" aria-label="潮位時系列"></canvas><p id="tideStatus" role="status"></p>') + group('海面高度・流速強制', number(prefix + 'zeta', '海面高度', -20, 20, 0.01, 'm') + pair(number(prefix + 'ubar', '鉛直平均 Ubar', -10, 10, 0.01, 'm/s'), number(prefix + 'vbar', '鉛直平均 Vbar', -10, 10, 0.01, 'm/s')) + table(['u', 'v']) + '<button type="button" id="averageBoundary"><i data-lucide="equal"></i>層流速から鉛直平均を設定</button>'));
  }
  if (step === 4) {
    if (!config.rivers?.length) return '<p class="notice">河川は配置されていません。</p><button type="button" id="skipRivers"><i data-lucide="skip-forward"></i>河川なし</button>';
    return config.rivers.map((river, i) => group(`河川 ${i + 1}`,
      number(`rivers.${i}.flow`, '流量', 0, 100000, 1, 'm³/s')
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
  const n = config.numerics;
  n.rotationMode ??= 'manual'; n.latitude ??= (TERRAIN_PRESETS[g.preset]?.bounds ? (TERRAIN_PRESETS[g.preset].bounds.north + TERRAIN_PRESETS[g.preset].bounds.south) / 2 : 35); n.rotationPlane ??= 'beta';
  const rotation = rotationCoefficients(n);
  return group('混合・拡散', pair(number('numerics.horizontalDiffusion', '水平拡散・粘性', 0, 10000, 1, 'm²/s'), number('numerics.verticalDiffusion', '鉛直拡散・粘性', 0, 1, 0.0001, 'm²/s')))
    + group('コリオリ力', select('numerics.rotationMode', 'コリオリの設定方法', { manual: '係数を直接指定', latitude: '緯度から計算' })
      + (n.rotationMode === 'latitude' ? number('numerics.latitude', '基準緯度（北緯＋・南緯−）', -90, 90, 0.1, '°') + '<button id="rotationFromTerrain" type="button"><i data-lucide="map-pin"></i>地形の中央緯度を使う</button>' + select('numerics.rotationPlane', '回転の近似', { beta: 'β平面', f: 'f平面（一定）' }) : pair(number('numerics.coriolisF0', '基準コリオリ係数 f₀', -0.001, 0.001, 0.000001, 's⁻¹'), number('numerics.coriolisBeta', '南北勾配 β', -1e-9, 1e-9, 1e-12, 's⁻¹ m⁻¹')))
      + `<div class="rotation-formula">f₀ = 2Ω sin φ₀<br>β = 2Ω cos φ₀ / R<br>f(y) = f₀ + β(y − y₀)<br><small>Ω = 7.292115 × 10⁻⁵ s⁻¹<br>R = 6,371,000 m<br>φ₀：領域中央の緯度、y：北向きの距離。f平面では β = 0。</small><p>f₀ = ${rotation.f0.toExponential(4)} s⁻¹<br>β = ${rotation.beta.toExponential(4)} s⁻¹ m⁻¹</p></div>`)
    + group('時間積分', pair(number('numerics.dt', '時間刻み', 0.01, 600, 1, 's'), number('numerics.maxSteps', '計算ステップ数', 1, 1000000, 100)))
    + `<button id="calculateButton" type="button" class="primary"><i data-lucide="${ui.running ? 'square' : 'play'}"></i>${ui.running ? '計算停止' : '定常計算を開始'}</button>`;
}
