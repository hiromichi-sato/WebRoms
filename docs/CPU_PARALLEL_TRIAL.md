# CPU並列化の試験

対象の上限は100×100×15のままです。07の「CPU実行」で直列・自動・2スレッド・4スレッドを選択できます。既定値と従来JSONは直列です。物理のみ・NPZD・NEMUROそれぞれに、一定拡散版とGLS版を同梱します。

「自動」は共有メモリー対応かつ4論理CPU以上の環境で4スレッドを選びます。対応しないブラウザー・小さすぎる格子・並列版の読み込み失敗では、同じ物理・生態系モデルの直列版へ戻ります。実際の方式は計算状態の横に表示します。Node版とWindows起動用サーバーの両方でCOOP/COEPヘッダーを設定しています。

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

## 物理モデルの並列カーネル

2026-10-17、**物理モデル・一定の鉛直拡散係数**の実験用カーネルを構築しました。ROMS標準のOpenMPとタイル分割を使用し、NetCDF-C・NetCDF-Fortran・FortranRuntimeもpthread向けに再構築しています。

```sh
npm run build:openmp
npm run build:openmp:kernel
npm run compare:openmp
node --test tests/openmp-kernel.test.mjs
node scripts/benchmark-openmp-kernel.mjs
```

ビルドはWSLの隔離環境で行い、その準備にroot権限を使用します。取得済みOCIキャッシュとGitが必要です。FortranRuntimeのソースはr-wasm/llvm-projectの `7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c` に固定し、必要なディレクトリーのみ取得します。既存のソース作業ツリーがこのコミットと異なる、または変更されている場合は上書きせず停止します。

成果物・条件JSON・実行ログ・倍精度スナップショット・比較レポートは **`.tools/parallel-kernels/`** に集約します。全モデルは `node scripts/build-parallel-kernel.mjs all` で構築し、`node scripts/compare-parallel-models.mjs` で直列版と比較します。`node scripts/install-parallel-kernel.mjs` は検証結果とSHA-256が一致する場合だけ `runtime/openmp/` へ配置します。既存の直列カーネルは置き換えません。

### 互換処理

このFlang版は、wasm32の `__kmpc_threadprivate_cached` に64ビットのサイズを渡し、32ビットの宣言と不一致になる問題があります。ROMSのmodule内の `THREADPRIVATE` 変数に限定し、生成LLVM IRをWASMの**ネイティブTLS**へ変換します。共有変数に置き換える処理ではありません。

Fortranの最適化はLLVM IRへ変換する段階では抑え、TLSを付与した後にEmscriptenでO2最適化します。スカラーとallocatable配列が各スレッドで独立し、並列区間をまたいで保持されることを1・2・4・2スレッドの順で検証しています。COPYIN/COPYPRIVATE、COMMON、複数行のTHREADPRIVATE等は一般対応せず、認識できない形式は停止します。汎用FlangのOpenMP対応を置き換えるものではありません。

ROMS `memory.F` には、開始 `CRITICAL(VMEMORY)` に対して終了が `CRITICAL(PSOURCE)` になっている箇所があり、終了名をVMEMORYへ修正しました。物理式は変更していません。生成されたROMSのマイクロタスクの捕捉引数数は最大1であり、今回のランタイムの上限内でした。

### 数値比較

Windows / Node 24.19.0、Intel Core i7-14700で以下を実行しました。

| 条件 | 格子 | ステップ数 | 比較結果 |
| --- | --- | --- | --- |
| 静止水槽 | 32×32×5 | 100 | 全比較合格 |
| 島・陸海マスク・風 | 32×32×5 | 100 | 全比較合格 |
| 成層の鉛直拡散 | 32×32×15 | 100 | 全比較合格 |
| 指定境界 | 32×32×5 | 100 | 全比較合格 |
| 理想化潮汐境界 | 32×32×5 | 100 | 全比較合格 |
| 島・風、大規模格子 | 100×100×15 | 40 | 全比較合格 |

