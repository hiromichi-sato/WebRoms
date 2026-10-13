# WebROMS illustration prompts

Generated with the built-in image generation tool. Conceptual explanatory diagrams, not application screenshots. Sources checked on 2026-10-12.

## 1

Use case: infographic-diagram. Create a polished Japanese technical presentation image, 16:9 landscape, high resolution ideally 2560x1440. Slide 1 of a cohesive 3-slide series explaining an actual scientific software product WebROMS. White background, charcoal text, restrained teal, cyan and amber accents, crisp Japanese sans-serif typography, spacious readable labels, elegant engineering schematic with small tangible ocean grid and browser illustrations. No photos, no invented logos, no gradients, no decorative blobs. Prioritize accurately spelled Japanese and exact technical names. Large title, short subtitle, diagram, compact footer. Do not render this prompt or slide instructions.
Title exactly: "WebROMS｜プロダクトの全体構成"
Subtitle: "設定・数値計算・可視化を、利用者のブラウザーで完結"
Main diagram: a left small package "配布パッケージ" contains labels "HTML / CSS / JavaScript", "ROMS実行核（WASM）", "同梱データ・ライセンス". Arrow labelled "読み込み" to a large clearly outlined boundary labeled "利用者のPC・ブラウザー". INSIDE the boundary, show three connected functional areas, not floating decorative cards:
1 left: "条件設定" with a compact vertical list "地形・格子", "生態系・初期条件", "境界・河川・風・熱".
2 center: "数値計算" with a chip labeled "ROMS / WebAssembly", smaller "物理・NPZD・NEMURO", and "Web Workerで実行".
3 right: "結果の可視化" with a clean isometric 3D ocean grid showing colored layered water, a vertical cross-section, small time-series trace; labels "3D・平面・鉛直断面", "コンター・流速・時系列".
Directional arrows: conditions -> calculation labeled "入力を生成", calculation -> visualization labeled "計算結果". Along bottom of browser boundary an explicit file icon and text "ファイルを指定して保存・読み込み". Outside beneath, three labeled export artifacts "設定 JSON", "条件表 Excel", "結果 NetCDF / Shape".
Use 3 concise bottom takeaway statements with check marks: "計算サーバー不要", "利用者側のコンパイル不要", "同梱範囲はオフラインで利用可能".
Footer small but readable: "Windows：BATからローカルHTTP配信を起動。配信と計算は別で、ROMSの計算はブラウザー内。外部データ取得には通信が必要。"
Accuracy: This is a real Fortran ROMS solver compiled to WASM, not a JavaScript substitute. Do not suggest cloud computing, AI numerical surrogate, all datasets bundled, universal exact reproducibility, restart capability or Excel import. Keep all text concise and non-overlapping. Show page number "01 / 03".

## 2

Use case: infographic-diagram. Create slide 2 of a cohesive WebROMS Japanese technical explanation series, a high-resolution 16:9 landscape presentation image. White background, charcoal Japanese sans-serif text, teal/cyan for runtime, amber for compiled computation, minimal flat line icons, elegant professional engineering layout. Large readable Japanese labels and absolutely no text overlap. Main goal: explain that actual ROMS Fortran numerical solver, not a JavaScript imitation, is compiled and bundled into the browser application. Do not add AI, cloud computation, GPUs, remote APIs or browser compiling Fortran.
Title: "WebROMS｜コア技術：ROMSをWASMで内包"
Subtitle: "既存の数値計算コードを、ブラウザーで動く実行核へ"
Upper quarter is an unframed horizontal pipeline under label "開発・ビルド時":
"ROMS 4.3" with subtitle "Fortranソース" plus a small side input "NetCDFライブラリ" -> "Flang / LLVM" -> "Emscripten" -> paired output icons "roms.wasm" and "roms.js". A clear downward arrow from these artifacts to the runtime region, label "事前ビルドして同梱".
Lower main area clearly outlined and labeled "利用者のブラウザー内". Inside left area "メインスレッド" with "条件設定・画面操作", "Three.js / Canvas", "3D・断面・時系列を描画". Inside right area a larger outlined "Web Worker（計算処理）" containing a flow: "JavaScriptブリッジ" -> "ROMS / WASM" -> "計算状態". Under the WASM chip: "物理 / NPZD / NEMURO", "GLS混合 / 固定係数". Small memory/files icon under bridge and WASM: "メモリ上の仮想ファイルシステム" and "ROMS入力・NetCDF入出力". It connects to bridge and solver without excessive crossing lines.
Between main thread and worker, upper arrow right labeled "postMessage：設定・実行指示", lower arrow left labeled "計算結果・進捗". Make arrow directions unmistakable.
Bottom emphasis line: "数値積分はROMSが担当。JavaScriptは入力生成・実行制御・表示を担当。"
Footer readable: "計算サーバーへの送信は不要。利用者にFortran・Python・Linux環境の準備は不要。"
Page number "02 / 03". Avoid unsupported claims: no claim of parallel numerical solver merely worker separation; no entire upstream ROMS feature set; no claim full native bitwise equivalence. This diagram is conceptual, not a screenshot. Render Japanese and file names exactly. Restrained design, plenty of whitespace, technically trustworthy rather than a sales poster.

