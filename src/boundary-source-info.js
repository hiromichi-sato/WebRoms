import { appendTideDataInfo } from './tide-data-info.js';

export function showBoundarySourceInfo(kind, config, fields) {
  document.getElementById('boundarySourceDialog')?.remove();
  const dialog = document.createElement('dialog'); dialog.id = 'boundarySourceDialog'; dialog.className = 'boundary-source-dialog';
  const heading = document.createElement('h2'); heading.id = 'boundarySourceTitle'; heading.textContent = kind === 'tide' ? '潮汐のデータ情報' : 'MDT・ADTのデータ情報';
  dialog.setAttribute('aria-labelledby', heading.id); dialog.append(heading);
  const paragraph = text => { const node = document.createElement('p'); node.textContent = text; dialog.append(node); };
  paragraph('境界接続部は自動調整します。開いた水域境界の四隅は2辺の平均値に合わせ、近傍3格子間隔で滑らかにつなぎます。潮汐は位相を含む波形を共通の重みで合成するため、振幅だけの平均ではありません。入力値は保持され、計算・断面図・潮汐グラフに調整を適用します。');
  if (kind === 'tide') {
    paragraph('同梱のTidalData_jp.csvは、気象庁が公開する主要4分潮（M2・S2・K1・O1）の調和定数をCSVに転記したものです。');
    paragraph('近傍3地点の複素調和定数を経度補正して距離重みで内挿・外挿。100 km以遠は警告付きの参考値です。海盆・海峡・共鳴は再現しません。新規生成では開始UTC日時から天文引数・節点補正を略算します（1901〜2099年）。MSL・潮位表基準面は加算しません。主要4分潮の近似であり、気象庁の60分潮による潮位表とは一致しません。');
    paragraph('追加分潮の天文補正対象：N2・Q1・P1・K2・M4・MS4・S4・M6（標準角速度の場合）。それ以外は開始日時を基準とした任意位相です。過去の条件JSONは保存された方式・時系列を維持し、自動変換しません。');
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
