# 実行するスクリプトの選び方

**アプリを使うだけなら、ルートの `00_WebROMSを起動.exe` をダブルクリックしてください。以下の開発スクリプトは不要です。**

| 目的 | 推奨の入口 | 成果物・動作 |
| --- | --- | --- |
| Windowsで起動 | `00_WebROMSを起動.exe` | 画面を準備してブラウザーを開く |
| 開発中の確認 | `pnpm dev` | ソースを `dist/` に反映して開発サーバー起動 |
| 画面をビルド | `pnpm build` | `dist/` とファイル検査用マニフェスト |
| 通常のテスト | `pnpm test` | コア機能の検証 |
| GIS入出力のテスト | `pnpm test:gis` | 地形・等深線・NetCDF・ZIPの検証 |
| ブラウザー操作のテスト | `pnpm build` → `pnpm test:browser` | 実ブラウザーによる操作検証 |
| 配布物の検証 | `pnpm check:release` | 配布整合性・ライセンス・基準計算の検証 |
| 補助的なWindows配布ZIP作成 | `pnpm package:windows` | clone利用には不要。ビルド・検証後、`releases/WebROMS-windows.zip` |

開発コマンドにはNode.js 22以上、pnpm、`pnpm install --frozen-lockfile` が必要です。共通入口の `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/webroms.ps1` は実行可能なタスクを表示します。例：`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/webroms.ps1 -Task gis`。実行ポリシーの指定はこのプロセス内だけで、Windows全体の設定は変更しません。引数なしでは起動・取得・変更は行いません。

## 内部スクリプトの分類

性能改善の内容・計測手順は [計算負荷と性能検証](../docs/PERFORMANCE.md) を参照してください。`benchmark-kernel.mjs` は開発者が候補WASMを比較するためのもので、通常起動には不要です。

`probe-openmp.mjs` は配布用計算核を書き換えずにOpenMP→WASMの成立を検査する開発用試験です。準備・結果は [CPU並列化の試験](../docs/CPU_PARALLEL_TRIAL.md) にあります。

NOAA初期場の事前取得は `node scripts/fetch-woa-spatial.mjs`。N03の表示専用海岸線の再生成は `python scripts/prepare-n03-coastlines.py`（Shapely・NumPyが必要）です。通常起動には実行不要です。元データと参照資料の配置は `data/README.md` を参照してください。地形の地域タイル再生成はメモリ量に応じて `node --max-old-space-size=8192 scripts/prepare-n03-land.mjs` を使用します。

北海道・東北の陸域データを再生成する場合だけ `node scripts/prepare-n03-land.mjs` を実行します。通常起動には不要です。2026年版N03の元Shapefile一式を `data/coastlines/n03-2026/` から読み、`assets/coastlines/n03-2026/` の地域タイルとハッシュ付き索引を生成します。CC BY 4.0の出典・加工表示は同フォルダとTHIRD_PARTY_NOTICES.mdにあります。

個別ファイルのパスはビルド・CIから参照されるため維持しています。通常は上表の入口を使い、以下を順番に全部実行しないでください。