dtは1秒です。直列版と並列版の1・2・4スレッドを比較し、タイル数はそれぞれ1×1・2×1・2×2です。初期・中間・終了時の `h`, `zeta`, `temp`, `salt`, `u`, `v`, `ubar`, `vbar`, `z_r` を、C格子の陸海マスクに従って検査しました。合計486件の変数別比較で **最大誤差・RMSEとも0** でした。風による流れ、鉛直拡散による温度変化、潮汐による海面変化が実際に発生していることも確認しています。

許容幅は水温10°C、塩分1、海面高度0.1m、流速0.1m/s、地形・鉛直座標100mをそれぞれ代表スケールとした1%です。今回はその許容幅よりも厳しく一致しましたが、他のPC・ブラウザーや長時間計算まで一致を保証するものではありません。

ChromeのWorker内でも、島・風の16×16×3格子を50ステップ実行し、2・4スレッドを直列版と比較して合格しました。ランタイムのスレッド数だけでなく、ROMS内部の `numthreads` も指定値と一致することを確認しています。

`comparison.json` が全ケースの変数別指標、`benchmark.json` が100×100×15の3回計測です。時間計測は別プロセスで行い、初期化とスナップショット取得を除く時間積分のみを対象とします。JITの立ち上がりは含みます。速度は機種・格子・設定に依存し、常に並列版が速いとは限りません。

| 実行方式 | 40ステップの中央値 | 従来の直列版に対する速度比 |
| --- | --- | --- |
| 従来の直列版 | 6.63秒 | 1.00 |
| OpenMP・1スレッド | 11.22秒 | 0.59 |
| OpenMP・2スレッド | 6.38秒 | 1.04 |
| OpenMP・4スレッド | 3.71秒 | 1.79 |

OpenMP版を1スレッドに制限するだけでは従来の直列版より遅くなりました。TLSや互換処理・生成コードの違いもあるため、少数コアのPCでは従来の直列版を残すことが重要です。この表は今回の短い試験の実測値であり、一般的な高速化率を保証するものではありません。

### 残る検証

全6組み合わせの比較は `comparison-models.json` に記録します。32×32×15、100ステップ、dt=10秒で、初期・中間・終了時の物理場・全生物トレーサー・GLSの混合係数を比較し、1・2・4スレッドの891件すべてで最大誤差・RMSEとも0でした。風・河川・熱交換を含む短時間試験であり、長期間の保存量収支や潮汐周期の検証を代替しません。上記の速度表は物理・一定拡散だけの測定です。

08の粒子追跡用の追加RUNは、保持した07終了場を直列カーネルへ引き継ぎます。追加RUN中も実際の方式を表示し、終了時に07の並列状態を保持します。追加RUN自体の並列化は対象外です。

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

`numerics.executionMode` が指定方式、`reproducibility.lastExecution` が実際のスレッド数・計算核のパス・SHA-256・切り替え理由です。条件表Excelにも指定方式と実行記録を出力します。指定方式を持たない従来JSONは直列として読み込み、別PCで同じスレッド数が利用できない場合も実験条件は変更しません。

条件保存では `expectedKernel` にモデルに対応するWASMのファイル名・SHA-256・ROMSバージョン・コミットを記録します。`availableKernel` は保存時にこのアプリに同梱されている計算核です。ハッシュは同梱manifestの値であり、配布物の完全性検証は別途行います。

異なる計算核のJSONを開く場合は警告し、実験条件は変更しません。同じモデル種別のまま再保存しても、元のexpectedKernelを無断で現在の値へ変更しません。地形・初期場など従来の条件は同じJSONに保持されます。旧JSONも受け付けます。

このメタデータは計算核を自動取得したり、途中時刻からRestartしたりするものではありません。異なる計算核でも同じ結果になるという保証はしません。

参照：[公式Emscripten 6.0.3のOpenMP構築定義](https://github.com/emscripten-core/emscripten/blob/6.0.3/tools/system_libs.py)、[Flang OpenMP対応](https://flang.llvm.org/docs/OpenMPSupport.html)、[Emscripten pthreads](https://emscripten.org/docs/porting/pthreads.html)、[r-wasm/flang-wasm](https://github.com/r-wasm/flang-wasm)。
