# Windowsでの利用

## 配布ZIPから起動

1. `WebROMS-windows.zip`を右クリックし「すべて展開」を選択します。
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
- `Missing application file`が出る場合は配布ZIPを再取得してください。GitHubの「Source code (zip)」はビルド済み配布物とは異なります。

## 開発者向け配布ZIPの作成

Node.js 22以上とpnpmを用意し、プロジェクトのルートで実行します。利用者にはこの作業は不要です。

```powershell
pnpm install --frozen-lockfile
pnpm build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1
```

`releases/WebROMS-windows.zip`とSHA-256ファイルを配布してください。ライセンス類は`dist`内に含まれます。
