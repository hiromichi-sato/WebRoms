# WebROMS Browser

ROMSベースの海洋計算を、ブラウザ上で準備・実行するためのプロトタイプです。

## 方針

- 利用者の環境ではROMSをコンパイルしない
- GitHub Pagesなどの静的ホスティングで配布できる形にする
- Web UIで、海底地形、初期条件、境界条件、実計算の順に作業する
- 計算核は事前ビルド済みの `runtime/roms.wasm` として同梱する設計にする
- `runtime/roms.wasm` がない場合は、計算設定 `webroms_config.json` を生成する

## 現在の範囲

- 海底地形設定
- 初期条件設定
- ROMS境界変数に合わせた境界条件設定
  - `zeta`
  - `ubar`, `vbar`
  - `u`, `v`
  - `temp`, `salt`
- ブラウザ内の設定プレビュー
- `webroms_config.json` の静的生成

## 実行

`index.html` をブラウザで開きます。

開発用サーバーを使う場合:

```powershell
node server.js
```

その場合は `http://localhost:5173` を開きます。

## ブラウザでROMSを動かす設計

詳細は [BROWSER_ROMS_DESIGN.md](./BROWSER_ROMS_DESIGN.md) を参照してください。

要点は、ユーザーがコンパイルするのではなく、配布物に `runtime/roms.wasm` を含めることです。Webアプリは地形、初期値、境界条件を作り、WASMランタイムへ渡して定常計算を進めます。
