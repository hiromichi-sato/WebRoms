import { BIO_MODELS } from './biology-catalog.js';

// Equations: roms/ROMS/Nonlinear/Biology/{npzd_Franks,nemuro}.h.
// These are instantaneous reaction terms, not the split implicit ROMS solver.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = value => Number.isFinite(value) ? Number(value.toPrecision(5)).toString() : '未定義';
const supported = config => ['npzd', 'nemuro'].includes(config.ecosystem?.model);
const parameters = config => Object.fromEntries(BIO_MODELS[config.ecosystem.model].parameters.map(p => [p.key, config.ecosystem.parameters?.[config.ecosystem.model]?.[p.key] ?? p.value]));

/** Human-readable mass concentrations; C and P are equivalents, never biomass. */
export function massEquivalent(value, unit) {
  if (!Number.isFinite(value)) return '換算不可';
  if (/^mmol Si\/m(?:³|3|\^3)$/.test(unit)) return `${fmt(value * 28.085)} mg Si/m³`;
  if (!/^mmol N\/m(?:³|3|\^3)$/.test(unit)) return '換算対象外';
  return `${fmt(value * 14.007)} mg N/m³ / ${fmt(value * 106 / 16 * 12.011)} mg C/m³ 相当 / ${fmt(value / 16 * 30.974)} mg P/m³ 相当`;
}

/** Positive depth is -z_r. The zero-substrate/zero-half-saturation limit is zero. */
export function npzdRates(config, depth = 0) {
  const p = parameters(config), initial = config.ecosystem.initial ?? {};
  const [N, P, Z, D] = BIO_MODELS.npzd.tracers.map(t => initial[t.key] ?? t.initial);
  const light = Math.exp(-p.K_ext * depth);
  const U = p.Vm_NO3 * light * (N === 0 ? 0 : N / (p.K_NO3 + N)) * P;
  const G = P === 0 ? 0 : p.ZooGR * Z * P * P / (p.K_Phy * p.K_Phy + P * P);
  const M = p.PhyMR * P, E = p.ZooMR * Z, B = p.ZooMD * Z, R = p.DetRR * D;
  return { light, U, G, M, E, B, R,
    N: -U + p.ZooEC * G + E + R,
    P: U - G - M,
    Z: (1 - p.ZooGA) * G - E - B,
    D: M + (p.ZooGA - p.ZooEC) * G + B - R };
}

