# フォルダーと実行入口

## 利用者

Windowsでは、フォルダー先頭の海と再生マークの **`00_WebROMSを起動.exe` だけをダブルクリック**してください。BATは不要です。内部処理は `scripts/windows-launcher/start-webroms.ps1` にまとめており、通常は触りません。`index.html` は画面のソースであり、直接開く入口ではありません。

## 開発・配布担当者

実行コマンドは [scriptsの用途別一覧](../scripts/README.md) にまとめています。共通入口は `scripts/webroms.ps1`、Node環境の入口は `package.json` のpnpmコマンドです。WASMを再ビルドせずに画面だけ修正できます。

| ディレクトリ・ファイル | 役割 | 手で実行するものか |
| --- | --- | --- |
| `app.js`, `index.html`, CSS, `src/` | 画面・モデル条件・可視化・ファイル入出力 | 編集対象。直接実行しない |
| `server.js` | 開発用HTTPサーバー | `pnpm dev` から起動 |
| `scripts/` | ビルド・検証・取得などの管理処理 | 用途別一覧から選択 |
| `runtime/` | コンパイル済みROMS WASM・Worker | アプリが読み込む。ダブルクリックしない |
| `vendor/`, `licenses/` | 配布済みブラウザー依存ライブラリー・利用条件 | 通常はそのまま使用 |
| `roms/`, `native/` | ROMSソース・連携コード | 計算核の再ビルド時のみ使用 |
| `tests/`, `validation/` | 自動テスト・比較基準と記録 | pnpmテスト／配布検証から使用 |
| `docs/` | 利用ガイド・技術資料・例 | 読むための資料 |
| `dist/` | 配信用に組み立てたアプリ | 生成物。ソースの代わりに編集しない |
| `releases/` | Windows配布ZIP・チェックサム・作業用stage | 配布ZIPを利用。stageは起動入口ではない |
| `.tools/`, `tmp/`, `test-results/`, `node_modules/` | ツール・作業結果・依存関係 | 通常起動には操作不要。既存ファイルを一括削除しない |
| `jobs/` | 個別作業用の補助ファイル | 通常の起動・配布手順では使わない |

Linux用の `.sh`、取得用の `fetch-*`、変換用の `prepare-*` を一通り実行する必要はありません。特にビルド環境の準備やキャッシュリセットは、通常の利用手順に含まれません。
