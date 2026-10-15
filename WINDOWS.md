# Windowsでの利用

**フォルダーの先頭にある「00_WebROMSを起動.exe」が起動入口です。海と再生マークの専用アイコンが目印です。** BATはありません。EXEはインストールせずに、同じフォルダー内の起動処理を呼び出します。ファイル単体ではなくフォルダー全体で移動してください。

このEXEは未署名です。Windowsや組織のポリシーでブロックされた場合は、入手元・ソースを確認し、管理者へ相談してください。警告が出ないことは保証しません。起動用EXEのソースと再生成方法は `scripts/windows-launcher/Launcher.cs` と `scripts/build-launcher.ps1` にあります。

起動後の設定・計算・保存は [スクリーンショット付き利用ガイド](docs/USER_GUIDE.md) を参照してください。例の条件JSONは `docs/examples/quickstart.json` です。

## cloneしたフォルダーから起動

1. リポジトリ全体を `git clone` します。配布ZIPのダウンロード・展開は不要です。
2. フォルダー内の`00_WebROMSを起動.exe`をダブルクリックします。
3. 「WebROMSを起動中」の画面で準備状況を表示し、ブラウザーの接続を確認すると自動で閉じます。ターミナルは表示されません。最後のWebROMSタブを閉じると、約10秒後に裏側のサーバーも終了します。

Node.js、pnpm、事前ビルドは不要です。Windows標準のPowerShellが、同梱の`vendor/`・`runtime/`・ソースから`dist/`を自動生成します。書き込み可能な場所にフォルダー全体を置いてください。起動のたびにソースを反映するので、`git pull`後も同じEXEから起動できます。

<details>
<summary>補助的な配布ZIPを使う場合（cloneする場合は不要）</summary>

1. GitHubのReleasesから`WebROMS-windows.zip`をダウンロードします（`Source code (zip)`ではありません）。右クリックし「すべて展開」を選択します。
2. 展開した`WebROMS`フォルダーの`00_WebROMSを起動.exe`をダブルクリックします。
3. 自動で開いたブラウザーで操作します。終了するときはWebROMSのタブを閉じてください。

Node.js、pnpm、Python、Fortran、管理者権限は不要です。計算用WASMと画面のライブラリーはZIPに含まれます。

</details>

計算用WASMと画面ライブラリーはリポジトリにも含まれます。EXE単体の配布ではなく、cloneしたフォルダー全体を保持してください。計算は外部通信なしで実行できます。未同梱の外部データを取得する場合には通信が必要です。

対象はWindows 10/11、標準のWindows PowerShell 5.1、WebAssemblyとWeb Workerを利用できる現行の64bit EdgeまたはChromeです。3Dに必要なWebGLが使えない場合は平面表示になります。Windowsの全バージョン・すべての企業端末での動作を保証するものではありません。大きな格子はメモリーと計算時間を多く消費するため、まず小さい格子から開始してください。

## 起動できない場合

- cloneしたフォルダーの中から起動してください。EXEだけを別の場所へ移動しないでください。
- HTMLの直接オープンは使えません。必ず専用アイコンのEXEから起動してください。
- 起動に失敗した場合はダイアログに表示します。Windowsの既定のブラウザーがEdgeまたはChromeなどに設定されているか確認してください。
- 使用中のポートは自動で避けます。通常は5176から始まります。再読み込みでは終了しません。同じ起動URLを複数タブで開いた場合は、最後のタブを閉じるまで維持します。
- 未保存の条件・計算結果はタブを閉じると破棄されます。必要なデータは先に保存してください。ブラウザーの強制終了などで終了通知が届かない場合は、最大約20分後にサーバーを自動終了します。
- 開発・診断用の`-NoBrowser`起動では自動終了しません。起動したプロセスを明示的に終了してください。
- 設定はブラウザーに自動保存しません。「設定を保存」でOSダイアログから保存先を選択してください。保存先未指定なら書き込まず、未保存の設定は終了・再読み込みで破棄します。保存済みJSONは「開く」で読み込めます。保存先選択に対応するEdge／Chromeを使用してください。
- PowerShellやローカル通信が組織のポリシーで禁止されている場合は、管理者に相談するか、公開されたGitHub Pages版を使ってください。ランチャーはシステム全体の設定を変更しません。
- 起動時に生成・同梱ファイルのSHA-256を検査します。`Missing application file`または`Damaged application file`が出る場合は、完全なリポジトリまたはZIPを再取得してください。
- clone後に`Could not prepare application files`が出る場合は、`vendor/`・`runtime/`・`scripts/`が揃っていることと、フォルダーに書き込めることを確認してください。

ポートを指定する場合は、展開先のフォルダーで`.\00_WebROMSを起動.exe -Port 5180`を実行します。`-NoBrowser`を追加するとブラウザーの自動起動を抑止できます。

## 開発者向け配布ZIPの作成

Node.js 22以上とpnpmを用意し、プロジェクトのルートで実行します。利用者にはこの作業は不要です。

```powershell
pnpm install --frozen-lockfile
pnpm package:windows
pnpm test:windows
```

`package:windows`は補助的なZIPを生成する開発者向け処理です。clone利用者には不要です。`test:windows`はインストール済みのEdgeを使い、`dist/`・`node_modules/`のないソース一式と配布ZIPの両方で、専用EXE経由の起動を検証します。日本語・空白を含む配置先、使用中ポートの回避、Node.jsなしの起動、外部通信なしの物理・NPZD・NEMURO計算、配布ZIPの欠落・破損の検出も検証します。

起動入口を変更した場合はWindowsで `pnpm build:launcher` を実行し、生成したルートのEXEと `assets/webroms.ico`、起動ソースを同じコミットで含めてください。GitHubにEXEを含めないとclone後の起動入口が不足します。C#コンパイラーは保守時だけ使用し、利用者によるビルドは不要です。

Three.jsやLucideを更新した場合は、依存関係のインストール後に`pnpm sync:vendor`を実行し、更新された`vendor/`・`licenses/three.txt`・`licenses/lucide.txt`もGitに含めてください。

`releases/WebROMS-windows.zip`と`releases/WebROMS-windows.zip.sha256`をGitHub Releaseの添付ファイルとして配布してください。ライセンス類は`dist`内に含まれます。GitHub Actionsの`Windows Package`もWindows環境で同じ作成・検証を実行し、成功した配布物をArtifactsに保存します。Artifactsをダウンロードした場合は、その中のZIPとSHA-256ファイルをReleaseに添付します。