const npzdTopics = {
  N: ['栄養塩 N', 'dN/dt = −U + ZooEC G + E + R', '植物の取り込みで減り、捕食に伴う排泄・動物の排泄・分解で戻ります。'],
  P: ['植物プランクトン P', 'dP/dt = U − G − M', '栄養塩から成長し、捕食と枯死で減少します。Pはリンではなく植物の窒素濃度です。'],
  Z: ['動物プランクトン Z', 'dZ/dt = (1−ZooGA)G − E − B', '捕食の一部が成長になり、排泄と死骸の生成で減少します。'],
  D: ['デトリタス D', 'dD/dt = M + (ZooGA−ZooEC)G + B − R', '有機粒子の生成と分解の収支です。沈降による鉛直輸送は別に計算されます。'],
  U: ['栄養塩の取り込み', 'U = Vm_NO3 exp(K_ext z) N P / (K_NO3+N)', 'zは上向き正で海中では負。深さが増すと指数関数で成長が弱まります。'],
  G: ['捕食と配分', 'G = ZooGR Z P² / (K_Phy²+P²)', 'Pから取り除いたGを、Zへ(1−ZooGA)G、NへZooEC G、Dへ(ZooGA−ZooEC)Gと配分します。'],
  M: ['植物の枯死', 'M = PhyMR P', '植物の窒素がデトリタスへ移ります。'],
  E: ['動物の排泄', 'E = ZooMR Z', 'コードではZooMRによる損失を栄養塩に戻します。'],
  B: ['動物の死骸', 'B = ZooMD Z', '動物の窒素がデトリタスへ移ります。'],
  R: ['再無機化', 'R = DetRR D', 'デトリタスを分解し、栄養塩として再利用します。'],
  sink: ['沈降', '∂D/∂t |sink = −∂(w_z D)/∂z ; w_z = −|wDet|', 'ROMSは鉛直層間のフラックスを計算します。局所反応の合計は保存しますが、底面からの沈降流出は別の収支です。']
};
const nemuroTopics = {
  production: ['植物の生産', 'fN,S = NO3/(KNO3S+NO3) exp(−PusaIS NH4) + NH4/(KNH4S+NH4)\nGppPS = VmaxS exp(KGppS T) LightS PS fN,S\nfSi = SiOH/(KSiL+SiOH)\nGppPL = VmaxL exp(KGppL T) LightL PL min(fN,L, fSi)', 'PSは小型植物、PLは大型植物。fN,LはSの係数をLに置き換えます。大型植物では窒素とケイ素の制限が働き、SiOHをRSiN × GppPLだけ消費します。'],
  light: ['光制限と光阻害', 'κS = AttSW + AttPS (PS+PL)\nI(z) = PARfrac × SW × exp(−∫κS dz_depth)\nLightS = (1−exp(−alphaPS I/VmaxS)) exp(−betaPS I/VmaxS)', '各層の中央まで減衰させ、さらに層底へ伝えます。LではAttPL・alphaPL・betaPL・VmaxLを使います。SWは短波放射、Tは水温です。'],
  grazing: ['食物網と捕食', 'GraPS2ZS = GRmaxSps exp(KGraS T) max(0, 1−exp(LamS(PS2ZSstar−PS))) ZS\nEgeZS = (1−AlphaZS) GraPS2ZS\nExcZS = (AlphaZS−BetaZS) GraPS2ZS', 'このビルドのIVLEV_EXPLICIT式。ZSはPS、ZLはPS・PL・ZS、ZPはPL・ZS・ZLを捕食します。排糞はPON、排泄はNH4へ。ZPのPL・ZS捕食には他の餌による抑制もあります。'],
  mortality: ['呼吸・分泌・死亡', 'ResPS = ResPS0 exp(KResPS T) PS\nExcPS = GammaS GppPS\nMorPS = MorPS0 exp(KMorPS T) PS²', '呼吸はNO3とNH4の取り込み割合で両栄養塩へ、分泌はDONへ、死亡はPONへ移します。PLも対応する係数で計算し、呼吸・分泌のSiはSiOH、死亡のSiはopalへ戻します。'],
  recycle: ['窒素の再生', 'NH4 → NO3 : Nit0 exp(KNit T) NH4\nPON → NH4 : VP2N0 exp(KP2N T) PON\nPON → DON : VP2D0 exp(KP2D T) PON\nDON → NH4 : VD2N0 exp(KD2N T) DON', '有機窒素の分解とアンモニウムの硝化です。PONはsetVPONで沈降します。'],
  silicon: ['ケイ素の循環', 'dSiOH/dt = RSiN(−GppPL+ResPL+ExcPL) + VO2S0 exp(KO2S T) opal\ndopal/dt = RSiN(MorPL+GraPL2ZL+GraPL2ZP) − VO2S0 exp(KO2S T) opal', 'PLに結合したケイ素は死亡・捕食でopalへ移ります。opalは溶解でSiOHに戻り、setVOpalで沈降します。上式は輸送を除く反応項です。']
};

