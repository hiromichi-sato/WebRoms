import { ensureOcean, tideStatus, boundaryPoints } from './ocean-boundary.js';

export const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export function oceanMarkup(config) {
  const o = ensureOcean(config), esc = escapeHtml;
  return `<label class="forcing-toggle"><input id="tideEnabled" type="checkbox"${o.tideMode !== 'off' ? ' checked' : ''}>潮汐を設定</label>
    <fieldset class="form-group forcing-options"${o.tideMode === 'off' ? ' disabled' : ''}><legend>潮汐</legend>
    <label class="field"><span>開始日時（UTC）</span><input id="oceanStart" aria-label="開始日時（UTC）" type="datetime-local" value="${esc(o.startUtc?.replace(/Z$/, '').slice(0, 16))}"></label>
    <p class="source-note" id="oceanStatus">${esc(tideStatus(config))}</p>
    <label class="field"><span>FES潮汐データ</span><input type="file" id="tideImport" accept=".json"></label>
    <div class="fields"><label class="field"><span>予測期間（日）</span><input data-path="ocean.predictionDays" type="number" min="1" max="366" value="${o.predictionDays}"></label><button id="tideRequest" type="button"><i data-lucide="download"></i>FES生成条件を保存</button></div>
    </fieldset>
    <label class="forcing-toggle"><input id="seaLevelEnabled" type="checkbox"${o.seaLevelEnabled ? ' checked' : ''}>海面高度を設定</label>
    <fieldset class="form-group forcing-options"${o.seaLevelEnabled ? '' : ' disabled'}><legend>潮汐以外の海面高度</legend>
    <button id="applyBundledMdt" type="button"><i data-lucide="globe"></i>同梱MDTを地形に適用</button>
    ${o.seaLevel?.unresolvedIndices?.length ? `<p class="notice">参照値のない孤立水域 ${o.seaLevel.unresolvedIndices.length} セルは外挿できないため、初期海面高度を維持しています（MDTではありません）。</p>` : ''}
    ${o.seaLevel?.nearbyIndices ? `<p class="source-note">孤立水域：周辺50 km以内の値で ${o.seaLevel.nearbyIndices.length} セル、参照値がないため0 mで ${o.seaLevel.zeroIndices?.length ?? 0} セルを補完。同じ孤立水域は一様な値です。</p>` : ''}
    <p class="source-note">CNES-CLS22 / CMEMS2020：1993〜2012年平均、1/8度格子。沿岸欠測は拡散方程式の定常解で外挿。既知値は固定、陸地は流束0。潮汐・季節変動は含みません。</p>
    <label class="field"><span>MDT / ADT（NetCDF・Shape ZIP）</span><input id="seaLevelImport" type="file" accept=".nc,.zip"></label>
    <label class="field"><span>海面高度の種類</span><select id="seaLevelKind"><option value="mdt">MDT（平均動的海面高度）</option><option value="adt">ADT（潮汐を含まない）</option><option value="model">モデル基準の水位（再読み込み）</option></select></label>
    <p class="source-note">基準面：${esc(o.seaLevel?.datum ?? 'モデル基準面')} ／ ${esc(o.seaLevel?.source ?? '未適用（初期場の海面高度、標準0 m）')}${o.seaLevel?.bundled ? ` ／ 欠測補間 ${o.seaLevel.interpolatedCells} セル` : ''}</p>
    <div class="fields"><button id="seaLevelNetcdf" type="button"><i data-lucide="download"></i>海面高度 NetCDF</button><button id="seaLevelShape" type="button"><i data-lucide="download"></i>海面高度 Shape</button></div>
    </fieldset>
    <p class="source-note">両方OFF：外部から与える海面高度は0 m。密度差などで生じる海面変動・流れは計算します。</p>
    <details class="advanced-settings"><summary>高度な設定：潮位の補正</summary>
    <fieldset class="forcing-options"${o.tideMode === 'off' && !o.seaLevelEnabled ? ' disabled' : ''}>
    <label class="field"><span>補正地点（海上の境界セル）</span><select id="correctionCell"></select></label>
    <label class="field"><span>入力の種類</span><select id="correctionKind"><option value="residual">基準潮位からの差（cm）</option><option value="absolute">潮位（cm、基準面変換あり）</option></select></label>
    <div class="fields"><label class="field"><span>モデル基準面への加算（cm）</span><input id="correctionDatum" type="number" value="0" step="any"></label><label class="field"><span>影響距離（km）</span><input id="correctionRadius" type="number" min="0.1" max="500" value="30"></label></div>
    <label class="field"><span>入力間隔</span><select id="correctionInterval"><option value="6">6時間</option><option value="3">3時間</option><option value="2">2時間</option><option value="1">1時間</option></select></label>
    <button id="correctionTemplate" type="button"><i data-lucide="table"></i>開始日24時間分の入力欄を作成</button>
    <label class="field"><span>UTC日時,潮位cm（1行1時刻）</span><textarea id="correctionValues" rows="7" spellcheck="false" placeholder="2026-01-01T00:00:00Z,0"></textarea></label>
    <label class="field"><span>補正値の上限（±cm）</span><input data-path="ocean.correctionLimitCm" aria-label="補正値の上限" type="number" min="1" max="1000" value="${o.correctionLimitCm}"></label>
    <p class="source-note">上限は入力確認用で、自然界の普遍的な閾値ではありません。絶対潮位は基準面変換後、初期海面高度＋天文潮からの差を検査します。湾内観測点の境界への直接転用は不可。海で接続した範囲へ距離で減衰する境界補正です。</p>
    <button id="applyCorrection" type="button"><i data-lucide="check"></i>補正を適用</button>
    <div>${(o.corrections ?? []).map((c, i) => `<div class="river-row">セル ${c.cell}：${c.samples.length} 時刻<button type="button" data-remove-correction="${i}" aria-label="補正 ${i + 1} を削除"><i data-lucide="trash-2"></i></button></div>`).join('')}</div>
    </fieldset></details>`;
}
export function initialIoMarkup() {
  return `<fieldset class="form-group"><legend>初期場 NetCDF</legend>
    <label class="field"><span>読み込む時刻番号（0始まり）</span><input id="initialTimeIndex" type="number" min="0" value="0"></label>
    <label class="field"><span>深度範囲外</span><select id="initialDepthPolicy"><option value="reject">読み込み不可</option><option value="extend">端の値で延長（近似）</option></select></label>
    <label class="field"><span>水温・塩分・生物濃度</span><input id="initialNetcdfImport" type="file" accept=".nc"></label>
    <button id="initialNetcdfExport" type="button"><i data-lucide="download"></i>初期場を保存（NetCDF）</button>
    </fieldset>`;
}
export function fillCorrectionCells(select, config, fields) {
  try { for (const p of boundaryPoints(config, fields)) select.add(new Option(`${p.cell} (${p.lon.toFixed(4)}, ${p.lat.toFixed(4)})`, p.cell)); } catch { /* No geographic terrain selected. */ }
}
