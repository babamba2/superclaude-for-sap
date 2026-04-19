# 機能詳細

← [README に戻る](../README.ja.md) · [インストール →](INSTALLATION.ja.md)

## 目次

- [25 の SAP 専門エージェント](#25-の-sap-専門エージェント)
- [18 スキル](#18-スキル)
- [スキル — 例 & ワークフロー](#スキル--例--ワークフロー)
- [MCP ABAP ADT サーバー機能](#mcp-abap-adt-サーバー--固有機能)
- [共有規約](#共有規約-common)
- [コンテキストローディングアーキテクチャ (v0.5.2+)](#コンテキストローディングアーキテクチャ-v052)
- [レスポンスプリフィックス規約 (v0.5.2+)](#レスポンスプリフィックス規約-v052)
- [業界リファレンス](#業界リファレンス-industry)
- [国別ローカライゼーション](#国別ローカライゼーションリファレンス-country)
- [アクティブモジュール統合](#アクティブモジュール統合)
- [SAP プラットフォーム認識](#sap-プラットフォーム認識-ecc--s4-on-prem--cloud)
- [SPRO 構成リファレンス](#spro-構成リファレンス)
- [SAP 固有フック](#sap-固有フック)
- [データ抽出ブロックリスト](#-データ抽出ブロックリスト)
- [acknowledge_risk HARD RULE](#-acknowledge_risk--hard-rule)
- [RFC バックエンド選択](#-rfc-バックエンド選択)
- [RFC ゲートウェイ (Enterprise)](#-rfc-ゲートウェイ-enterprise-デプロイ)

## 25 の SAP 専門エージェント

| カテゴリ | エージェント |
|---------|-------------|
| **Core (10)** | Analyst, Architect, Code Reviewer, Critic, Debugger, Doc Specialist, Executor, Planner, QA Tester, Writer |
| **Basis (1)** | BC Consultant — システム管理、トランスポート管理、診断 |
| **Modules (14)** | SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW |

**委譲マップ (Module Consultation Protocol)**:
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant` (業務意味論) または `sap-bc-consultant` (システムレベル)
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant` (トランスポート戦略、権限、パフォーマンス、サイジング、パッチ) またはモジュールコンサルタント
- `sap-analyst` / `sap-critic` / `sap-planner` は必須の **Country Context** ブロック (`country/<iso>.md` をロード) を持つ
- **Core エージェントの直接 MCP 読み取りアクセス** — パッケージ / DDIC / クラス / プログラム / where-used / ランタイムダンプツールを読み取り専用で保有。書き込み CRUD は `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger` に集中

## 18 スキル

| スキル | 説明 |
|--------|------|
| `sc4sap:setup` | プラグインセットアップ — MCP サーバー自動インストール、SPRO 構成生成、ブロックリストフックインストール |
| `sc4sap:mcp-setup` | スタンドアロン MCP ABAP ADT サーバーインストール/再構成ガイド |
| `sc4sap:sap-option` | `.sc4sap/sap.env` の表示/編集 (認証、RFC バックエンド、ブロックリスト、アクティブモジュール) |
| `sc4sap:sap-doctor` | プラグイン + MCP + SAP 診断 (6 レイヤー) |
| `sc4sap:create-object` | ABAP オブジェクト作成 (ハイブリッドモード — トランスポート + パッケージ確認、作成、アクティブ化) |
| `sc4sap:create-program` | フル ABAP プログラムパイプライン — Main+Include、OOP/Procedural、ALV、Dynpro、Text Elements、ABAP Unit |
| `sc4sap:program-to-spec` | ABAP プログラムを機能/技術仕様にリバースエンジニアリング (Markdown / Excel) |
| `sc4sap:analyze-code` | ABAP コード解析 (Clean ABAP / パフォーマンス / セキュリティ) |
| `sc4sap:analyze-cbo-obj` | CBO インベントリスキャナー + クロスモジュールギャップ解析 |
| `sc4sap:analyze-symptom` | SAP 運用エラー/症状のステップバイステップ解析 (ダンプ、ログ、SAP Note 候補) |
| `sc4sap:trust-session` | INTERNAL-ONLY — セッション全体 MCP パーミッションブートストラップ |
| `sc4sap:deep-interview` | 実装前の Socratic 要件収集 |
| `sc4sap:team` | 調整された並列エージェント実行 (ネイティブ Claude Code teams) |
| `sc4sap:release` | CTS トランスポートリリースワークフロー |

## スキル — 例 & ワークフロー

### `/sc4sap:create-object`
ハイブリッドモード単一オブジェクト作成: トランスポート + パッケージを対話的に確認後、作成・スキャフォールド・アクティブ化。
```
/sc4sap:create-object
→ "パッケージ ZSD_ORDER にクラス ZCL_SD_ORDER_VALIDATOR を作成"
```
フロー: 型推論 → パッケージ + トランスポート確認 → MCP `Create*` → 初期実装 → `GetAbapSemanticAnalysis` → アクティブ化。

### `/sc4sap:create-program`
フラグシッププログラム作成パイプライン — Main + Include ラッピング、OOP または Procedural、フル ALV + Dynpro サポート。
```
/sc4sap:create-program
→ "未清算販売注文用 ALV レポート作成、販売組織 + 日付範囲の選択画面"
```
フロー (Phase 0–8):
- Phase 0 — SAP バージョン preflight + アクティブモジュールロード
- Phase 1A — モジュールコンサルタント業務インタビュー (業界/国 preflight、業務目的、標準 SAP 代替案)
- Phase 1B — `sap-analyst` + `sap-architect` 技術インタビュー (7 次元)
- Phase 2 — CBO + カスタマイズ再利用ゲートでの計画
- Phase 3 — 仕様書 + ユーザー承認
- Phase 3.5 — 実行モードゲート (`auto` / `manual` / `hybrid`)
- Phase 4 — 並列 Include 生成 → バッチアクティブ化
- Phase 5 — ABAP Unit
- Phase 6 — 4 バケット規約レビュー (Sonnet 並列、MAJOR 発見で Opus エスカレーション)
- Phase 7 — デバッグエスカレーション
- Phase 8 — タイミングテーブル付き完了レポート

### `/sc4sap:analyze-code`
```
/sc4sap:analyze-code
→ "ZCL_SD_ORDER_VALIDATOR の Clean ABAP 違反と SELECT * 使用をレビュー"
```

### `/sc4sap:analyze-cbo-obj`
Z パッケージを走査、再利用可能資産をカタログ化、クロスモジュールギャップ解析。
```
/sc4sap:analyze-cbo-obj
→ "ZSD_ORDER パッケージから MM モジュール再利用候補をスキャン"
```
フロー: `GetPackageTree` → カテゴリ別 walk → 頻度ヒューリスティクス → クロスモジュールギャップチェック → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`。

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "F110 中の ZFI_POSTING 234 行目 MESSAGE_TYPE_X ダンプ"
```
フロー: `RuntimeListDumps` → `RuntimeAnalyzeDump` → スタックトレース → SAP Note 候補 → 修復オプション。

### `/sc4sap:program-to-spec`
Socratic scope narrowing で ABAP プログラムを仕様書にリバースエンジニアリング (Markdown/Excel)。

### `/sc4sap:team`
ネイティブ Claude Code teams で調整された並列エージェント実行。

### `/sc4sap:release`
CTS トランスポートリリースワークフロー — リスト、検証、リリース、インポート確認。

### `/sc4sap:sap-doctor`
プラグイン + MCP + SAP 接続診断。問題発生時に最初に実行。

### `/sc4sap:sap-option`
`.sc4sap/sap.env` の表示/編集 — 認証、RFC バックエンド、ブロックリストポリシー、アクティブモジュール。シークレットはマスク。

## MCP ABAP ADT サーバー — 固有機能

sc4sap は **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)** (150+ ツール) で駆動。通常の Class / Program / Table / CDS / FM CRUD を超えて、ほとんどの MCP サーバーが扱わない **classic Dynpro アーティファクトの完全 R/U/C カバレッジ**を追加:

| アーティファクト | カバレッジ |
|--------------|-----------|
| **Screen (Dynpro)** | `GetScreen` / `CreateScreen` / `UpdateScreen` / `DeleteScreen` — ヘッダー + フローロジックのラウンドトリップ |
| **GUI Status** | `GetGuiStatus` / `CreateGuiStatus` / `UpdateGuiStatus` / `DeleteGuiStatus` — メニューバー、ファンクションキー、ツールバー |
| **Text Element** | `GetTextElement` / `CreateTextElement` / `UpdateTextElement` / `DeleteTextElement` — テキストシンボル、選択テキスト、リスト見出し |
| **Includes** | `GetInclude` / `CreateInclude` / `UpdateInclude` / `DeleteInclude` — Main+Include 規約 |
| **Local 定義/マクロ/テスト/型** | プログラム内ローカルセクションを独立編集 |
| **Metadata Extension (CDS)** | Fiori/UI アノテーションレイヤリング |
| **Behavior Definition / Implementation (RAP)** | フル RAP BDEF + BHV サイクル |
| **Service Definition / Binding** | OData V2/V4 エクスポージャー + `ValidateServiceBinding` |
| **Enhancements / BAdI** | `GetEnhancements`, `GetEnhancementSpot`, `GetEnhancementImpl` ディスカバリ |
| **Runtime & Profiling** | `RuntimeAnalyzeDump`, `RuntimeListSystemMessages`, `RuntimeGetGatewayErrorLog`, `RuntimeGetProfilerTraceData`, `RuntimeRunProgramWithProfiling` — ST22/SM02/`/IWFND/ERROR_LOG`/SAT プロファイリングを Claude から |
| **Semantic / AST** | `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetWhereUsed` |
| **Unit Tests** | ABAP Unit (`CreateUnitTest`) と CDS Unit (`CreateCdsUnitTest`) 両方 |
| **Transport** | `GetTransport`, `ListTransports`, `CreateTransport` |

## 共有規約 (`common/`)

クロススキルの作成規則が `common/` に配置。`CLAUDE.md` はこれらのファイルを参照する薄いインデックス。

| ファイル | 内容 |
|---------|------|
| `clean-code.md` + `clean-code-oop.md` + `clean-code-procedural.md` | Clean ABAP 標準、パラダイム別分離 |
| `include-structure.md` | Main + 条件付き Include セット (t/s/c/a/o/i/e/f/_tst) |
| `oop-pattern.md` | 2 クラス OOP 分離 (`LCL_DATA` + `LCL_ALV` + `LCL_EVENT`) |
| `alv-rules.md` | フル ALV (CL_GUI_ALV_GRID + Docking) vs SALV + SALV-factory fieldcatalog |
| `text-element-rule.md` | 必須 Text Elements — 2-pass 言語規則 (primary + `'E'` 安全網) |
| `constant-rule.md` | 必須 CONSTANTS (non-fieldcatalog マジックリテラル) |
| `procedural-form-naming.md` | ALV バインドされた FORM の `_{screen_no}` サフィックス |
| `naming-conventions.md` | プログラム、Include、LCL_*、スクリーン、GUI ステータスの共有ネーミング |
| `sap-version-reference.md` | ECC vs S/4HANA 差異 |
| `abap-release-reference.md` | リリース別 ABAP 構文可用性 |
| `spro-lookup.md` | SPRO 照会優先順位 (ローカルキャッシュ → 静的 → MCP) |
| `data-extraction-policy.md` | エージェント拒否プロトコル + `acknowledge_risk` HARD RULE |
| `active-modules.md` | クロスモジュール統合マトリックス (MM↔PS, SD↔CO, QM↔PP…) |
| `context-loading-protocol.md` | 4-tier オンデマンドファイルロード (global → role → triggered → per-task) |
| `model-routing-rule.md` | Sonnet / Opus / Haiku ルーティング + レスポンスプリフィックス規約 |
| `ok-code-pattern.md` | Procedural スクリーン OK_CODE 3 段階契約 (TOP 宣言 → スクリーン NAME → PAI FORM ローカルルーティング) |
| `field-typing-rule.md` | DDIC フィールドタイピング優先順位 (Standard DE → CBO DE → 新 DE → プリミティブ) |
| `function-module-rule.md` | FM ソース規約 (IMPORTING/EXPORTING/TABLES インラインシグネチャ) |
| `transport-client-rule.md` | すべての `CreateTransport` は `sap.env` からの明示的 client 必須 |
| `ecc-ddic-fallback.md` | ECC `$TMP` ヘルパーレポートパス (Table/DTEL/Domain 作成) |
| `cloud-abap-constraints.md` | S/4 Cloud Public 禁止ステートメント + Cloud-native API 代替 |
| `customization-lookup.md` | 既存 Z*/Y* BAdI 実装 / CMOD / form-exit / append 再利用ゲート |

## コンテキストローディングアーキテクチャ (v0.5.2+)

sc4sap のルールコーパスは膨大 — 25+ `common/*.md` + 14 `configs/{MODULE}/*.md` + 30+ 業界/国別ファイル。エージェントディスパッチごとに全ファイルをロードするとトークン浪費 + モデル注意力の希薄化が発生。**4-tier コンテキストローディングモデル** ([`common/context-loading-protocol.md`](../common/context-loading-protocol.md) で定義) は「常にロードする安全ガードレール」「役割別ベースライン」「条件トリガー」「per-task キット」を分離。

| Tier | ロードタイミング | ファイル |
|------|-----------------|----------|
| **Tier 1 — グローバル必須** | すべてのエージェント、すべてのスキル、セッション開始 | `data-extraction-policy.md`, `sap-version-reference.md`, `naming-conventions.md`, `context-loading-protocol.md`, `model-routing-rule.md` |
| **Tier 2 — 役割別必須** | エージェントの役割グループ固定セット、セッション開始 | 役割グループによって異なる (下記参照) |
| **Tier 3 — トリガーロード** | 現在のタスクが条件に一致する場合 | ALV → `alv-rules.md` · Procedural → `clean-code-procedural.md` + `ok-code-pattern.md` · `CALL SCREEN` → `ok-code-pattern.md` · ECC → `ecc-ddic-fallback.md` · industry/country 設定 → 該当ファイル · 等 |
| **Tier 4 — Per-Task キット** | ディスパッチするスキル/phase/bucket が宣言 | `phase4-parallel.md` の wave 別、`phase6-review.md` の §1-§12 別 |

### Tier 2 役割グループ

| 役割グループ | エージェント | Tier 2 追加 |
|-------------|-------------|-------------|
| **Code Writer** | `sap-executor`, `sap-qa-tester`, `sap-debugger` | `clean-code.md`, `abap-release-reference.md`, `transport-client-rule.md`, `include-structure.md` (+ パラダイムファイル) |
| **Reviewer** | `sap-code-reviewer`, `sap-critic` | `clean-code.md`, `abap-release-reference.md`, `include-structure.md` (Phase 6 バケット別絞り込み) |
| **Planner / Architect** | `sap-planner`, `sap-architect` | `include-structure.md`, `active-modules.md`, `customization-lookup.md`, `field-typing-rule.md` |
| **Analyst / Writer** | `sap-analyst`, `sap-writer` | `active-modules.md` |
| **Doc Specialist** | `sap-doc-specialist` | *(なし — タスク駆動)* |
| **Module Consultant** | 14 モジュールコンサルタント (SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, BW, Ariba) | `spro-lookup.md`, `customization-lookup.md`, `active-modules.md`, `configs/{MODULE}/{spro,tcodes,bapi,tables,enhancements,workflows}.md` |
| **Basis Consultant** | `sap-bc-consultant` | `transport-client-rule.md`, `configs/common/*.md` |

### 強制

すべての `agents/*.md` は `<Agent_Prompt>` の先頭の `<Mandatory_Baseline>` ブロックで役割グループを宣言。エージェントは MCP 呼び出し前のセッション開始時に Tier 1 + Tier 2 をロード。スキルプロンプトは Tier 4 (per-task) の追加のみを宣言し、Tier 1+2 は前提。MAJOR ブロッカー時はエージェントが `BLOCKED — context kit insufficient: <list>` を返し、スキルが更新されたキットを提供。

### 測定効果

- Per-dispatch トークン: pre-v0.5.0 の暗黙的 load-all パターン比 −40 ~ −60%。
- `/sc4sap:create-program` での Opus 使用比率: −50% (`model-routing-rule.md` ルーティングマトリックス)。
- Reviewer MAJOR 発見検出精度: 向上 — §1-§12 の各バケットが 12 ルール同時スキャンではなく該当ルールのみをコンテキストに保持。

## レスポンスプリフィックス規約 (v0.5.2+)

すべての `/sc4sap:*` スキルトリガーレスポンスは、ユーザーがどのモデルが作業中でどの sub-agent がディスパッチされたかを一目で確認できるよう、以下の一行プリフィックスで開始:

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

例:

```
[Model: Opus 4.7]
— 純粋なメインスレッド応答、sub-agent ディスパッチなし

[Model: Opus 4.7 · Dispatched: Sonnet×2]
— メイン + 並列 Sonnet executor 2 個 (Wave 2 G4-prep テキストバルク)

[Model: Opus 4.7 · Dispatched: Opus×1 (planner)]
— Phase 2 planner ディスパッチ

[Model: Opus 4.7 · Dispatched: Sonnet×3 (B3a executor 範囲 α/β/γ)]
— multi-executor-split.md Strategy A による Multi-Executor Split
```

規約は、すべての `/sc4sap:*` SKILL.md の `<Response_Prefix>` ブロックが [`common/model-routing-rule.md`](../common/model-routing-rule.md) § *Response Prefix Convention* を参照して強制。プリフィックスはスキルトリガーされたターンのみに適用され、無関係な話題転換のユーザーメッセージは当該ターンからプリフィックスが除去される。

## 業界リファレンス (`industry/`)

14 業界ファイル — すべての `sap-*-consultant` が参照。各ファイルは **Business Characteristics / Key Processes / Master Data / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls** をカバー。

業界: retail, fashion, cosmetics, tire, automotive, pharmaceutical, food-beverage, chemical, electronics, construction, steel, utilities, banking, public-sector。

## 国別ローカライゼーションリファレンス (`country/`)

15 カ国ファイル + `eu-common.md` — analyst / critic / planner に必須。各ファイルは **Formats / Tax System / e-Invoicing / Banking / Payroll / Statutory Reporting / SAP Country Version / Pitfalls** をカバー。

| ファイル | 主要な特殊性 |
|---------|-------------|
| 🇰🇷 `kr.md` | e-세금계산서 (NTS)、사업자등록번호、주민번호 PII |
| 🇯🇵 `jp.md` | 適格請求書等保存方式 (2023+)、Zengin、法人番号 |
| 🇨🇳 `cn.md` | Golden Tax、发票/e-fapiao、SAFE FX |
| 🇺🇸 `us.md` | Sales & Use Tax (VAT なし)、1099、Nexus |
| 🇩🇪 `de.md` | USt、ELSTER、XRechnung / ZUGFeRD、SEPA |
| 🇬🇧 `gb.md` | VAT + MTD、BACS/FPS/CHAPS、Brexit 後 (GB vs XI) |
| 🇫🇷 `fr.md` | TVA、FEC、Factur-X 2026 |
| 🇮🇹 `it.md` | IVA、FatturaPA / SDI (2019 年以降必須) |
| 🇪🇸 `es.md` | IVA、SII (リアルタイム 4 日)、TicketBAI |
| 🇳🇱 `nl.md` | BTW、KvK、Peppol、XAF |
| 🇧🇷 `br.md` | NF-e、SPED、CFOP、PIX |
| 🇲🇽 `mx.md` | CFDI 4.0、SAT、Carta Porte、SPEI |
| 🇮🇳 `in.md` | GST、IRN e-invoice、e-Way Bill、TDS |
| 🇦🇺 `au.md` | GST、ABN、STP Phase 2、BAS |
| 🇸🇬 `sg.md` | GST、UEN、InvoiceNow、PayNow |
| 🇪🇺 `eu-common.md` | VIES、INTRASTAT、SEPA、GDPR |

マルチカントリーロールアウト: すべての関連ファイルをロード + 国間タッチポイント (EU 域内 VAT、インターカンパニー、移転価格、国境を越えた源泉徴収) を顕在化。

## アクティブモジュール統合

`common/active-modules.md` がクロスモジュール統合マトリックスを定義。複数モジュールが有効な場合、スキルが統合フィールドを先取り提案。

例: MM PO 作成時 **PS 有効** → 勘定指定カテゴリ `P`/`Q` + `PS_POSID` (WBS) を提案;**CO 有効** → コストセンター派生を提案;**QM 有効** → GR 時のインスペクションロット自動作成。

`/sc4sap:setup` (Step 4) または `/sc4sap:sap-option modules` で設定。`create-program`, `create-object`, `analyze-cbo-obj`, すべてのコンサルタントエージェントが消費。

## SAP プラットフォーム認識 (ECC / S4 On-Prem / Cloud)

`sc4sap:create-program` は必須の SAP バージョン Preflight を実行。`.sc4sap/config.json` の `sapVersion` と `abapRelease` を読み取り:

- **ECC** — RAP/ACDOCA/BP なし、リリース別構文ゲーティング
- **S/4HANA On-Premise** — classical Dynpro 警告、extensibility-first、財務用に MATDOC + ACDOCA
- **S/4HANA Cloud (Public)** — **classical Dynpro 禁止**、RAP + Fiori Elements / `if_oo_adt_classrun` / SALV-only にリダイレクト。全リストは `common/cloud-abap-constraints.md`
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP + Business Partner API を推奨

## SPRO 構成リファレンス

14 の SAP モジュール用の内蔵リファレンスデータ (`configs/{MODULE}/`):
- `spro.md` — SPRO 構成テーブル/ビュー
- `tcodes.md` — トランザクションコード
- `bapi.md` — BAPI/FM リファレンス
- `tables.md` — 主要テーブル
- `enhancements.md` — BAdI / User Exit / BTE / VOFM
- `workflows.md` — 開発ワークフロー

モジュール: SD, MM, FI, CO, PP, PS, PM, QM, TR, HCM, WM, TM, Ariba, BW。

### SPRO ローカルキャッシュ (トークン節約)

`/sc4sap:setup spro` は顧客固有の SPRO カスタマイジングを `.sc4sap/spro-config.json` に抽出。コンサルタントは `common/spro-lookup.md` の優先順位に従う:
1. ローカルキャッシュ → 2. 静的リファレンス → 3. ライブ MCP 照会 (確認必要)。

## SAP 固有フック

- **SPRO 自動注入** — Haiku LLM がユーザー入力を分類し、関連モジュール SPRO 構成を注入
- **トランスポート検証** — MCP Create/Update 前にトランスポート存在確認
- **自動アクティブ化** — 作成/修正後に ABAP オブジェクトアクティブ化をトリガー
- **構文チェッカー** — ABAP エラー時にセマンティック解析を自動実行
- **🔒 データ抽出ブロックリスト** — `PreToolUse` フックが機密 SAP テーブルの行抽出を阻止

## 🔒 データ抽出ブロックリスト

機密テーブル (PII、認証情報、給与、銀行、取引財務) からの `GetTableContents` / `GetSqlQuery` 経由の行データ抽出を防止する多層防御レイヤー。

**4 層施行**: L1 エージェント指示 · L2 `CLAUDE.md` グローバルディレクティブ · L3 Claude Code `PreToolUse` フック · L4 MCP サーバー env-gated ガード。

**ブロックリストソース**: `exceptions/table_exception.md` はインデックス、実リストは `exceptions/` 以下の 11 セクションファイル。

| Tier | カバレッジ |
|------|----------|
| minimal | Banking/Payment、Master-data PII、Addresses、Auth/Security、HR/Payroll、Tax/Govt IDs、Pricing/Conditions、カスタム `Z*` PII パターン |
| standard | + Protected Business Data (VBAK/BKPF/ACDOCA/VBRK/EKKO/CDHDR/STXH + CDS) |
| strict | + Audit/Security logs、Communication/Workflow |

**アクション**: `deny` (ブロック) vs `warn` (警告プレフィックスで続行)。呼び出し内のいずれかのテーブルが `deny` なら全体ブロック。

**プロファイル** (`/sc4sap:setup` で選択): `strict` / `standard` / `minimal` / `custom`。サイト固有追加は `.sc4sap/blocklist-extend.txt`。

**インストール** (`/sc4sap:setup` が自動、手動):
```bash
node scripts/install-hooks.mjs            # user-level
node scripts/install-hooks.mjs --project  # project-level
```

**検証**:
```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# 期待値: JSON の "permissionDecision":"deny"
```

**L4 サーバー側施行** (すべてのクライアント — 外部スクリプト含む — をブロック):
```bash
export SC4SAP_POLICY=on
export SC4SAP_POLICY_PROFILE=strict
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md
export SC4SAP_ALLOW_TABLE=TAB1,TAB2  # セッション緊急免除 (ログ記録)
```

スキーマ/DDIC メタデータ (`GetTable`, `GetStructure`, `GetView`, `GetDataElement`, `GetDomain`) と存在チェックは引き続き許可。

## 🚫 `acknowledge_risk` — HARD RULE

`GetTableContents` / `GetSqlQuery` は `acknowledge_risk: true` パラメータで ask-tier ゲートをバイパス可能。**これは利便性フラグではなく監査境界**。

1. **初回呼び出しで `acknowledge_risk: true` 設定絶対禁止** — フック/サーバーがゲーティングする
2. **`ask` レスポンス時**は STOP — 拒否を user に提示
3. **テーブルとスコープを明示する yes/no 質問**
4. **明示的肯定キーワード後のみ `acknowledge_risk: true` で再試行**: `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `confirmed`
5. **曖昧な命令は承認ではない** — `"pull it"`, `"try it"`, `"뽑아봐"`, `"my mistake"`, 沈黙
6. **呼び出しごと、テーブルごと、セッションごと** — 承認は持ち越されない

全プロトコル: `common/data-extraction-policy.md`。

### ⚠️ "Always allow" の落とし穴
`GetTableContents` / `GetSqlQuery` 権限プロンプト出現時は **"Allow once"** 選択、**"Always allow"** 絶対禁止。"Always allow" はツール ID を `permissions.allow` に追加し、この安全装置を永久無効化。復旧: 親スキルを再実行 — `trust-session` Step 2 が `GetTableContents`/`GetSqlQuery` エントリを毎回スキャン/除去。

## 🔀 RFC バックエンド選択

Screen / GUI Status / Text Element 操作は SAP の RFC 有効 FM にディスパッチ。5 つのトランスポートバックエンド:

| `SAP_RFC_BACKEND` | 方式 | いつ使うか |
|---|---|---|
| `soap` (デフォルト) | HTTPS `/sap/bc/soap/rfc` | 大半の設定 — ICF ノード有効なら即動作 |
| `native` | `node-rfc` + NW RFC SDK | 最低レイテンシ、有料 SDK 必要。_非推奨 — `zrfc` 使用_ |
| `gateway` | sc4sap-rfc-gateway ミドルウェアへ HTTPS | 10+ チーム、中央集約 |
| `odata` | HTTPS OData v2 `ZMCP_ADT_SRV` | SOAP ブロック + OData Gateway 許可。[docs/odata-backend.md](odata-backend.md) |
| 🆕 `zrfc` | HTTPS ICF ハンドラ `/sap/bc/rest/zmcp_rfc` | SOAP 閉鎖 + OData Gateway 困難 (典型的 ECC)。SDK・Gateway 不要 — クラス + SICF ノード 1 つ |

`/sc4sap:sap-option` でいつでも切替、MCP 再接続、`/sc4sap:sap-doctor` で検証。

## 🏢 RFC ゲートウェイ (Enterprise デプロイ)

大規模 SAP 開発チーム (数十人の開発者) で、開発者のラップトップに SAP NW RFC SDK / MSVC が不要になる**中央 RFC Gateway** ミドルウェアをサポート。1 台の Linux ホストが `node-rfc` + SDK を運用;すべての MCP クライアントは HTTPS/JSON で通信。

**いつ必要か**:
- IT ポリシーが開発者マシンへの SAP NW RFC SDK インストールを禁止
- SAP Basis が `/sap/bc/soap/rfc` を全社で無効化
- 中央集約 RFC ロギング、レート制限、開発者別監査証跡が必要

**構成**:
```
/sc4sap:sap-option
# SAP_RFC_BACKEND=gateway
#     SAP_RFC_GATEWAY_URL=https://rfc-gw.company.com
#     SAP_RFC_GATEWAY_TOKEN=<team-or-per-user-bearer>
```

Gateway が開発者認証情報を `X-SAP-*` ヘッダーで転送 — SAP 監査ログが実ユーザーを識別。

> **プライベートリポジトリ。** Gateway ソースはプライベートリポジトリ — Docker イメージは SAP ライセンス NW RFC SDK に対してビルドする必要 (再配布不可)。組織はメンテナにアクセス要求、クローン、S-user で SDK ダウンロード、自社ネットワーク内でイメージビルド。オープンソースユーザー: `SAP_RFC_BACKEND=soap` (デフォルト) 継続使用。

クライアント側設計は公開 (`abap-mcp-adt-powerup/src/lib/gatewayRfc.ts`) — HTTP 契約は文書化、準拠ミドルウェア (Node/Java/Python) はすべて動作。

---

← [README に戻る](../README.ja.md) · [インストール →](INSTALLATION.ja.md) · [変更履歴 →](CHANGELOG.ja.md)