function topicHtml(topic) {
  return `<h4>${escape(topic[0])}</h4><pre>${escape(topic[1])}</pre><p>${escape(topic[2])}</p>`;
}
function node(id, label, x, y, topic = id, silicon = false) {
  return `<g class="eco-lesson-node${silicon ? ' eco-lesson-si' : ''}" role="button" tabindex="0" data-eco-topic="${topic}" aria-label="${escape(label)}の式"><rect x="${x}" y="${y}" width="136" height="56" rx="6"/><text x="${x + 68}" y="${y + 23}">${id}</text><text class="eco-lesson-node-label" x="${x + 68}" y="${y + 43}">${label}</text></g>`;
}
function edge(path, topic, label, x, y, silicon = false) {
  return `<g class="eco-lesson-edge${silicon ? ' eco-lesson-si' : ''}" role="button" tabindex="0" data-eco-topic="${topic}" aria-label="${escape(label)}の式"><path d="${path}" marker-end="url(#eco-lesson-arrow)"/><path class="eco-lesson-hit" d="${path}"/><text x="${x}" y="${y}">${label}</text></g>`;
}
function diagram(model) {
  const npzd = model === 'npzd';
  return `<div class="eco-lesson-diagram"><svg viewBox="0 0 720 ${npzd ? 350 : 440}" role="group" aria-label="${npzd ? 'NPZD 窒素フロー' : 'NEMURO 窒素・ケイ素の代表的な経路'}"><defs><marker id="eco-lesson-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor"/></marker></defs>${npzd ? [
    edge('M186 68 H520', 'U', 'U 取り込み', 352, 58),
    edge('M588 96 V232', 'G', '(1−ZooGA)G', 642, 165),
    edge('M520 88 L194 243', 'M', 'M 枯死', 320, 153),
    edge('M520 260 H186', 'B', 'B 死骸 + (ZooGA−ZooEC)G', 353, 285),
    edge('M530 232 L190 93', 'E', 'E 排泄 + ZooEC G', 391, 194),
    edge('M118 232 V96', 'R', 'R 分解', 68, 165),
    edge('M118 288 V328', 'sink', '沈降', 153, 322),
    node('N', '栄養塩', 50, 40), node('P', '植物プランクトン', 520, 40),
    node('Z', '動物プランクトン', 520, 232), node('D', 'デトリタス', 50, 232)
  ].join('') : [
    edge('M156 48 H284', 'production', '生産', 218, 38),
    edge('M156 128 H284', 'production', '生産', 218, 118),
    edge('M420 48 H548', 'grazing', '捕食', 480, 38),
    edge('M420 128 H548', 'grazing', '捕食', 480, 118),
    edge('M616 156 V208', 'grazing', '捕食', 644, 190),
    edge('M352 156 V288', 'mortality', '死亡', 379, 246),
    edge('M548 235 L420 306', 'grazing', '排糞', 484, 280),
    edge('M284 318 H156', 'recycle', '分解', 217, 308),
    edge('M88 288 V156', 'recycle', '再生', 62, 243),
    edge('M40 100 V76', 'recycle', '硝化', 67, 90),
    edge('M156 208 H235 V143 H284', 'production', 'Si 取り込み', 220, 197, true),
    edge('M390 156 V208', 'silicon', 'Si', 413, 193, true),
    edge('M284 236 H156', 'silicon', '溶解', 216, 260, true),
    edge('M352 344 V400', 'recycle', '沈降', 383, 389),
    node('NO3', '硝酸塩', 20, 20, 'production'), node('NH4', 'アンモニウム', 20, 100, 'recycle'),
    node('PS', '小型植物', 284, 20, 'production'), node('PL', '大型植物', 284, 100, 'production'),
    node('ZS', '小型動物', 548, 20, 'grazing'), node('ZL', '大型動物', 548, 100, 'grazing'), node('ZP', '捕食性動物', 548, 208, 'grazing'),
    node('SiOH', 'ケイ酸', 20, 180, 'silicon', true), node('opal', '粒子態ケイ素', 284, 208, 'silicon', true),
    node('DON', '溶存有機窒素', 20, 288, 'recycle'), node('PON', '粒子態有機窒素', 284, 288, 'recycle')
  ].join('')}</svg></div>`;
}