## 3

Use case: infographic-diagram. Generate a polished Japanese technical explanatory slide for WebROMS, slide 3 of 3. High-resolution 16:9 landscape. Consistent style: white background, charcoal legible Japanese sans-serif, teal/cyan arrows and amber highlights, small file and browser icons, structured engineering infographic, generous spacing. No decoration, no cloud sync, no AI, no exaggerated claims. Text must be accurate, clearly readable and nonoverlapping.
Title: "WebROMS｜実験条件の保存・読み込み・共有"
Subtitle: "設定はJSON、計算結果はNetCDF、説明用の条件表はExcel"
Upper half: horizontally flowing diagram, heading "条件を持ち運び、初期状態から再実行".
Five steps with numbered circles, well-separated short text:
1 "条件を設定" small "地形・初期場・境界・外力・生態系"
2 "JSONで保存" file "project.json", small "保存先を明示的に指定"
3 "「開く」で読み込み" small "JSON.parse"
4 "入力チェック" small "既定値の補完・妥当性検査"
5 "計算入力を再生成" small "格子・初期場・境界・ROMS入力"
Show directional arrows 1->2->3->4->5. Under 5 a short downward arrow into amber highlighted "ROMSで初期状態から再計算". Under steps2-3 a discreet small label "同じWebROMS配布版で共有".
Lower half: left ~55% width a workflow heading "計算結果を配布". A simple left-to-right flow "通常RUN" -> "計算終了" -> "保存用の追加RUN" -> a ZIP icon label "実験パッケージ ZIP". Under additionalRUN, small "期間・間隔を指定". UnderZIP, neatly aligned file inventory:
"project.json ｜ 実験条件"
"conditions.xlsx ｜ 条件・係数・実行入力"
"time_*.nc ｜ 時刻別の3D結果"
"manifest ｜ 配布版・実行核の識別情報"
Lower right ~40% width heading "ファイルの役割" with three simple separated lines using colored file icons:
"JSON：設定の復元・再実行"
"NetCDF：3次元データの入出力"
"Shape：2次元データの入出力"
A smaller line beneath: "Excelは説明・記録用。設定の読み込みにはJSONを使用。"
Footer strip with three separated concise notes:
"ブラウザーへの自動保存なし"
"追加RUN 0時間なら終了場のみ保存"
"Restart（途中状態からの再開）は未対応"
Page "03 / 03".
Accuracy rules: show that JSON settings restoration is NOT restarting simulation from the last timestep, not restoration of saved output history. The ZIP does not contain the application executable. NetCDF initial-data import is separate from project JSON; do not show direct result-NetCDF restart or Excel import. Normal RUN does not automatically archive all results. Byte hashes identify distribution, do not guarantee all research reproducibility. Clear flow and readable typography take priority over decoration; no more content than listed.

## 4

