import { appendTideDataInfo } from './tide-data-info.js';

export function showBoundarySourceInfo(kind, config, fields) {
  document.getElementById('boundarySourceDialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.id = 'boundarySourceDialog'; dialog.className = 'boundary-source-dialog';
  const heading = document.createElement('h2'); heading.id = 'boundarySourceTitle'; heading.textContent = kind === 'tide' ? '潮汐のデータ情報' : 'MDT・ADTのデータ情報';
  dialog.setAttribute('aria-labelledby', heading.id); dialog.append(heading);
  const paragraph = text => { const node = document.createElement('p'); node.textContent = text; dialog.append(node); };
  if (kind === 'tide') {
    paragraph('同梱のTidalData_jp.csvは、気象庁が公開する主要4分潮（M2・S2・K1・O1）の調和定数をCSVに転記したものです。');
    paragraph('近傍3地点の複素調和定数を距離重みで内挿・外挿。100 km以遠は警告付きの参考値です。海盆・海峡・共鳴は再現しません。天文引数・節点補正なし。MSL・潮位表基準面は加算しません。実験用の近似であり、実地点の厳密な潮位予測ではありません。');
    paragraph('緯度経度があり、すべての水域境界セルが同梱観測地点の100 km以内なら、潮汐をONにすると自動適用します。保存済みの入力潮汐・ユーザー補正は再適用で上書きしません。');
    const link = document.createElement('a'); link.href = 'https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station.php'; link.textContent = '気象庁：潮位表の地点一覧'; link.target = '_blank'; link.rel = 'noopener noreferrer'; dialog.append(link);
    try { appendTideDataInfo(dialog, config, fields); } catch (error) { paragraph(error.message); }
  } else {
    const data = config.ocean?.seaLevel;
    paragraph(`基準面：${data?.datum ?? 'モデル基準面'} ／ ${data?.source ?? '未適用（初期場の海面高度、標準0 m）'}${data?.bundled ? ` ／ 欠測補間 ${data.interpolatedCells} セル` : ''}`);
    paragraph('同梱MDTはCNES-CLS22 / CMEMS2020：1993〜2012年平均、1/8度格子。沿岸欠測は拡散方程式の定常解で外挿。既知値は固定、陸地は流束0。潮汐・季節変動は含みません。');
    if (data?.nearbyIndices) paragraph(`孤立水域：周辺50 km以内の値で ${data.nearbyIndices.length} セル、参照値がないため0 mで ${data.zeroIndices?.length ?? 0} セルを補完。同じ孤立水域は一様な値です。`);
    if (data?.unresolvedIndices?.length) paragraph(`外挿できない孤立水域 ${data.unresolvedIndices.length} セルは初期海面高度を維持しています（MDTではありません）。`);
  }
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '閉じる'; close.onclick = () => dialog.close();
  dialog.append(close); dialog.addEventListener('close', () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
}