function parameterControl(p, value, range = false) {
  const minimum = p.key === 'BioIter' ? 1 : 0;
  // K_NO3's catalog unit contradicts the denominator in npzd_Franks.h.
  const unit = p.key === 'K_NO3' ? 'mmol N/m³（コードの分母に対応）' : p.unit;
  return `<label class="eco-lesson-control"><span>${escape(p.key)} <small>${escape(unit || '単位は入力原典を参照')}</small></span><input type="${range ? 'range' : 'number'}" data-eco-param="${p.key}" aria-label="${p.key}" min="${minimum}" ${range ? `max="${Math.max(value * 2, p.key === 'K_ext' ? 0.2 : 5)}"` : 'max="1000000000"'} step="${p.key === 'BioIter' ? '1' : range ? '0.001' : 'any'}" value="${escape(value)}">${range ? `<output data-eco-value="${p.key}">${fmt(value)}</output>` : ''}</label>`;
}
function chart(config, depth) {
  const rates = npzdRates(config, depth);
  const values = Array.from({ length: 61 }, (_, i) => npzdRates(config, i * 2).U);
  const max = Math.max(...values, 1e-10);
  const points = values.map((v, i) => `${60 + i * 8},${180 - v / max * 140}`).join(' ');
  return `<p>深さ ${fmt(depth)} m：光の深度係数 ${fmt(rates.light)} / 取り込み U = <strong>${fmt(rates.U)}</strong> mmol N/m³/day</p><svg class="eco-lesson-chart" viewBox="0 0 600 230" role="img" aria-label="初期濃度で評価した取り込みUの深度依存。深さ0から120メートル。表面の取り込み${fmt(values[0])}、選択深度の取り込み${fmt(rates.U)} mmol N毎立方メートル毎日"><text x="60" y="18">U (mmol N/m³/day)</text><path class="eco-lesson-axis" d="M60 35 V180 H540"/><text x="50" y="45" text-anchor="end">${fmt(max)}</text><text x="50" y="184" text-anchor="end">0</text><polyline points="${points}"/><circle cx="${60 + depth * 4}" cy="${180 - rates.U / max * 140}" r="5"/><text x="60" y="203">0</text><text x="300" y="203">60</text><text x="525" y="203">120</text><text x="300" y="224" text-anchor="middle">深さ (m)</text></svg><p class="eco-lesson-note">初期設定の一様なN・Pを使った瞬間反応速度。描画済みの空間分布や計算結果の時系列ではありません。ROMS本体は過程ごとの陰的更新と沈降を実行します。</p>`;
}

export function renderEcosystemPanel(config) {
  if (!supported(config)) return '<section class="eco-lesson"><p>この学習パネルはNPZDとNEMUROに対応しています。</p></section>';
  const model = config.ecosystem.model, definition = BIO_MODELS[model], p = parameters(config);
  const topics = model === 'npzd' ? npzdTopics : nemuroTopics;
  const initialTopic = model === 'npzd' ? 'U' : 'production';
  return `<section class="eco-lesson" data-eco-model="${model}" aria-label="生態系の学習"><h3>${definition.label}：${model === 'npzd' ? '窒素の循環' : '窒素とケイ素の循環'}</h3>${!config.ecosystem.enabled ? '<p class="eco-lesson-note">生態系計算は無効です。以下は保存された設定による学習表示です。</p>' : ''}<p>${model === 'npzd' ? 'N・P・Z・Dはすべて窒素濃度。輸送を除けば d(N+P+Z+D)/dt = 0。' : '代表経路の模式図。窒素は実線、ケイ素は破線。PS・PLと3種類の動物、無機・有機物の11成分を扱います。全捕食経路は「食物網と捕食」に記載。'}</p>${diagram(model)}<div class="eco-lesson-topics" aria-label="反応過程">${Object.entries(topics).map(([key, topic]) => `<button type="button" data-eco-topic="${key}" aria-pressed="${key === initialTopic}">${topic[0]}</button>`).join('')}</div><div class="eco-lesson-equation" data-eco-explanation aria-live="polite">${topicHtml(topics[initialTopic])}</div>${model === 'npzd' ? `<section class="eco-lesson-growth"><h4>光と現在の成長条件</h4><p>Franksの光制限は exp(−K_ext × 深さ)。短波放射SWはこの成長式には入りません。</p><div class="eco-lesson-controls">${['Vm_NO3', 'K_ext', 'K_NO3'].map(key => parameterControl(definition.parameters.find(p => p.key === key), p[key], true)).join('')}<label class="eco-lesson-control"><span>評価深度 (m)</span><input type="range" data-eco-depth min="0" max="120" step="1" value="20" aria-label="評価深度"><output data-eco-depth-value>20</output></label></div><div data-eco-chart>${chart(config, 20)}</div><p class="eco-lesson-note">K_NO3は入力カタログで「逆半飽和」と記載されていますが、実装の分母は K_NO3+N です。ここでは実装の式と濃度次元を採用します。ZooEC ≤ ZooGA ≤ 1 が非負の捕食配分に必要です。</p></section>` : '<p class="eco-lesson-note">表示式は反応速度の表現です。ROMSは生産・呼吸・分解などを順次陰的更新し、このビルドの捕食はIVLEV_EXPLICITで計算します。</p>'}<details class="eco-lesson-details"><summary>全パラメーター (${definition.parameters.length})</summary><div class="eco-lesson-controls">${definition.parameters.map(item => parameterControl(item, p[item.key])).join('')}</div></details><details class="eco-lesson-details"><summary>初期濃度と質量換算</summary><p>Redfield C:N:P = 106:16:1（モル比）。C・Pは換算相当量であり、無機栄養塩を含め実際の炭素量・リン量・生物量ではありません。Siは元素質量です。</p><dl class="eco-lesson-masses">${definition.tracers.map(t => { const value = config.ecosystem.initial?.[t.key] ?? t.initial; return `<dt>${escape(t.label)}：${fmt(value)} ${escape(t.unit)}</dt><dd>${massEquivalent(value, t.unit)}</dd>`; }).join('')}</dl></details><p class="eco-lesson-sources">式の原典：<a href="https://github.com/myroms/roms/blob/57aecf589a408b1e5490d2db7f9bd0196062a44e/ROMS/Nonlinear/Biology/${model === 'npzd' ? 'npzd_Franks' : 'nemuro'}.h" target="_blank" rel="noopener">ROMS ${definition.label}</a> / <a href="https://github.com/myroms/roms/blob/57aecf589a408b1e5490d2db7f9bd0196062a44e/${definition.source.replace(/^roms\//, '')}" target="_blank" rel="noopener">パラメーターと単位</a>${model === 'nemuro' ? ' / 捕食設定：IVLEV_EXPLICIT' : ''}</p></section>`;
}

