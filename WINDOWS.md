# Windowsでの利用

## cloneしたフォルダーから起動

1. リポジトリをcloneします（GitHubのソースZIPを全体展開しても起動できます）。
2. フォルダー内の`start-webroms.bat`をダブルクリックします。
3. 起動用ファイルの準備後、ブラウザーが開きます。黒い起動ウィンドウは開いたままにしてください。

Node.js、pnpm、事前ビルドは不要です。Windows標準のPowerShellが、同梱の`vendor/`・`runtime/`・ソースから`dist/`を自動生成します。書き込み可能な場所にフォルダー全体を置いてください。起動のたびにソースを反映するので、`git pull`後も同じバッチから起動できます。

## 配布ZIPから起動

1. GitHubのReleasesから`WebROMS-windows.zip`をダウンロードします（`Source code (zip)`ではありません）。右クリックし「すべて展開」を選択します。
2. 展開した`WebROMS`フォルダーの`start-webroms.bat`をダブルクリックします。
3. 自動で開いたブラウザーで操作します。黒い起動ウィンドウは開いたままにしてください。

Node.js、pnpm、Python、Fortran、管理者権限は不要です。計算用WASMと画面のライブラリーはZIPに含まれます。計算にはインターネット接続も不要です。地図タイル・ETOPO・JODCなど外部データの取得には接続が必要です。

対象はWindows 10/11、標準のWindows PowerShell 5.1、WebAssemblyとWeb Workerを利用できる現行の64bit EdgeまたはChromeです。3Dに必要なWebGLが使えない場合は平面表示になります。Windowsの全バージョン・すべての企業端末での動作を保証するものではありません。大きな格子はメモリーと計算時間を多く消費するため、まず小さい格子から開始してください。

## 起動できない場合

- ZIPの中から直接起動せず、フォルダー全体を展開してください。`dist`を移動・削除しないでください。
- HTMLの直接オープンは使えません。必ずバッチから起動してください。
- ブラウザーが開かない場合は起動ウィンドウの`http://127.0.0.1:.../`をEdgeまたはChromeに貼り付けてください。
- 使用中のポートは自動で避けます。通常は5176から始まります。起動ウィンドウを閉じると停止します。
- 保存設定はブラウザー・URLごとに分かれます。ポート変更や別PCへの移行前に「設定を保存」でJSONを書き出してください。
- PowerShellやローカル通信が組織のポリシーで禁止されている場合は、管理者に相談するか、公開されたGitHub Pages版を使ってください。ランチャーはシステム全体の設定を変更しません。
- 起動時に生成・同梱ファイルのSHA-256を検査します。`Missing application file`または`Damaged application file`が出る場合は、完全なリポジトリまたはZIPを再取得してください。
- clone後に`Could not prepare application files`が出る場合は、`vendor/`・`runtime/`・`scripts/`が揃っていることと、フォルダーに書き込めることを確認してください。

ポートを指定する場合は、展開先のフォルダーで`.\start-webroms.bat -Port 5180`を実行します。`-NoBrowser`を追加するとブラウザーの自動起動を抑止できます。

## 開発者向け配布ZIPの作成

Node.js 22以上とpnpmを用意し、プロジェクトのルートで実行します。利用者にはこの作業は不要です。

```powershell
pnpm install --frozen-lockfile
pnpm package:windows
pnpm test:windows
```

`package:windows`はビルドとWASM・参照計算の検査を行ってからZIPを生成します。`test:windows`はインストール済みのEdgeを使い、`dist/`・`node_modules/`のないソース一式と配布ZIPの両方で、バッチ経由の起動を検証します。日本語・空白を含む展開先、使用中ポートの回避、Node.jsなしの起動、外部通信なしの物理・NPZD・NEMURO計算、配布ZIPの欠落・破損の検出も検証します。

Three.jsやLucideを更新した場合は、依存関係のインストール後に`pnpm sync:vendor`を実行し、更新された`vendor/`・`licenses/three.txt`・`licenses/lucide.txt`もGitに含めてください。

`releases/WebROMS-windows.zip`と`releases/WebROMS-windows.zip.sha256`をGitHub Releaseの添付ファイルとして配布してください。ライセンス類は`dist`内に含まれます。GitHub Actionsの`Windows Package`もWindows環境で同じ作成・検証を実行し、成功した配布物をArtifactsに保存します。Artifactsをダウンロードした場合は、その中のZIPとSHA-256ファイルをReleaseに添付します。
