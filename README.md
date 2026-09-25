# WebROMS

ブラウザ内で実際のROMSを実行する海洋モデル作業環境です。コンパイル済みの `runtime/roms.wasm` を同梱しています。利用者にFortran、Python、計算サーバーは不要です。代替のJavaScript流体ソルバーは使用しません。

## 起動

利用者向けには `WebROMS-windows.zip` を配布します。全体を展開し、`start-webroms.bat` をダブルクリックするとブラウザーが開きます。Windows標準のPowerShellを利用するため、Node.js・pnpmのインストールは不要です。対応条件とトラブル対処は [Windows起動ガイド](WINDOWS.md) を参照してください。

ソースコードから開発する場合のみ、Node.js 22以上とpnpmが必要です。ビルド済みの開発用サーバーは以下で起動します。

```powershell
cd C:\work\WebRoms
node server.js
```

表示されたURL（通常 http://localhost:5173 ）を開きます。このウィンドウを閉じるとWebROMSも停止します。

開発・再ビルドする場合は以下を使います。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

WorkerとWASMのためHTTP配信が必要で、HTMLの直接オープンには対応しません。Windows配布ZIPは `pnpm build` 後、`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1` で生成します。Web公開対象は `dist/` 全体です。

## 計算の流れ

1. 海底地形: 格子数・間隔・鉛直層数、地形プリセット、陸域と水深を設定。
2. 初期条件: 温度・塩分・流速・海面高度、一様場や勾配を設定。
3. 境界条件: 東西南北ごとに閉境界・指定値・放射・周期を選択。指定値では海面高度、鉛直平均流速、各層の流速・温度・塩分を設定。
4. 定常計算: 時間刻み、拡散係数、風応力、許容残差、連続判定回数、最大ステップを設定して実行。

3D・平面・断面表示、設定の保存と読込、結果JSONのダウンロードに対応します。設定変更時は古い計算結果を無効化します。

## 計算核と範囲

### 生態系の設定

初期条件の「モデル」でFennel・NPZD (Franks)・NEMUROを選択できます。モデル別の初期濃度、境界面の濃度、格子への塗布、プレビュー、JSON保存に対応します。NPZDは4状態量と13反応パラメータ、NEMUROは11状態量と84反応パラメータを設定できます。反応パラメータは折りたたみ欄にあります。

NPZDの既定値はROMS `npzd_Franks.in`、NEMUROの反応パラメータは`nemuro.in`に基づきます。NEMUROの初期濃度のみ`roms/sample/NEMURO.BOX.f90`のA7サンプルに基づき、mol/Lからmmol/m³へ換算しています。サンプルの反応式や全パラメータを移植したものではありません。状態量・塗布値はモデル別に保存されます。

現在の同梱WASMは物理計算のみで、生態系の時間積分は未対応です。生態系ONでは計算ボタンを無効にしています。設定できることとROMSで実計算できることは区別してください。

ROMS 4.3、コミット `57aecf589a408b1e5490d2db7f9bd0196062a44e` のFortranコードをFlang/EmscriptenでWASM化しています。海面高度、3次元流速、温度・塩分、移流、水平・鉛直拡散、陸域のC格子マスクをROMSが計算します。NetCDF入出力もWASM内で実行します。

現在は直交格子、2～10等分sigma層、固定陸域、静水圧近似の選択構成です。大気熱・淡水フラックスはゼロ、底面は線形抵抗です。濡れ乾き、潮汐データ同化、入れ子格子、生態系、任意のROMSコンパイルオプションには対応していません。急峻な海底、不整合な境界、過大な時間刻みでは発散し得ます。

「定常判定達成」は湿潤点での海面高度・流速・温度・塩分の時間変化が許容値を連続して下回ったことを意味します。厳密解やあらゆる設定の収束を保証しません。最大ステップ到達は収束と区別します。

## 検証

```sh
pnpm test
pnpm build
pnpm check:release
pnpm exec playwright install chromium
pnpm test:browser
```

一様場、陸域と風応力、鉛直拡散の8×8×3格子・100ステップについて、同一入力のネイティブgfortran版と比較済みです。比較記録は `validation/`、配布物のハッシュとツールチェーンは `runtime/manifest.json` にあります。指定値・放射・周期境界、ブラウザの実計算と結果保存も自動テストします。この限定した検証は全構成の同値性を保証しません。

## GitHub公開

GitHub登録後、Settings > Pages > Sourceを **GitHub Actions** に設定し、`Publish Pages` ワークフローを手動実行します。テストと配布物検査後に静的サイトを公開します。通常のpush/PRではCIだけが動作します。

`roms/`、`.tools/`、`node_modules/` は公開対象外です。同梱WASM、manifest、ライセンスは必ず含めてください。詳細は [設計](BROWSER_ROMS_DESIGN.md)、[第三者ライセンス](THIRD_PARTY_NOTICES.md) を参照してください。
