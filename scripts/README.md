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
| 保守 | `reset-emcache.sh` | ビルドキャッシュのリセット。起動・配布の手順ではない |

ビルド条件の詳細は [技術概要](../docs/TECHNICAL_OVERVIEW.md)、フォルダー全体の役割は [ディレクトリ案内](../docs/SCRIPT_GUIDE.md) を参照してください。

`node scripts/fetch-tsugaru-etopo.mjs` は津軽海峡のETOPO 2022・15秒格子を取得して同梱モジュールを生成する保守用です。通常の起動・地形読み込み時には実行不要です。取得済みデータは `.tools/terrain/` にキャッシュし、出典とSHA-256を生成モジュールに記録します。