| 分類 | ファイル | 用途・注意 |
| --- | --- | --- |
| 起動入口の保守 | `build-launcher.ps1`, `windows-launcher/Launcher.cs` | Windows標準.NET FrameworkのC#コンパイラーで専用アイコン付きEXEを再生成。利用者は実行不要 |
| 起動の内部処理 | `windows-launcher/start-webroms.ps1` | ルートのEXEが呼ぶ。通常は直接実行しない |
| 画面・配布 | `build.mjs`, `prepare-windows.ps1` | Node版／Windows標準版の画面準備。後者はランチャーが呼ぶ |
| 画面・配布 | `package-windows.ps1` | 準備済み `dist/` を梱包する内部処理。通常は `pnpm package:windows` |
| 依存更新 | `sync-vendor.mjs` | `node_modules/` からブラウザー用ライブラリーとライセンスを更新 |
| 配布検証 | `check-release.mjs`, `compare-reference.mjs`, `validate-runtime.mjs`, `smoke-runtime.mjs` | 整合性・ネイティブ比較・実行核の検査 |
| 配布記録 | `record-release.mjs` | WASM／Worker更新時のハッシュ・検証記録更新。画面変更だけなら不要 |
| データ取得 | `fetch-terrain.mjs`, `fetch-climatology.mjs`, `fetch-climatology-enso.mjs`, `fetch-chlorophyll.mjs`, `fetch-wind.mjs` | 地形・海洋・生物・風の元データ取得。ネット接続と各データ利用条件の確認が必要 |
| データ整備 | `build-japan-tides.mjs`, `prepare-mdt.py`, `prepare-metadata.mjs`, `generate-biology-catalog.mjs` | 潮汐・MDT・変数情報・生態系パラメータ表の生成 |
| 削除候補（保管） | `deletion-candidates/prepare-fes.py` | 旧FES変換補助。標準処理から切り離して保管、配布ZIPには含めない |
| 図・説明資料 | `capture-readme-results.mjs`, `capture-user-guide.mjs`, `render-readme-figures.mjs` | README・利用ガイドの画像生成 |
| 開発環境取得 | `fetch-sources.mjs`, `fetch-toolchain.mjs`, `fetch-intrinsics.mjs`, `prepare-toolchain.sh` | WASM再ビルド用。通常利用・画面修正には不要 |
| WASMビルド | `run-build.sh`, `build-all-kernels.sh`, `build-roms.sh`, `build-biology.sh`, `build-mixing.sh`, `build-heat.sh`, `build-netcdf.sh` | Linuxの準備済みビルド環境が必要。一部はchroot・管理権限を使用 |
| ネイティブ検証 | `build-native.sh`, `build-native-biology.sh`, `run-reference.sh` | 比較対象となるネイティブROMSの構築・実行 |
| ABI・互換処理 | `prepare-abi.py`, `probe-abi.sh`, `patch-runtime-calls.py`, `wasm-toolchain.cmake` | コンパイラー・WASM間の内部互換処理 |
| OpenMP試験 | `build-openmp-runtime.mjs`, `probe-openmp.mjs`, `run-openmp-probe.cjs` | 公式WASM向けOpenMPの構築とFlangの1・2・4スレッド試験。配布用ROMSは変更しない。[手順](../docs/CPU_PARALLEL_TRIAL.md) |
| 並列ROMS構築 | `build-parallel-kernel.mjs`, `prepare-openmp-kernel.sh`, `build-openmp-kernel.sh` | `node scripts/build-parallel-kernel.mjs all` で物理・NPZD・NEMUROの一定拡散／GLS版を隔離構築 |
| 並列数値比較 | `compare-openmp-kernel.mjs`, `compare-parallel-models.mjs`, `benchmark-openmp-kernel.mjs` | 直列版と1・2・4スレッドの場を比較。全モデルは `node scripts/compare-parallel-models.mjs`。速度計測は物理・一定拡散のみ |
| 並列版の配置 | `install-parallel-kernel.mjs` | 全6モデルの比較合格とハッシュを確認して `runtime/openmp/` へ配置。その後 `npm run build` |
| 並列ABI互換 | `flang-openmp.py`, `openmp_tls_compat.py`, `build-threaded-fortran-runtime.py`, `check-openmp-tls.sh` | module変数のWASM TLS化・pthread用FortranRuntime・独立性検証。通常利用には不要 |
| 保守 | `reset-emcache.sh` | ビルドキャッシュのリセット。起動・配布の手順ではない |

ビルド条件の詳細は [技術概要](../docs/TECHNICAL_OVERVIEW.md)、フォルダー全体の役割は [ディレクトリ案内](../docs/SCRIPT_GUIDE.md) を参照してください。

N03陸域の表示用データは `scripts/prepare-n03-display.py` で事前生成します（Shapelyが必要）。自治体ポリゴンを統合して0.25度タイルへ切り取り、`assets/coastlines/n03-2026/display/` に保存します。通常起動時はPython不要で、四隅の緯度経度から交差するタイルIDを直接選択します。計算用の陸海判定データは変更しません。生成済みタイルのキャッシュは `.tools/n03-display-cache/` に置き、ソース・出力のハッシュが一致する場合のみ再利用します。

`node scripts/benchmark-n03-display.mjs` は元の1度タイル方式と表示専用方式の読み込み量・頂点数・処理時間を同一PCで比較します。ネットワークやGPU描画を含まない開発用の計測です。

01では海岸線の準備と同時に同じタイルから陸域の三角形も構築し、共通キャッシュに保持します。N03陸域のON/OFFは表示切り替えで、追加の読み込み・三角形分割は行いません。準備中にONにした場合は既存の処理の完了を待ちます。タイル境界を海岸線として表示しないよう除外しています。

切り出し先が準備済み領域の内側なら、既存の三角形・海岸線をWorkerでクリップして再利用します。表示用タイルの読み直し・ポリゴン三角形分割は行いません。キャッシュがない場合や領域を広げる場合は必要タイルから準備します。計算用の陸海・水深再補完は別処理です。

平面表示のN03陸域・海岸線は `src/map-vector-overlay.js` の透過WebGLレイヤーで描画し、3D表示と同じ形状バッファーを共有します。拡大・移動は正射影カメラで行い、毎回Canvasの巨大パスを再描画しません。WebGL非対応時は従来のCanvasへ戻ります。平面のセル色は再利用し、画面外セルの塗り・数値ラベルは省略します。

`node scripts/fetch-tsugaru-etopo.mjs` は津軽海峡のETOPO 2022・15秒格子を取得して同梱モジュールを生成する保守用です。通常の起動・地形読み込み時には実行不要です。取得済みデータは `.tools/terrain/` にキャッシュし、出典とSHA-256を生成モジュールに記録します。
