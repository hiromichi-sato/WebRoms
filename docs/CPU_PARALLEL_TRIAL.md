# CPU並列化の試験

対象の上限は100×100×15のままです。配布用ROMSは直列実行を維持し、未検証の並列版へ切り替えません。

## 数値の比較基準

代表的な物理スケールに対する誤差1%を既定の試験基準とします。「誤差1%以内」は「99%信頼区間」を意味しません。モデルの現実に対する予測精度でも、計算の停止条件でもありません。

`src/numerical-comparison.js` は、明示した変動幅・振幅から許容幅を決め、RMSEと最大誤差を検査します。ゼロ付近の値で割らず、陸域は明示したマスクで除外します。海のNaN・Infinityは不合格、局所的な大きな差も不合格です。保存量の収支、潮汐の位相差、長時間の安定性は別途検証が必要です。

JSONの `reproducibility.comparison` に基準を保存します。代表スケールは比較時に変数ごとに指定する必要があり、気温・水温の摂氏値や塩分の背景値を無条件に分母にはしません。

## WASM向けOpenMPランタイム

公式Emscripten **6.0.3** のLLVM OpenMPを使用します。独自の簡易ランタイムや、OpenMP関数を直列処理に置き換えるスタブではありません。既存の配布用Emscripten 5.0.7環境とは分離しています。

構成は **Flang 21.1.8 → LLVM IR → Clang 23 / Emscripten 6.0.3 → LLVM OpenMP / Emscripten pthreads → WASM共有メモリー** です。Flangのオブジェクトを直接リンクせず、Emscriptenのバックエンドでpthread向けにコード生成します。

リンクには `-fopenmp -pthread -sPTHREAD_POOL_SIZE=4` を使用し、EmscriptenのJS初期化が完了してから呼び出します。`libopenmp.a` だけを従来の直列WASMへ追加する方式ではありません。依存ライブラリーも含めて対応する共有メモリー構成でリンクする必要があります。

### 構築と検証

開発用Windows環境で次を実行します。利用者の通常の起動には不要です。

```sh
npm run build:openmp
npm run test:openmp
```

必要なもの：WSL Ubuntu-24.04、Python 3、取得済みの `.tools/flang-root/opt/emsdk` のLLVM 23・Binaryen・Linux Node 22、`.tools/parallel-probe/toolchain` のFlangと対応Cランタイム。これらは既存ビルド環境のキャッシュです。未構築のPCにツールチェーン全体を自動導入するスクリプトではありません。

Emscriptenの公式ソースは必要ならダウンロードし、SHA-256を検証してWSLの `$HOME/.cache/webroms-openmp/emscripten-6.0.3` に展開します。npm依存の初回取得にはネット接続が必要です。LLVM標準ヘッダーが不足する場合は既存 `.tools/oci/layer-2.tar.gz` から復元します。`WEBROMS_PROBE_DISTRO` でWSLディストリビューション、`WEBROMS_OPENMP_EMSCRIPTEN` で展開先を変更できます。パスは通常の開発用パスを使用してください（シングルクォートを含むパスは非対応）。

成果物は `.tools/parallel-probe/` に集約します。

| ファイル | 用途 |
| --- | --- |
| `libopenmp.a` | WASM向け公式OpenMPライブラリー |
| `LICENSE.openmp.txt` | 同ライブラリーのライセンス |
| `openmp.ll`, `openmp.cjs`, `openmp.wasm` | Fortranによる独立試験と生成コード |
| `runtime-report.json` | 段階別のログ・合否・ソースとライブラリーのSHA-256 |

ソースアーカイブSHA-256：`033241f96a5c50993b43d8383c3356d2804932f5b3548e94c9839c4f68e8b5bd`。

2026-10-17、Node 22とChromeのWorker内で **1・2・4スレッド** を確認しました。静的分割ループ、暗黙バリア、倍精度の加算集約を検証し、合計は全方式で `250250` です。critical節で各スレッドIDを記録する試験も含めています。これは小さなランタイム試験であり、ROMSの物理場に対する1%比較や速度向上を実証したものではありません。

ブラウザ試験は専用ローカルHTTPサーバーでCOOP `same-origin`・COEP `require-corp` を設定します。実行環境にはSharedArrayBuffer・共有WASMメモリーが必要です。同期的な並列計算はUIスレッドではなくWorker内で実行します。通常のWebROMSサーバーと計算核はまだ変更していません。配布時には両サーバーのヘッダー対応と、非対応環境で直列版を選ぶ処理も必要です。

### ROMSへの接続で残ること

ROMSのOpenMP・タイル分割設定、FortranRuntimeやNetCDF等の共有メモリー対応、物理・GLS・生物モデルの再構築が必要です。中断再開・保存・粒子追跡も含めて直列版と比較します。今回の版のOpenMPマイクロタスク引数数にも制限があるため、実際のROMSが生成する呼び出しを確認してから使用します。並列カーネルが検証されるまではUIにCPU数の選択を出さず、JSONも未検証の並列カーネルを要求しません。

## 初期試験の記録

既存のr-wasm/flang-wasmキャッシュ（Flang 21.1.8）を使い、`native/openmp-probe.f90` の同じソースを直列とOpenMPの2方式で試しました。

| 段階 | 結果 |
| --- | --- |
| 直列のコンパイル・リンク | 成功 |
| 直列WASMの実行 | 成功、実行スレッド数1 |
| OpenMP指示のコンパイル | 成功 |
| OpenMPのリンク | 失敗、WASM向けOpenMPランタイムが不足 |
| ROMSの2・4スレッド計算 | 未実施 |

不足したシンボルは `__kmpc_global_thread_num`、`__kmpc_push_num_threads`、`__kmpc_fork_call`、`__kmpc_reduce`、`__kmpc_end_reduce` です。コンパイラーがOpenMP指示を認識しても、それを実行するWASM用ランタイムは別途必要です。この結果だけでOpenMP全般が不可能とは判断していません。

当初のランタイムなしの試験は `node scripts/probe-openmp.mjs --raw-link` で再現できます。`.tools/parallel-probe/report.json` がその記録です。現在の `node scripts/probe-openmp.mjs` は公式ランタイムの構築・検証へ進みます。取得済みOCIキャッシュのlayer-2からFlang、layer-0から対応Cランタイムを展開しました。通常の起動には不要です。

このリンク失敗は公式ランタイムの整備によって解消しました。標準カーネルを置き換える前に、ROMS本体での検証と直列版との比較が必要です。

## JSONの互換性

条件保存では `expectedKernel` にモデルに対応するWASMのファイル名・SHA-256・ROMSバージョン・コミットを記録します。`availableKernel` は保存時にこのアプリに同梱されている計算核です。ハッシュは同梱manifestの値であり、配布物の完全性検証は別途行います。

異なる計算核のJSONを開く場合は警告し、実験条件は変更しません。同じモデル種別のまま再保存しても、元のexpectedKernelを無断で現在の値へ変更しません。地形・初期場など従来の条件は同じJSONに保持されます。旧JSONも受け付けます。

このメタデータは計算核を自動取得したり、途中時刻からRestartしたりするものではありません。異なる計算核でも同じ結果になるという保証はしません。

参照：[公式Emscripten 6.0.3のOpenMP構築定義](https://github.com/emscripten-core/emscripten/blob/6.0.3/tools/system_libs.py)、[Flang OpenMP対応](https://flang.llvm.org/docs/OpenMPSupport.html)、[Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html)、[r-wasm/flang-wasm](https://github.com/r-wasm/flang-wasm)。
