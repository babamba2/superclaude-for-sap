[English](README.md) | [한국어](README.ko.md) | 日本語 | [Deutsch](README.de.md)

# SuperClaude for SAP (sc4sap)

> SAP ABAP 開発のための Claude Code プラグイン — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private) 対応

[![MCP サーバー npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![プラグインバージョン](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## sc4sap とは

SuperClaude for SAP は Claude Code をフルスタック SAP 開発アシスタントへと変身させます。[MCP ABAP ADT サーバー](https://github.com/babamba2/abap-mcp-adt-powerup)(150+ ツール)を介して SAP システムに直接接続し、クラス・関数モジュール・レポート・CDS ビュー・Dynpro・GUI ステータスなどの ABAP オブジェクトを生成・参照・更新・削除できます。

### コア機能

| 機能 | 説明 | スキル |
|------|------|--------|
| **🔌 MCP 自動インストール** | `abap-mcp-adt-powerup` を自動でインストール・構成・接続テストします。MCP の手動設定や `claude_desktop_config.json` の直接編集は不要 — 認証情報は `.sc4sap/sap.env` に保存され、フック/ブロックリストレイヤーも自動登録されます。 | `/sc4sap:setup` |
| **🏗️ 定型化されたプログラム自動生成** | sc4sap の規約に沿って ABAP プログラムをエンドツーエンドで生成: Main + 条件付き Include (t/s/c/a/o/i/e/f/_tst)、OOP/手続き型の分割 (`LCL_DATA` / `LCL_ALV` / `LCL_EVENT`)、完全な ALV (CL_GUI_ALV_GRID + Docking) または SALV、必須の Text Element · CONSTANTS、Dynpro + GUI Status、ABAP Unit テスト — プラットフォーム (ECC / S4 On-Prem / Cloud) まで自動判定。 | `/sc4sap:create-program`, `/sc4sap:autopilot` |
| **🔍 プログラム解析** | 逆方向のインテリジェンス: MCP で ABAP オブジェクトを読み取り Clean ABAP / 性能 / セキュリティ観点でレビュー、または既存プログラムを機能/技術仕様書 (Markdown · Excel) にリバースエンジニア。ソクラテス式の範囲絞り込みで「全て文書化」の肥大化を防止。 | `/sc4sap:analyze-code`, `/sc4sap:program-to-spec` |
| **🩺 運用診断** | 運用障害対応: ST22 ダンプ、SM02 システムメッセージ、/IWFND/ERROR_LOG ゲートウェイエラー、SAT スタイルのプロファイラトレース、ログ、where-used グラフを Claude 上で直接調査し、仮説を絞り、SAP Note 候補を提示、プラグイン/MCP/SAP 接続の健全性まで診断。 | `/sc4sap:analyze-symptom`, `/sc4sap:sap-doctor` |
| **♻️ CBO 再利用 (ブラウンフィールド加速器)** | Customer Business Object (Z パッケージ) を一度インベントリ化 — 頻出の Z テーブル / FM / データエレメント / クラス / 構造体 / テーブル型をカタログ化し `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` に保存。`create-program` / `program-to-spec` は計画時にこのインベントリをロードし、**重複作成ではなく既存 CBO 資産の再利用を優先** — 数百個のレガシー Z オブジェクトを抱えるブラウンフィールドに必須。 | `/sc4sap:analyze-cbo-obj` → `/sc4sap:create-program` |
| **🏭 業界コンテキスト (Industry)** | 14 業界レファレンスファイル (`industry/*.md`) — リテール · ファッション · 化粧品 · タイヤ · 自動車 · 製薬 · 食品飲料 · 化学 · 電子機器 · 建設 · 鉄鋼 · ユーティリティ · 銀行 · 公共。コンサルタントが構成分析 · Fit-Gap · マスターデータ判断時に当該業界ファイルをロードし、業界固有のパターン / 落とし穴 / SAP IS マッピングを反映。 | すべての consultant |
| **🌏 国 / ローカライゼーション (Country)** | 15 カ国別ファイル + `eu-common.md` (KR · JP · CN · US · DE · GB · FR · IT · ES · NL · BR · MX · IN · AU · SG · EU 共通)。日付 / 数値フォーマット · VAT/GST 体系 · 必須 e-Invoicing(SDI / SII / MTD / CFDI / NF-e / 세금계산서 / 金税 / IRN / Peppol / STP / 適格請求書)· 銀行フォーマット(IBAN / BSB / CLABE / SPEI / PIX / UPI / SEPA / 全銀 …)· 給与ローカライゼーション · 法定報告サイクル。analyst / critic / planner は必須、すべての consultant に配線。 | すべての consultant + analyst / critic / planner |
| **🤝 モジュール Consultation (会議・委任)** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect` はモジュール固有のビジネス判断が必要な場合、`## Module Consultation Needed` ブロックで `sap-{module}-consultant` へ委任。システムレベルの課題は `sap-bc-consultant`。一般的な SAP 知識での推測は禁止。 | analyst / critic / planner / architect |

## 要件

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-自動インストール-FF6600)

| 要件 | 詳細 |
|------|------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI インストール済み (Max/Pro サブスクリプション または API キー) |
| **SAP システム** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT 有効化 |

> **MCP サーバー** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)) は `/sc4sap:setup` 実行時に **自動でインストールおよび構成**されます — 手動での事前インストールは不要です。

## インストール

> **注記** — sc4sap は **まだ Claude Code の公式プラグインマーケットプレイスに登録されていません**。当面はこのリポジトリをカスタムマーケットプレイスとして追加してからプラグインをインストールしてください。

### 方法 A — カスタムマーケットプレイスとして登録 (推奨)

Claude Code セッション内で以下を実行します:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

後日のアップデート:

```
/plugin marketplace update babamba2/superclaude-for-sap
/plugin install sc4sap
```

### 方法 B — ソースからインストール

```bash
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

その後 `/plugin marketplace add <ローカルパス>` でローカルのプラグインディレクトリを指定します。

## セットアップ

```bash
# セットアップウィザード — 一度に一問ずつ進行します
/sc4sap:setup
```

### サブコマンド

```bash
/sc4sap:setup                # フルウィザード (既定)
/sc4sap:setup doctor         # /sc4sap:sap-doctor へルーティング
/sc4sap:setup mcp            # /sc4sap:mcp-setup へルーティング
/sc4sap:setup spro           # SPRO コンフィグ自動抽出のみ
/sc4sap:setup customizations # Z*/Y* エンハンスメント + 拡張インベントリのみ
```

### ウィザードの流れ

ウィザードは **一度に一問ずつ** 質問します — 全質問を一括提示しません。`.sc4sap/sap.env` / `.sc4sap/config.json` に既存値があれば現在値を表示し、Enter で維持できます。

| # | ステップ | 内容 |
|---|----------|------|
| 1 | **バージョン確認** | Claude Code のバージョン互換性検証 |
| 2 | **SAP システムバージョン + 業界 (Industry)** | (a) `S4` (S/4HANA — BP, MATDOC, ACDOCA, Fiori, CDS) または `ECC` (ECC 6.0 — XK01/XD01, MKPF/MSEG, BKPF/BSEG) を選択。(b) **ABAP Release** を入力 (例: `750`, `756`, `758`)。(c) **業界選択** — 15 オプションメニュー (retail / fashion / cosmetics / tire / automotive / pharmaceutical / food-beverage / chemical / electronics / construction / steel / utilities / banking / public-sector / other) から選択 — consultant が該当する `industry/*.md` をロード。SPRO テーブル / BAPI / TCode + ABAP 構文範囲 + 業界固有の構成パターンをすべて決定 |
| 3 | **MCP サーバーインストール** | `abap-mcp-adt-powerup` を `<PLUGIN_ROOT>/vendor/abap-mcp-adt/` に clone + build。既にインストール済みならスキップ (`--update` で更新) |
| 4 | **SAP 接続情報** | フィールドごとに一問ずつ — `SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE` (`basic` / `xsuaa`), `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE` (`onprem` / `cloud`), `SAP_VERSION`, `ABAP_RELEASE`, `TLS_REJECT_UNAUTHORIZED` (開発のみ)。`.sc4sap/sap.env` に記録。L4 MCP サーバー側ブロックリスト変数 (`MCP_BLOCKLIST_PROFILE`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`) はコメント例として記録 |
| 5 | **MCP 再接続** | `/mcp` の実行を案内 — 新規インストールしたサーバーを起動 |
| 6 | **接続テスト** | `GetSession` で SAP への往復通信を確認 |
| 7 | **システム情報の確認** | System ID、クライアント、ユーザを表示 |
| 8 | **ADT 権限チェック** | `GetInactiveObjects` で ADT アクセス権を検証 |
| 9 | **`ZMCP_ADT_UTILS` 作成** | 必須ユーティリティ関数グループ (パッケージ `$TMP`、ローカル専用)。`ZMCP_ADT_DISPATCH` (Screen / GUI Status ディスパッチャ) と `ZMCP_ADT_TEXTPOOL` (Text Pool 読み書き) を作成 — 両方とも **RFC 有効化** + アクティベート。既に存在する場合はスキップ |
| 10 | **`config.json` 書き込み** | プラグイン側コンフィグ (`sapVersion` + `abapRelease` — `sap.env` と同期) |
| 11 | **SPRO 抽出 (任意)** | `y/N` プロンプト — 初回抽出はトークン消費が大きいが、`.sc4sap/spro-config.json` キャッシュにより以後の開発でのトークン消費が大幅に削減。スキップしても `configs/{MODULE}/*.md` 静的参照で動作。`scripts/extract-spro.mjs` をモジュール並列で実行 |
| 11b | **🆕 Customization インベントリ (任意)** | `y/N` プロンプト — モジュール別 `configs/{MODULE}/enhancements.md` を解析し、稼働 SAP から顧客が実際に `Z*`/`Y*` オブジェクトで実装している標準 Exit のみをインベントリ化。`.sc4sap/customizations/{MODULE}/{enhancements,extensions}.json` に書き込み。保存ルール: BAdI は Z 実装が存在する場合のみ、SMOD は Z CMOD プロジェクトが含む場合のみ、**GGB0 / GGB1 の Substitution / Validation / Rule** (テーブル `GB03`、各モジュールの `APPLAREA` でスコープ)、**BTE Publish/Subscribe + Process FM** (`TBE24` / `TPS34`、`APPL` でスコープ — FI/CO/PS/TR/AA/PM/SD/HCM)、Append Structure + Custom Field は別ファイル `extensions.json` に保存。`/sc4sap:create-program` (再利用優先) と `/sc4sap:analyze-symptom` (標準 Exit 逆引き) が消費 — これにより、エージェントは並行 BAdI を新設する代わりに、既存の `ZGL0001` 置換や `Z_BTE_1025_*` サブスクライバ FM の拡張を推奨する。`scripts/extract-customizations.mjs` をモジュール並列で実行 |
| 12 | **🔒 ブロックリストフック (必須)** | **(a)** プロファイル選択 — `strict` (既定、全て) / `standard` (PII + 認証 + HR + 取引系財務) / `minimal` (PII + 認証 + HR + Tax) / `custom` (`.sc4sap/blocklist-custom.txt` のユーザリスト)。**(b)** `node scripts/install-hooks.mjs` (user-level) または `--project` (project-level) でインストール。**(c)** BNKA ペイロードでスモークテスト、`permissionDecision: deny` を確認。**(d)** 最終フックエントリ + extend/custom ファイル状態を出力。このステップが成功しないと setup は完了しません |

> **2 層のブロックリストは個別に構成**
> - **L3 (ステップ 12)** — Claude Code `PreToolUse` フック、プロファイルは `.sc4sap/config.json` → `blocklistProfile`。MCP サーバーの種類に関わらず全 Claude Code セッションに適用。
> - **L4 (ステップ 4、任意)** — MCP サーバー内部ガード、プロファイルは `sap.env` → `MCP_BLOCKLIST_PROFILE`。`abap-mcp-adt-powerup` のみに適用。
>
> 推奨: L3 `strict`、L4 `standard`。L3 の変更は `/sc4sap:setup` 再実行、L4 の変更は `/sc4sap:sap-option`。

### セットアップ後

- 健全性チェック: `/sc4sap:sap-doctor`
- 認証情報のローテート / L4 ブロックリスト調整: `/sc4sap:sap-option`
- SPRO 再抽出: `/sc4sap:setup spro`

## 機能

### 25 個の SAP 専門エージェント

| 分類 | エージェント |
|------|-------------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — システム管理、トランスポート管理、診断 |
| **モジュール (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**委任マップ (Module Consultation Protocol):**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` を出力 → `sap-{module}-consultant` (業務セマンティクス) または `sap-bc-consultant` (システムレベル)
- `sap-architect` → `## Consultation Needed` を出力 → Basis トピック(トランスポート戦略、認可、性能、サイジング、システムコピー、パッチ)は `sap-bc-consultant`、モジュール設計の質問は `sap-{module}-consultant`
- `sap-analyst` / `sap-critic` / `sap-planner` は追加で **必須 Country Context** ブロックを持ち、出力前に `country/<iso>.md` のロードを強制
- **Core エージェントの直接 MCP Read アクセス** — `sap-analyst`、`sap-architect`、`sap-code-reviewer`、`sap-critic`、`sap-debugger`、`sap-doc-specialist`、`sap-planner`、`sap-qa-tester`、`sap-writer` が Read-only MCP ツール(パッケージ / DDIC / クラス / プログラム / where-used / ランタイムダンプ)を保有し、ハンドオフなしで SAP オブジェクトを直接参照可能に。書き込み CRUD は `sap-executor`、`sap-planner`、`sap-writer`、`sap-qa-tester`、`sap-debugger` に据え置き。

### 18 個のスキル

| スキル | 説明 |
|--------|------|
| `sc4sap:setup` | プラグインセットアップ — `abap-mcp-adt-powerup` 自動インストール + SPRO コンフィグ生成 + ブロックリストフックインストール |
| `sc4sap:mcp-setup` | MCP ABAP ADT サーバーの単独インストール/再構成ガイド |
| `sc4sap:sap-option` | `.sc4sap/sap.env` の参照・編集 (認証情報・RFC バックエンド・ブロックリストプロファイル・ホワイトリスト) |
| `sc4sap:sap-doctor` | プラグイン + MCP + SAP 接続診断 (RFC バックエンドを含む 6 レイヤ) |
| `sc4sap:create-object` | ABAP オブジェクト生成 (ハイブリッドモード — トランスポート/パッケージ確認 → 生成 → アクティベート) |
| `sc4sap:create-program` | ABAP プログラムフルパイプライン — Main+Include、OOP/手続き型、ALV、Dynpro、Text Elements、ABAP Unit |
| `sc4sap:program-to-spec` | ABAP プログラムを機能/技術仕様書 (Markdown / Excel) にリバースエンジニア |
| `sc4sap:analyze-code` | ABAP コード解析と改善 (Clean ABAP / 性能 / セキュリティ) |
| `sc4sap:analyze-cbo-obj` | **Customer Business Object (CBO) インベントリ** — Z パッケージをスキャンし頻出 Z テーブル/FM/データエレメント/クラス/構造体/テーブル型をカタログ化 → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` に保存。`create-program`/`program-to-spec` が新規作成ではなく **既存 CBO 資産の再利用を優先** |
| `sc4sap:analyze-symptom` | SAP 運用エラーの段階的症状分析 (ダンプ、ログ、SAP Note 候補) |
| `sc4sap:autopilot` | 完全自律実行パイプライン — アイデア → アクティベート・テスト済み ABAP |
| `sc4sap:ralph` | 構文・アクティベート・ユニットテストが全て通過するまでの自己修正永続ループ |
| `sc4sap:ralplan` | コンセンサスベースの計画立案ゲート (analyst / architect / critic 収束) |
| `sc4sap:deep-interview` | 実装前のソクラテス式要件ヒアリング |
| `sc4sap:team` | 並列エージェント協調実行 (ネイティブ Claude Code チーム) |
| `sc4sap:release` | CTS トランスポートリリースワークフロー (検証、リリース、インポート監視) |

### MCP ABAP ADT サーバー — 独自機能

sc4sap は拡張型 ADT MCP サーバー **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)**(150+ ツール)上で動作します。一般的な ADT MCP でサポートされる Class / Program / Table / CDS / Function Module の CRUD に加え、**他の MCP サーバーがサポートしない古典的な Dynpro 成果物にも完全な Read / Update / Create カバレッジ**を提供します:

| 成果物 | 参照 | 作成 | 更新 | 削除 | 備考 |
|--------|------|------|------|------|------|
| **Screen (Dynpro)** | `GetScreen`, `ReadScreen`, `GetScreensList` | `CreateScreen` | `UpdateScreen` | `DeleteScreen` | Dynpro ヘッダー + Flow Logic フルラウンドトリップを MCP JSON でやり取り (大文字 `HEADER` / `FLOW_LOGIC` / `LINE` キー) |
| **GUI Status** | `GetGuiStatus`, `ReadGuiStatus`, `GetGuiStatusList` | `CreateGuiStatus` | `UpdateGuiStatus` | `DeleteGuiStatus` | メニューバー、ファンクションキー、アプリケーションツールバーをプログラマティックに生成・編集 |
| **Text Element** | `GetTextElement` | `CreateTextElement` | `UpdateTextElement` | `DeleteTextElement` | Text Symbol、Selection Text、List Heading — Text Element 強制ルールに必須 |
| **Includes** | `GetInclude`, `GetIncludesList` | `CreateInclude` | `UpdateInclude` | `DeleteInclude` | Main+Include 規約で使用 |
| **Local defs/macros/tests/types** | `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes` | — | `UpdateLocalDefinitions`, `UpdateLocalMacros`, `UpdateLocalTestClass`, `UpdateLocalTypes` | `DeleteLocal*` | プログラム内部のローカルセクションを独立して編集 |
| **Metadata Extension (CDS)** | `GetMetadataExtension` | `CreateMetadataExtension` | `UpdateMetadataExtension` | `DeleteMetadataExtension` | CDS 上の Fiori/UI アノテーションレイヤリング |
| **Behavior Definition / Implementation (RAP)** | `Get/Read BehaviorDefinition`, `Get/Read BehaviorImplementation` | `Create*` | `Update*` | `Delete*` | RAP BDEF + BHV フルサイクル |
| **Service Definition / Binding** | `Get/Read ServiceDefinition`, `Get/Read ServiceBinding`, `ListServiceBindingTypes`, `ValidateServiceBinding` | `Create*` | `Update*` | `Delete*` | OData V2/V4 公開および検証 |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` | — | — | — | 拡張ポイントの探索 |
| **ランタイム & プロファイリング** | `RuntimeListDumps`, `RuntimeAnalyzeDump`, `RuntimeGetDumpById`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`, `RuntimeCreateProfilerTraceParameters`, `RuntimeRunProgramWithProfiling`, `RuntimeRunClassWithProfiling` | — | — | — | ST22 ダンプ分析 + SM02 システムメッセージ + /IWFND/ERROR_LOG ゲートウェイエラー + SAT スタイルのプロファイリングを Claude 内部で実行 |
| **セマンティック / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetAdtTypes`, `GetTypeInfo`, `GetWhereUsed` | — | — | — | 単純構文チェック以上の豊富な解析 |
| **Unit Test (ABAP + CDS)** | `GetUnitTest`, `GetUnitTestResult`, `GetUnitTestStatus`, `GetCdsUnitTest`, `GetCdsUnitTestResult`, `GetCdsUnitTestStatus` | `CreateUnitTest`, `CreateCdsUnitTest` | `UpdateUnitTest`, `UpdateCdsUnitTest` | `DeleteUnitTest`, `DeleteCdsUnitTest` | ABAP Unit と CDS テストフレームワークの両方をサポート |
| **トランスポート** | `GetTransport`, `ListTransports` | `CreateTransport` | — | — | トランスポートライフサイクル全体を MCP で |

特に Dynpro / GUI Status / Text Element の CRUD により `sc4sap:create-program` の **古典 UI パイプライン(ALV + Docking + 選択画面)を AI がエンドツーエンドで完全自動構築**できます — 大多数の ADT MCP サーバーでは実現できないシナリオです。

### 共通規約 (`common/`)

スキルとエージェントが同一基準に従うよう、共通ルールを `common/` フォルダに集約しています。`CLAUDE.md` はこれらのファイルを参照する**薄いインデックス**として再構成され、重複が排除されました。

| ファイル | 内容 |
|----------|------|
| `common/clean-code.md` | **統合 Clean ABAP 標準** — 命名 · 制御フロー · Open SQL · モジュール化 · テスティング · 性能 · セキュリティ · リリース認識 + self-check チェックリスト |
| `common/include-structure.md` | Main プログラム + 条件付き Include (t/s/c/a/o/i/e/f/_tst) |
| `common/oop-pattern.md` | 2 クラス OOP 分割 (`LCL_DATA` + `LCL_ALV` + オプション `LCL_EVENT`) |
| `common/alv-rules.md` | Full ALV (CL_GUI_ALV_GRID + Docking) vs SALV + SALV Factory フィールドカタログ |
| `common/text-element-rule.md` | Text Element 強制 — ハードコーディングリテラル禁止; **2 パス言語ルール**(システムログオン言語 + `'E'` セーフティネットを常に併記; どちらか欠けると MAJOR レビュー指摘) |
| `common/constant-rule.md` | フィールドカタログ以外のマジックリテラルは `CONSTANTS` 必須 |
| `common/procedural-form-naming.md` | ALV 関連の手続き型 FORM は `_{screen_no}` サフィックス |
| `common/naming-conventions.md` | プログラム/Include/LCL/Screen/GUI Status の共通命名 |
| `common/sap-version-reference.md` | ECC vs S/4HANA の差異 (テーブル·TCode·BAPI·パターン) |
| `common/abap-release-reference.md` | ABAP リリース別構文可用性 (インライン宣言·Open SQL 式·RAP 等) |
| `common/spro-lookup.md` | SPRO 参照優先順位 — ローカルキャッシュ → 静的ドキュメント → MCP |
| `common/data-extraction-policy.md` | ブロック対象テーブルに対するエージェントの拒否プロトコル + **`acknowledge_risk` HARD RULE** (リクエストごとの明示的ユーザー承認が必須) |

### 業界レファレンス (`industry/`)

すべての `sap-*-consultant` が構成分析·Fit-Gap·マスターデータ判断の前に参照。各ファイル構成: **Business Characteristics / Key Processes / Master Data Specifics / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls**。

| ファイル | 業界 |
|----------|------|
| `industry/retail.md` | リテール (Article, Site, POS, Assortment) |
| `industry/fashion.md` | ファッション/アパレル (Style × Color × Size, AFS/FMS) |
| `industry/cosmetics.md` | 化粧品 (Batch, Shelf Life, Channel Pricing) |
| `industry/tire.md` | タイヤ (OE/RE, Mixed Mfg, Mold, Recall) |
| `industry/automotive.md` | 自動車 (JIT/JIS, Scheduling Agreement, PPAP) |
| `industry/pharmaceutical.md` | 製薬 (GMP, Serialization, Batch Status) |
| `industry/food-beverage.md` | 食品飲料 (Catch Weight, FEFO, TPM) |
| `industry/chemical.md` | 化学 (Process, DG, Formula Pricing) |
| `industry/electronics.md` | 電子/ハイテク (VC / AVC, Serial, RMA) |
| `industry/construction.md` | 建設 (PS, POC Billing, Subcontracting) |
| `industry/steel.md` | 鉄鋼/金属 (Characteristic-based inventory, Coil, Heat) |
| `industry/utilities.md` | ユーティリティ (IS-U, FI-CA, Device Mgmt) |
| `industry/banking.md` | 銀行 (FS-CD, FS-BP, Parallel Ledger) |
| `industry/public-sector.md` | 公共部門 (Funds Mgmt, Grants Mgmt) |

### 国 / ローカライゼーションレファレンス (`country/`)

すべての consultant + **analyst / critic / planner は必須**。各ファイル構成: **フォーマット(日付 / 数値 / 通貨 / 電話 / 郵便番号 / タイムゾーン) / 言語 & ロケール / 税制 / e-Invoicing & 法定報告 / 銀行 & 決済 / マスターデータ特有事項 / 法定報告 / SAP Country Version / よくあるカスタマイズ / Pitfalls**。

| ファイル | 国 | 主要特性 |
|----------|------|---------|
| `country/kr.md` | 🇰🇷 Korea | 電子税金計算書 (NTS), 事業者登録番号, 住民番号 PII 規制 |
| `country/jp.md` | 🇯🇵 Japan | 適格請求書(2023+), 全銀, 法人番号 |
| `country/cn.md` | 🇨🇳 China | 金税, 发票 / 電子発票, 統一社会信用コード, SAFE 外貨 |
| `country/us.md` | 🇺🇸 USA | Sales & Use Tax (VAT ではない), EIN, 1099, ACH, Nexus |
| `country/de.md` | 🇩🇪 Germany | USt, ELSTER, DATEV, XRechnung / ZUGFeRD, SEPA |
| `country/gb.md` | 🇬🇧 UK | VAT + MTD, BACS / FPS / CHAPS, Brexit 後 GB vs XI |
| `country/fr.md` | 🇫🇷 France | TVA, FEC, Factur-X 2026, SIREN / SIRET |
| `country/it.md` | 🇮🇹 Italy | IVA, FatturaPA / SDI (2019+ 必須), Split Payment |
| `country/es.md` | 🇪🇸 Spain | IVA, SII (リアルタイム 4 日), TicketBAI, Confirming |
| `country/nl.md` | 🇳🇱 Netherlands | BTW, KvK, Peppol, XAF, G-rekening |
| `country/br.md` | 🇧🇷 Brazil | NF-e, SPED, CFOP, ICMS/IPI/PIS/COFINS, Boleto / PIX |
| `country/mx.md` | 🇲🇽 Mexico | CFDI 4.0, SAT, Complementos, Carta Porte, SPEI |
| `country/in.md` | 🇮🇳 India | GST, IRN 電子インボイス, e-Way Bill, TDS |
| `country/au.md` | 🇦🇺 Australia | GST, ABN, STP Phase 2, BAS, BSB |
| `country/sg.md` | 🇸🇬 Singapore | GST 9%, UEN, InvoiceNow (Peppol), PayNow |
| `country/eu-common.md` | 🇪🇺 EU 共通 | 国別 VAT ID フォーマット (VIES), INTRASTAT, ESL, OSS/IOSS, SEPA, GDPR |

`.sc4sap/config.json` → `country` (または `sap.env` → `SAP_COUNTRY`, ISO alpha-2 小文字) で国を識別。Multi-country ロールアウトは関連するすべてのファイルをロード + クロスカントリーポイント(intra-EU VAT、法人間、トランスファープライシング、源泉徴収)を明示。

### SAP プラットフォーム認識 (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` は全ステップの前に **SAP Version Preflight** を実行します。`.sc4sap/config.json` の `sapVersion`(ECC / S4 On-Prem / S/4HANA Cloud Public / Private)と `abapRelease` を確認し、分岐します:

- **ECC** — RAP/ACDOCA/BP 不可、リリース別の構文制限 (インライン宣言 <740、CDS <750 など)
- **S/4HANA On-Premise** — 古典 Dynpro は技術的に可能だが警告、拡張性優先、財務は MATDOC · ACDOCA
- **S/4HANA Cloud (Public)** — **古典 Dynpro 禁止**。RAP + Fiori Elements / `if_oo_adt_classrun` / SALV-only に自動リダイレクト。禁止構文 + Cloud 代替 API の完全リスト: `skills/create-program/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP 優先、Business Partner API

### SPRO コンフィグリファレンス

13 個の SAP モジュール全てに対する組み込みリファレンスデータ:

```
configs/{MODULE}/
  ├── spro.md         # SPRO 設定テーブル/ビュー
  ├── tcodes.md       # トランザクションコード
  ├── bapi.md         # BAPI/FM リファレンス
  ├── tables.md       # 主要テーブル
  ├── enhancements.md # BAdI / User Exit / BTE / VOFM
  └── workflows.md    # 開発ワークフロー
configs/common/       # 共通リファレンス (IDOC、Factory Calendar、DD* テーブル等)
```

**モジュール**: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW

### SPRO ローカルキャッシュ (トークン節約)

`/sc4sap:setup spro` は稼働中の S/4HANA から顧客固有の SPRO カスタマイジングを `.sc4sap/spro-config.json` に抽出します。全 consultant エージェントは `common/spro-lookup.md` の優先順位に従います:

1. **Priority 1 — ローカルキャッシュ** (`.sc4sap/spro-config.json` → `modules.{MODULE}`) — MCP 呼び出しなし
2. **Priority 2 — 静的リファレンス** (`configs/{MODULE}/*.md`)
3. **Priority 3 — リアルタイム MCP クエリ** — ユーザー確認 + トークンコスト警告後のみ

一度抽出しておけば以降の全セッションでトークンを大幅節約できます。

### SAP 特化フック

- **SPRO 自動注入** — Haiku LLM がユーザー入力を分類し、関連モジュールの SPRO コンフィグを自動注入
- **トランスポート検証** — MCP ABAP Create/Update 前にトランスポートの存在確認
- **自動アクティベート** — オブジェクト生成/修正後に ABAP アクティベートを自動トリガー
- **構文チェック** — ABAP エラー発生時にセマンティック解析を自動実行
- **🔒 データ抽出ブロックリスト** — センシティブテーブルの行取得を `PreToolUse` フックで遮断 (下記参照)

### 🔒 データ抽出ブロックリスト

センシティブテーブル(個人情報、認証、給与、銀行、取引財務)の行データが `GetTableContents` / `GetSqlQuery` で抽出されるのを防ぐ必須の多層防御です。sc4sap エージェント呼び出し、ユーザー直接入力、同一セッションの他プラグイン全てに適用されます。

**4 層防御**:

| 層 | 場所 | 役割 |
|----|------|------|
| L1 — エージェント指示文 | `common/data-extraction-policy.md`, consultant agents | ブロック対象参照時にカテゴリ + 理由 + 代替案を案内して拒否 |
| L2 — グローバル指示 | `CLAUDE.md` の "Data Extraction Policy" ブロック | 全 Claude セッション(直接プロンプト含む)にデフォルトロード |
| L3 — Claude Code フック | `scripts/hooks/block-forbidden-tables.mjs` (`PreToolUse`) | MCP 呼び出しをインターセプトし `deny` を返す (プログラマティック遮断) |
| L4 — MCP サーバー (opt-in) | `abap-mcp-adt-powerup` ソース (`src/lib/policy/blocklist.ts`) | 呼び出し主体に関係なく MCP サーバー内部でハード遮断 — `SC4SAP_POLICY=on` 環境変数で有効化 |

**ブロックリストソース**: `exceptions/table_exception.md` は**インデックス**であり、実際のテーブルリストは **11 のセクション別ファイル**に分割されており、各ファイルが小さく grep しやすくなっています。フックはインデックスを除く `*.md` をすべて自動スキャンします。

| Tier | ファイル | 対象 |
|------|----------|------|
| minimal | `banking-payment.md` | 銀行 / 支払認証情報 (BNKA, KNBK, LFBK, REGUH, PAYR, CCARD, FPAYH…) |
| minimal | `master-data-pii.md` | Customer / Vendor / BP マスター PII (KNA1, LFA1, BUT000, BUT0ID, KNVK…) + 関連 CDS ビュー (I_Customer, I_Supplier, I_BusinessPartner, I_Employee…) |
| minimal | `addresses-communication.md` | ADR* (住所·メール·電話·FAX) + CDS (I_Address, I_AddressEmailAddress…) |
| minimal | `auth-security.md` | USR02 パスワードハッシュ, RFCDES, AGR_1251, SSF_PSE_D + CDS (I_User, I_UserAuthorization…) |
| minimal | `hr-payroll.md` | PA* / HRP* / PCL* 情報タイプ & クラスタ (給与·医療·扶養情報など) |
| minimal | `tax-government-ids.md` | KNAS, LFAS, BUT0TX, Brazil J_1B*, BP 税番号 |
| minimal | **`pricing-conditions.md`** | **価格 / 条件 / リベート** — KONH, KONP, KONV, KONA, KOTE*, `PRCD_ELEMENT`, `PRCD_COND_HEAD`, `PRCD_COND`, `A###` (A001–A999 アクセステーブル) + 価格 CDS (I_PriceCondition, I_PricingProcedure, I_RebateAgreement, I_SalesOrderItemPrice…)。**最上位の商業リスク** — 顧客別割引・マージン漏洩 |
| minimal | `custom-patterns.md` | PII 性質の `Z*` / `Y*`, ZHR_*, ZPA_*, ZCUST_*, ZVEND_*, ZKNA_* |
| standard | `protected-business-data.md` | VBAK / BKPF / ACDOCA / VBRK / EKKO / CDHDR / STXH + 取引 CDS (I_JournalEntry, I_SalesOrder, I_BillingDocument, I_PurchaseOrder, I_Payable, I_Receivable…) |
| strict | `audit-security-logs.md` | BALDAT, SLG1, RSAU_BUF_DATA, SNAP, DBTABLOG |
| strict | `communication-workflow.md` | SAPoffice (SOOD, SOC3), ワークフロー (SWWWIHEAD, SWWCONT), ブロードキャスト |

**パターン構文** — 厳密名、`TABLE*` ワイルドカード、`TABLExxx` レガシーワイルドカード、`A###` (新規: `#` = 1 桁数字、`A###` で A001–A999 のみ厳密マッチ)。

### 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery` は `acknowledge_risk: true` パラメータで MCP サーバーの `ask` ゲートを回避できます。**このフラグは利便性フラグではなく、監査境界です** — stderr にログされ、ユーザーがリクエストごとの承認を与えたことを証明します。エージェントは例外なく次のルールに従う必要があります:

1. **初回呼び出しに `acknowledge_risk: true` を設定しない。** フック / サーバーが先にゲートするに任せます。
2. **`ask` 応答を受け取ったら即座に中断** — リトライ禁止。拒否理由をユーザーに公開します。
3. **テーブルと範囲を明示して yes/no 質問**を投げます。
4. **ユーザーから明示的承認キーワード**を受け取った場合のみ `acknowledge_risk: true` で再試行: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `go ahead` / `confirmed`。
5. **曖昧な命令は承認ではない** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"가져와봐"`, `"해봐"`, `"my mistake"`, 沈黙を含む。
6. **per-call · per-table · per-session.** 過去の承認は次のリクエストに持ち越されません。

完全プロトコル: `common/data-extraction-policy.md` → "The `acknowledge_risk` Parameter — HARD RULE"。

**2 つのアクション — `deny` vs `warn`**:

- **`deny`** (デフォルト) — 呼び出しが即座にブロックされ、SAP には送信されません。エージェントがカテゴリ・理由・代替案を説明します。
- **`warn`** — 呼び出しは進行しますが、レスポンスの先頭に `⚠️ sc4sap blocklist WARNING` ブロックがテーブル・カテゴリ・推奨代替案と共に付加されます。業務上日常的にアクセスするカテゴリに適しています。

`warn` デフォルトカテゴリ: **Protected Business Data** (VBAK/BKPF/ACDOCA 等) と **Customer-Specific PII Patterns** (`Z*` テーブル)。その他は全て `deny`。1 回の呼び出しに 1 つでも `deny` テーブルが含まれていれば全体がブロックされます(`deny` 優先)。

**プロファイル選択** — `/sc4sap:setup` 時に必ず 1 つ選択:

| プロファイル | ブロック範囲 |
|-------------|-------------|
| `strict` (デフォルト推奨) | PII + 認証 + HR + 取引財務 + 監査ログ + ワークフロー |
| `standard` | PII + 認証 + HR + 取引財務 |
| `minimal` | PII + 認証 + HR + Tax (一般ビジネステーブル許可) |
| `custom` | 組み込みリストを無視、`.sc4sap/blocklist-custom.txt` のみ使用 |

全プロファイルは `.sc4sap/blocklist-extend.txt` (1 行 1 テーブル名/パターン) の追加項目も併せて適用します。

**インストール** — `/sc4sap:setup` が **必須ステップとして自動インストール**します。手動インストール:

```bash
node scripts/install-hooks.mjs            # ユーザーレベル (~/.claude/settings.json)
node scripts/install-hooks.mjs --project  # プロジェクトレベル (.claude/settings.json)
node scripts/install-hooks.mjs --uninstall
```

**検証**:

```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# 期待結果: "permissionDecision":"deny" を含む JSON
```

ブロック対象テーブルでもスキーマ/DDIC メタデータ (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`)、存在確認 (`SearchObject`)、`GetSqlQuery` 経由の COUNT/SUM 集計は許可されます。一時的な例外は `.sc4sap/data-access-approval-{YYYYMMDD}.md` で文書化します。

**L4 サーバーサイド強制** (直接 JSON-RPC、他の LLM、外部スクリプト等あらゆる呼び出し元を遮断):

```bash
# mcp-abap-adt-powerup 起動時に環境変数で有効化
export SC4SAP_POLICY=on                    # または strict | standard | minimal | custom
export SC4SAP_POLICY_PROFILE=strict        # 任意 (SC4SAP_POLICY=on 時のデフォルト)
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md  # 任意 (追加リスト)
export SC4SAP_ALLOW_TABLE=TAB1,TAB2        # セッション限定の緊急例外 (ログ記録)
```

ブロック対象テーブル呼び出し時、MCP サーバーは `isError: true` とカテゴリ別の理由を返し、SAP システムへはリクエストが送信されません。

### 🔀 RFC バックエンド選択

Screen / GUI Status / Text Element 操作は SAP の RFC FM を経由します。sc4sap は **4 つのトランスポート** を提供 — 環境に合わせて選択:

| `SAP_RFC_BACKEND` | SAP 呼び出し方式 | 利用シーン |
|---|---|---|
| `soap` (デフォルト) | HTTPS `/sap/bc/soap/rfc` | 大半の環境 — ICF ノード有効であれば即動作 |
| `native` | `node-rfc` + NW RFC SDK 直接 RFC | パワーユーザー、最低レイテンシ、ラップトップ毎に SDK 必要 |
| `gateway` | sc4sap-rfc-gateway ミドルウェア経由 HTTPS | 10 名以上のチーム、中央集約型デプロイ |
| 🆕 `odata` | OData v2 サービス `ZMCP_ADT_SRV` | **v0.2.4 新規** — 会社が `/sap/bc/soap/rfc` を遮断し OData Gateway のみ許可する場合。`ZMCP_ADT_SRV` サービスの一度限りの Basis 登録が必要。登録からクライアント切替まで一貫したガイド: [`docs/odata-backend.md`](docs/odata-backend.md) |

`/sc4sap:sap-option` でいつでもバックエンド切り替え、MCP 再接続、`/sc4sap:sap-doctor` で検証。

### 🏢 RFC Gateway (エンタープライズ向け)

数十人規模の SAP 開発チームをターゲットに、sc4sap は **中央 RFC Gateway ミドルウェア** の配置方式をサポートします。開発者の PC に SAP NW RFC SDK、MSVC ビルドツール、S-user SDK ダウンロードは一切不要です。Linux サーバー 1 台が `node-rfc` + SDK を運用し、すべての MCP クライアントは HTTPS/JSON でこのサーバーとだけ通信します。

こんな状況で有効:

- 社内 IT ポリシーで開発者マシンへの SAP NW RFC SDK インストールが禁止されている
- SAP Basis チームが `/sap/bc/soap/rfc` ICF ノードを全社的に無効化している
- 中央集中型の RFC ロギング、レート制限、開発者単位の監査証跡が必要

各開発者 PC での設定:

```
/sc4sap:sap-option
# SAP_RFC_BACKEND=gateway
# SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
# SAP_RFC_GATEWAY_TOKEN=<チーム/個人別 Bearer>
```

Gateway は開発者の SAP 資格情報をリクエスト毎に `X-SAP-*` ヘッダで転送するため、SAP 監査ログには **共有サービスアカウントではなく、実際の開発者 user** が記録されます。

> **非公開リポジトリについてご了承ください。** Gateway は SAP ライセンスの NW RFC SDK を組み込んで Docker イメージをビルドする必要があり、SDK の再配布が禁止されているため、ソースリポジトリを **private** で管理しています。組織単位での導入をご希望の場合は、メンテナにご連絡のうえアクセス権を取得し、ご自身で SDK をダウンロード(S-user 必要)し、社内ネットワークでイメージをビルドする流れになります。個人利用の場合はデフォルトの `SAP_RFC_BACKEND=soap` で十分で、Gateway は不要です。

クライアント側実装 (`abap-mcp-adt-powerup/src/lib/gatewayRfc.ts`) は公開されており、HTTP コントラクトがドキュメント化されているため、Java / Python / Go 等の他言語でも互換 Gateway の実装が可能です。リポジトリへのアクセス、または代替実装に関する相談はメンテナまでお問い合わせください。

## スキル別サンプル & ワークフロー

各スキルの 1 行呼び出しサンプル、実際のプロンプト例、内部動作フローを整理しました。スクリーンショットは今後のアップデートで追加予定です。

### `/sc4sap:setup`

初回オンボーディング: MCP ABAP ADT サーバーインストール、SPRO キャッシュ抽出、データ抽出ブロックリストフックインストール。

```
/sc4sap:setup
```

**フロー** — 接続テスト → SAP バージョン自動検出 (ECC / S4 On-Prem / Cloud) → モジュール別 SPRO 抽出 → ブロックプロファイル選択 (`strict` / `standard` / `minimal` / `custom`) → `settings.json` にフック登録。

> _スクリーンショットプレースホルダー — セットアップウィザード_

---

### `/sc4sap:create-object`

ハイブリッドモードの単一オブジェクト生成: トランスポート + パッケージを対話的に確認してから、生成・スキャフォールド・アクティベートを実行。

```
/sc4sap:create-object
→ "ZCL_SD_ORDER_VALIDATOR クラスを ZSD_ORDER パッケージに作成して"
```

**フロー** — 型推論 (Class / Interface / Program / FM / Table / Structure / Data Element / Domain / CDS / Service Def / Service Binding) → パッケージ・トランスポート確認 → MCP `Create*` → 初期実装作成 → `GetAbapSemanticAnalysis` → アクティベート。

> _スクリーンショットプレースホルダー — 生成確認とアクティベート_

---

### `/sc4sap:create-program`

Main + Include 構造、OOP/手続き型、完全な ALV + Dynpro をサポートする旗艦プログラム生成パイプライン。

```
/sc4sap:create-program
→ "未処理販売オーダーの ALV レポート、選択画面は営業組織 + 日付範囲で"
```

**フロー** — SAP バージョン Preflight (`.sc4sap/config.json`) → **Phase 1A モジュールインタビュー** (モジュールコンサルタント主導 — Industry/Country Preflight、業務目的 / Pain Point / 会社固有ルール / 参照資産の収集、標準 SAP 代替案の提示必須。`module-interview.md` を作成、ゲート ≤ 5%) → **Phase 1B プログラムインタビュー** (`sap-analyst` + `sap-architect` が 7 つの技術ディメンション — 目的タイプ / パラダイム / 表示 / 画面 / データ / パッケージ / テスト範囲 — を確定。`interview.md` を作成、ゲート ≤ 5%) → `sap-planner` が両ファイルを突き合わせ → スペック → ユーザー承認 → executor が Main プログラム + 条件付き Include (t/s/c/a/o/i/e/f/_tst) + Screen + GUI Status + Text Element を作成 → qa-tester が ABAP Unit 作成 → code-reviewer ゲート → アクティベート。Phase 1B は Phase 1A クローズ前には開始しない。プラットフォーム別分岐 (ECC / S4 On-Prem / Cloud Public は古典 Dynpro 禁止 → `if_oo_adt_classrun` / SALV / RAP に自動リダイレクト)。

> _スクリーンショットプレースホルダー — ALV 出力付きプログラムパイプライン_

---

### `/sc4sap:analyze-code`

既存 ABAP オブジェクトを MCP で読み込み、`sap-code-reviewer` が Clean ABAP + パフォーマンス + セキュリティ基準でカテゴリ化された findings と修正案を返します。

```
/sc4sap:analyze-code
→ "ZCL_SD_ORDER_VALIDATOR の Clean ABAP 違反と SELECT * をレビュー"
```

**フロー** — `ReadClass` / `GetProgFullCode` → `GetAbapSemanticAnalysis` + `GetWhereUsed` → sap-code-reviewer 解析 → カテゴリ別レポート (Clean ABAP / パフォーマンス / セキュリティ / SAP 標準) → 任意の自動修正ループ。

> _スクリーンショットプレースホルダー — レビュー結果テーブル_

---

### `/sc4sap:analyze-cbo-obj`

Customer Business Object (CBO) インベントリスキャナー。Z パッケージを走査し、再利用可能な Z テーブル / FM / データエレメント / クラス / 構造体 / テーブル型をカタログ化して保存 → 後続のジェネレーター (`create-program`, `program-to-spec`) が **新規作成ではなく再利用** をデフォルト動作として選択。

```
/sc4sap:analyze-cbo-obj
→ "ZSD_ORDER パッケージを MM モジュールの再利用候補としてスキャン"
```

**フロー** — 対象 Z パッケージに `GetPackageTree` → CBO カテゴリ別の `GetObjectsByType` → 頻度 + 用途ヒューリスティック → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json` に保存。`create-program` / `program-to-spec` は計画時にこの JSON をロードし、`Create*` 呼び出し前に **reuse-first** ゲートを適用。

数百個の既存 Z オブジェクトがあるブラウンフィールドに最適。パッケージごとに 1 回実行し、以降数週間の後続作業で再利用可能。

> _スクリーンショットプレースホルダー — CBO インベントリ出力_

---

### `/sc4sap:analyze-symptom`

ランタイム/運用エラーの段階的調査: ダンプ、ログ、SAP Note 候補。

```
/sc4sap:analyze-symptom
→ "F110 実行中に ZFI_POSTING の 234 行目で MESSAGE_TYPE_X ダンプ"
```

**フロー** — `RuntimeListDumps` / `RuntimeGetDumpById` / `RuntimeAnalyzeDump` (ST22) — 必要に応じて `RuntimeListSystemMessages` (SM02 バナーメッセージ) と `RuntimeGetGatewayErrorLog` (/IWFND/ERROR_LOG) で完全な運用コンテキストを取得 — → スタックトレース解析 → SAP Note 候補検索 → 根本原因仮説 → 対処オプション (設定 / コード / ユーザー対処)。

> _スクリーンショットプレースホルダー — ダンプ分析と Note 候補_

---

### `/sc4sap:program-to-spec`

既存の ABAP プログラムを機能/技術仕様書 (Markdown または Excel) にリバースエンジニアします。ソクラテス式の範囲絞り込みで「全て文書化」の肥大化を防止。

```
/sc4sap:program-to-spec
→ "ZSD_ORDER_RELEASE の仕様 — 承認ロジックと BAdI フックを中心に"
```

**フロー** — 範囲絞り込み Q&A → `GetProgFullCode` / `ReadClass` / includes ウォーク → `GetWhereUsed` + `GetEnhancements` → 構造化仕様 (目的 / 選択画面 / データフロー / API / Enhancement / 権限) → Markdown または Excel 成果物。

> _スクリーンショットプレースホルダー — 生成された仕様成果物_

---

### `/sc4sap:autopilot`

曖昧なアイデアからアクティベート済み・テスト済みの ABAP オブジェクトまでの完全自律パイプライン — `deep-interview` → `ralplan` → エージェントパイプライン → `ralph` ループでクリーンになるまで。

```
/sc4sap:autopilot
→ "カスタム仕入先支払承認ワークフローを作成して"
```

**フロー** — deep-interview でスコープ確定 → ralplan コンセンサスプラン → sap-planner WRICEF 分解 → sap-executor オブジェクト生成 → sap-qa-tester ユニットテスト → sap-code-reviewer ゲート → ralph ループでグリーンになるまでリトライ。

> _スクリーンショットプレースホルダー — オートパイロット進行ストリーム_

---

### `/sc4sap:ralph`

自己修正永続ループ: 構文 Clean + アクティベート成功 + ユニットテスト合格の 3 点セットで終了。「とにかく動くようにして」系タスクに投入。

```
/sc4sap:ralph
→ "ZMM_GR_POSTING と包含 Include のアクティベートエラーを全て解決"
```

**フロー** — 反復: `GetAbapSemanticAnalysis` → エラー特定 → `UpdateProgram` / `UpdateClass` / `UpdateInclude` で修正 → アクティベート → ユニットテスト再実行 → 3 点合格で終了。手動介入または最大反復到達時にキャンセル。

> _スクリーンショットプレースホルダー — ralph 反復ログ_

---

### `/sc4sap:ralplan`

コンセンサスベースのプランニングゲート — 複数エージェントの視点 (analyst / architect / critic) がコーディング前に 1 つのプランに収束。オートパイロットが的外れな物を作る状況を防止。

```
/sc4sap:ralplan
→ "レガシー ZSD_ORDER_RELEASE を RAP ベースのワークフローに再設計するプラン"
```

**フロー** — sap-analyst が要件抽出 → sap-architect が技術設計提案 → sap-critic が反論 → 収束反復 → 承認プランを autopilot / team に引き渡し。

> _スクリーンショットプレースホルダー — ralplan 収束 diff_

---

### `/sc4sap:deep-interview`

コード作成前のソクラテス式要件ヒアリング。隠れた前提、エッジケース、モジュール横断影響を引き出します。

```
/sc4sap:deep-interview
→ "カスタム与信限度チェックが必要"
```

**フロー** — 初期意図 → 階層的質問 (どのモジュール、どのマスター、タイミング、エラー UX、承認者) → 仕様サマリー → ユーザー確認。

> _スクリーンショットプレースホルダー — インタビュー Q&A_

---

### `/sc4sap:team`

並列エージェント協調実行。ネイティブ Claude Code teams (インプロセス) を使用。

```
/sc4sap:team
→ "この WRICEF リストを 4 ワーカーに分けて並列ビルド"
```

**フロー** — 共有タスクリスト → N ワーカーがタスクをピックアップ → 各自 create-object / program / ralph 実行 → トランスポート経由でマージ。

> _スクリーンショットプレースホルダー — tmux ペインビュー / チームダッシュボード_

---

### `/sc4sap:release`

CTS トランスポートリリースワークフロー — リスト、検証 (非アクティブオブジェクトなし・構文エラーなし)、リリース、次システムへのインポート確認。

```
/sc4sap:release
→ "DEVK900123 トランスポートをリリース"
```

**フロー** — `GetTransport` → 検証チェックリスト → STMS リリース → インポート状態モニタリング → インポート後スモークチェック。

> _スクリーンショットプレースホルダー — リリースチェックリスト_

---

### `/sc4sap:sap-doctor`

プラグイン + MCP + SAP システム診断。何かおかしい時にまず実行する。(Claude Code 組み込みの `/doctor` との競合回避のため `doctor` から改名されました。)

```
/sc4sap:sap-doctor
```

**フロー** — プラグインインストール確認 → MCP サーバーハンドシェイク → SAP RFC/ADT 接続 → SPRO キャッシュ鮮度 → フック登録状態 → ブロックリスト有効化確認 → 対処可能なレポート。

> _スクリーンショットプレースホルダー — ドクターレポート_

---

### `/sc4sap:mcp-setup`

`/sc4sap:setup` が MCP 自動インストールをスキップした場合 (例: 既存のグローバル MCP 設定) `abap-mcp-adt-powerup` を個別インストール・再構成するガイド。

```
/sc4sap:mcp-setup
```

### `/sc4sap:sap-option`

`.sc4sap/sap.env` に記録された値を対話的に参照・編集します。SAP 接続認証情報、TLS 設定、そして行抽出セーフガードとしてのブロックリストポリシーを含みます。画面表示時にパスワード・シークレットは自動でマスキングされ、保存前に Before/After diff をプレビューし `sap.env.bak` バックアップを残します。

```
/sc4sap:sap-option
```

主な用途: `SAP_PASSWORD` ローテーション、`SAP_CLIENT` 変更、`MCP_BLOCKLIST_PROFILE` 切替 (`minimal` / `standard` / `strict` / `off`)、監査ログが残る `MCP_ALLOW_TABLE` 例外テーブル登録、`MCP_BLOCKLIST_EXTEND` にサイト別 Z テーブル追加。保存後は `/mcp` 再接続が必要です。

## テックスタック

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)
![MCP](https://img.shields.io/badge/MCP_SDK-Protocol-FF6600)

## Acknowledgments

このプロジェクトは [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) (**허예찬 / Hur Ye-chan**) プラグインに触発されて制作されました。マルチエージェントオーケストレーションパターン、Socratic deep-interview ゲーティング、ralph/autopilot パイプライン、プラグイン全体の思想、全てがこの作品に由来しています。深く感謝いたします — sc4sap はこの作品なしには今の形では存在しえませんでした。

同梱の MCP サーバー (`abap-mcp-adt-powerup`) は **fr0ster** 氏の [**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt) を土台にしています。リクエスト整形、エンドポイントカバレッジ、オブジェクト I/O など、sc4sap のすべてのツール呼び出しが依存する ADT-over-MCP の基盤を、このプロジェクトが築いてくれました。本当に大きな助けになりました — 先駆的な仕事を残してくださった fr0ster 氏に心から感謝いたします。

## 作者

- **백승현 (Paek Seunghyun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## コントリビューター

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## ライセンス

[MIT](LICENSE)
