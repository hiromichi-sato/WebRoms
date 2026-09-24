# Browser ROMS Execution Design

このプロジェクトは、利用者の環境でROMSをコンパイルしない方針にする。GitHub Pagesなどの静的ホスティングで配布し、ブラウザ上で地形作成から定常計算までを実行できる構成を目標にする。

## 基本方針

- ユーザー環境に Fortran、NetCDF、make、Python、Docker を要求しない。
- Web UI は静的ファイルとして配布する。
- ROMSの計算核は、配布者側で事前にビルドした `runtime/roms.wasm` として同梱する。
- ブラウザ内では Web Worker 上で `roms.wasm` を実行し、UIスレッドを止めない。
- 入出力ファイルは仮想ファイルシステムまたは OPFS に置く。
- 実計算結果は ROMS history/average 相当の配列から可視化する。

## 実行パイプライン

1. 海底地形
   - UIから `nx`, `ny`, `nz`, 陸域マスク、水深範囲を指定する。
   - ROMSの `h`, `mask_rho`, `mask_u`, `mask_v`, `pmask` 相当を生成する。
   - 将来は地形手描き、GeoJSON、PNGマスク、NetCDFインポートに対応する。

2. 初期条件
   - `zeta`, `ubar`, `vbar`, `u`, `v`, `temp`, `salt` の初期場を生成する。
   - 一様、鉛直成層、水平グラデーション、フロント、渦などをテンプレート化する。
   - ROMSの initial NetCDF 相当のデータ構造へ変換する。

3. 境界条件
   - ROMSの境界変数に合わせて以下を扱う。
   - 海面高度: `zeta_west`, `zeta_east`, `zeta_south`, `zeta_north`
   - 鉛直平均流速: `ubar_*`, `vbar_*`
   - 3D流速: `u_*`, `v_*`
   - トレーサー: `temp_*`, `salt_*`
   - 条件タイプは `LBC(isFsur)`, `LBC(isUbar)`, `LBC(isVbar)`, `LBC(isUvel)`, `LBC(isVvel)`, `LBC(isTvar)` に反映する。

4. ROMS入力生成
   - `roms.in` 相当の設定をブラウザ内で生成する。
   - Grid、initial、boundary、forcing 相当のバイナリデータを WASM ランタイムへ渡す。
   - ブラウザだけで完結させるため、NetCDFファイルそのものではなく、WASM側が読めるメモリ上の同等構造を第一候補にする。

5. 定常計算
   - `runtime/roms.wasm` を Web Worker に読み込む。
   - 指定ステップごとに残差、CFL、最大流速、平均水温などをUIへ返す。
   - 収束条件を満たしたら停止する。
   - 途中停止、再開、設定の保存、結果の保存を行う。

6. 結果表示
   - 表層、任意層、断面、時系列を表示する。
   - 結果は JSON または将来の NetCDF 互換形式としてダウンロード可能にする。

## ランタイム配置

想定する配布構成:

```text
WebRoms/
  index.html
  app.js
  styles.css
  runtime/
    roms.wasm
    roms-worker.js
    roms-runtime.js
  roms/
    ROMS source snapshot for reference
```

`runtime/roms.wasm` が存在しない場合、アプリは計算を実行せず、`webroms_config.json` を生成する。これは開発途中でもGitHub Pages上で壊れないようにするため。

## なぜ別言語へ翻訳しないか

ROMSは Fortran、Cプリプロセッサ、NetCDF、MPI/OpenMP、条件コンパイル、ROMS固有のC-grid・鉛直座標・境界条件を前提にしている。別言語へ手動または機械翻訳すると、ROMSと同じ離散化を保つ検証コストが大きい。

そのため、厳密性を優先する計算核はROMS由来のWASMとして同梱する。ユーザーはコンパイルしないが、プロジェクト配布物には事前ビルド済みランタイムを含める。

## 現在の実装状態

- UIは海底地形、初期条件、境界条件、実計算の順序になっている。
- 境界条件UIは `zeta`, `ubar`, `vbar`, `u`, `v`, `temp`, `salt` を扱う。
- `runtime/roms.wasm` がない場合は `webroms_config.json` をダウンロードする。
- 実際のROMS-WASM接続は次の実装対象。