const bindings = new WeakMap();
/** Mutates config before calling onChange(config); returns an unbind function. */
export function bindEcosystemPanel(container, config, onChange = () => {}) {
  bindings.get(container)?.();
  let depth = Number(container.querySelector('[data-eco-depth]')?.value ?? 20);
  const updateChart = () => {
    const graph = container.querySelector('[data-eco-chart]');
    if (graph) graph.innerHTML = chart(config, depth);
  };
  const select = target => {
    const control = target.closest?.('[data-eco-topic]');
    if (!control || !container.contains(control)) return;
    const topics = config.ecosystem.model === 'npzd' ? npzdTopics : nemuroTopics;
    const topic = topics[control.dataset.ecoTopic];
    if (!topic) return;
    container.querySelector('[data-eco-explanation]').innerHTML = topicHtml(topic);
    container.querySelectorAll('button[data-eco-topic]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.ecoTopic === control.dataset.ecoTopic)));
  };
  const click = event => select(event.target);
  const keydown = event => {
    const control = event.target.closest?.('g[data-eco-topic]');
    if (control && ['Enter', ' '].includes(event.key)) { event.preventDefault(); select(control); }
  };
  const input = event => {
    const target = event.target;
    if (target.matches?.('[data-eco-depth]')) {
      depth = Number(target.value);
      container.querySelector('[data-eco-depth-value]').textContent = fmt(depth);
      updateChart();
      return;
    }
    const key = target.dataset?.ecoParam;
    if (!key || !supported(config)) return;
    const definition = BIO_MODELS[config.ecosystem.model].parameters.find(p => p.key === key);
    if (!definition) return;
    const value = Number(target.value);
    if (target.value.trim() === '' || !Number.isFinite(value) || value < (key === 'BioIter' ? 1 : 0) || value > 1e9 || (key === 'BioIter' && !Number.isInteger(value))) {
      target.setCustomValidity('有効な非負の数値を入力してください。BioIterは1以上の整数です。');
      return;
    }
    target.setCustomValidity('');
    config.ecosystem.parameters ??= {};
    config.ecosystem.parameters[config.ecosystem.model] ??= parameters(config);
    config.ecosystem.parameters[config.ecosystem.model][key] = value;
    container.querySelectorAll(`[data-eco-param="${key}"]`).forEach(peer => {
      if (peer.type === 'range' && value > Number(peer.max)) peer.max = String(value);
      peer.value = String(value);
      peer.setCustomValidity('');
    });
    container.querySelectorAll(`[data-eco-value="${key}"]`).forEach(output => { output.textContent = fmt(value); });
    updateChart();
    onChange(config);
  };
  container.addEventListener('click', click);
  container.addEventListener('keydown', keydown);
  container.addEventListener('input', input);
  const unbind = () => {
    container.removeEventListener('click', click);
    container.removeEventListener('keydown', keydown);
    container.removeEventListener('input', input);
    bindings.delete(container);
  };
  bindings.set(container, unbind);
  return unbind;
}