Use case: infographic-diagram. Create an implementation-grounded SOFTWARE ARCHITECTURE diagram of WebROMS, in Japanese, 16:9 landscape, high resolution ideally 2560x1440. This is a fourth supplemental technical slide, not a marketing overview. White background, dark charcoal Japanese sans-serif, teal main thread, amber worker/solver, cool gray storage. Precise alignment and routing, generous whitespace, legible module filenames. No fake screenshots, no decorative blobs, no 3D illustrations; use a rigorous layered architecture diagram with named execution boundaries, modules and directional data flow. No invented backend.
Title exact: "WebROMS｜ソフトウェアアーキテクチャ"
Subtitle: "静的配信・画面処理・計算処理・ファイル保存を分離"
Top thin horizontal deployment strip:
"静的配信" with "ローカルHTTP / 静的ホスティング" -> files "HTML・CSS・JS・WASM・同梱データ" -> large browser boundary below. Small note "配信側はROMSを計算しない".
Main body centered large container "利用者のブラウザー". Within it left 40% container labeled "メインスレッド"; right 55% container labeled "計算Worker｜runtime/roms-worker.js". The main thread contains three vertically stacked blocks:
"UI・実験状態" line "app.js / settings-form.js";
"入力モデル・検証" line "model.js / buildFields / validate";
"可視化" line "view.js / Three.js / Canvas".
Connect UI to input-model, and return calculation results to visualization.
Between main thread and worker, exactly two clear routes: upper right-pointing arrow "postMessage：設定・実行指示", lower left-pointing arrow "計算状態・進捗・出力チャンク".
Inside Worker, an upper box "入力生成｜roms-input.js" with note "格子・初期場・境界・外力を生成"; middle box "実行制御・状態取得" note "runtime-state.js / snapshot"; bottom nested execution container "WebAssembly 実行環境" containing "roms.js：Emscriptenランタイム", "native/bridge.f90：C ABI", a prominent solver block "ROMS 4.3 + NetCDF", and sublabel "物理 / NPZD / NEMURO × GLS / 固定係数". Alongside within execution container a small distinct memory region labeled "仮想FS・WASMメモリ" with "roms.in / *.nc / 計算配列". A downward call arrow from execution control to C ABI labeled "_webroms_init / _webroms_step"; upward thin arrow "_webroms_copy". Input-generation connects to virtualFS; do not make browser call a remote computation server.
Below main browser diagram: a short export module strip inside browser boundary, labeled "明示的なファイル入出力" with filenames "explicit-save.js / results-export.js / stream-export.js / experiment-report.js". A downward arrow labeled "保存先を指定" to separate region OUTSIDE browser boundary labeled "利用者のファイル". This region shows four clearly labeled file icons: "JSON：設定", "Excel：条件表", "NetCDF / Shape：データ", "ZIP：結果・設定・条件表". An upward return arrow from JSON to input-model labeled "読込・検証・再構築".
Footer line: "ブラウザーへの自動保存なし。JSON読込は初期条件からの再実行用。Restartは未対応。"
Small corner identifier "ARCHITECTURE / 04".
Technical constraints: no cloud DB, no REST simulation API, no Node.js requirement for end users, no unimplemented restart, no wasm machine-code representation as Fortran interpretation. The numerical solver is compiled in advance; Web Worker isolates UI from numerical integration, not a claim of parallel ROMS MPI. Export module strip is conceptual shared browser code, not a separate server. Keep typography readable; use orthogonal arrows with clear heads and no crossed text.

## Architecture correction

Edit the immediately preceding WebROMS architecture diagram only. Preserve all typography, colors, sections, module filenames, boundaries, all content and layout except the arrow-routing corrections specified here. Make a clean technically accurate final diagram.
1. The orange left-pointing arrow labeled "計算状態・進捗・出力チャンク" currently incorrectly enters "入力モデル・検証". Reroute it downward within the gap between the two big panels so the left arrowhead enters the RIGHT edge of the "可視化" block instead. Its label stays in the gap, readable and without crossing any text. Do not draw results into the input model.
2. Reverse the teal vertical arrow currently between "可視化" and "入力モデル・検証": it must point DOWN from "入力モデル・検証" into "可視化", representing initial-field preview. Keep the arrow from UI down into input-model.
3. Remove the upward teal arrow between the "明示的なファイル入出力" strip and "可視化". The JSON loading path should instead route from the file IO strip into the LEFT edge of "入力モデル・検証" using the narrow left-hand inner margin of the main-thread panel, never through the visualization block. If there is insufficient space, omit this inner path rather than overlapping labels; the already labeled external "読込・検証・再構築" arrow from the JSON file can remain and is sufficient.
Do not introduce any new claims, labels, blocks, icons or file names. All Japanese must remain spelled exactly as in the original. Keep 16:9 landscape dimensions.

