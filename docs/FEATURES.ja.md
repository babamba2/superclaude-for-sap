# 機能詳細

← [README に戻る](../README.ja.md) · [インストール →](INSTALLATION.ja.md)

## 目次

- [27 の SAP 専門エージェント](#27-の-sap-専門エージェント)
- [31 スキル](#31-スキル)
- [スキル — 使用例とワークフロー](#スキル--使用例とワークフロー)
- [チャットからのルーティング](#チャットからのルーティング)
- [コストモード（standard / eco）](#コストモードstandard--eco)
- [オフラインプロファイル](#オフラインプロファイル)
- [マルチ環境プロファイル（Dev / QA / Prod）](#-マルチ環境プロファイルdev--qa--prod)
- [MCP ABAP ADT サーバー — 独自の機能](#mcp-abap-adt-サーバー--独自の機能)
- [共通規約（`common/`）](#共通規約common)
- [コンテキスト読み込みアーキテクチャ（v0.5.2+）](#コンテキスト読み込みアーキテクチャv052)
- [応答プレフィックス規約（v0.5.2+）](#応答プレフィックス規約v052)
- [業種リファレンス（`industry/`）](#業種リファレンスindustry)
- [国別・ローカライズリファレンス（`country/`）](#国別ローカライズリファレンスcountry)
- [アクティブモジュール連携](#アクティブモジュール連携)
- [SAP プラットフォームへの対応（ECC / S4 オンプレミス / クラウド）](#sap-プラットフォームへの対応ecc--s4-オンプレミス--クラウド)
- [SPRO 設定リファレンス](#spro-設定リファレンス)
- [SAP 固有のフック](#sap-固有のフック)
- [データ抽出ブロックリスト](#-データ抽出ブロックリスト)
- [acknowledge_risk ハードルール](#-acknowledge_risk--ハードルール)
- [SAP 接続：Web ポート、RFC バックエンド、NCo](#-sap-接続web-ポートrfc-バックエンドnco)

## 27 の SAP 専門エージェント

| カテゴリ | エージェント |
|----------|--------------|
| **コア（10）** | Analyst、Architect、Code Reviewer、Critic、Debugger、Doc Specialist、Executor、Planner、QA Tester、Writer |
| **チェッカー（1）** | `sap-checker`（Haiku）— 狭い範囲に対する調査・検証・検出を行う、読み取り専用のファンアウト用ワーカーです。構造化された行を返すだけで、判断も修正もしません。`create-program`、`analyze-code`、`compare-programs`、`stock-cbo`、`cbo-relation-map`、`module-to-process` が使います |
| **Basis（1）** | BC コンサルタント — システム管理、移送管理、診断 |
| **ディスカバリー（1）** | CBO Stocker — CBO パッケージの棚卸し、where-used グラフ、再利用可能オブジェクトのカタログ |
| **モジュール（14）** | SD、MM、FI、CO、PP、PS、PM、QM、TR、HCM、WM、TM、Ariba、BW |

**委任マップ（モジュール相談プロトコル）：**
- `sap-analyst` / `sap-critic` / `sap-planner` → `## Module Consultation Needed` → `sap-{module}-consultant`（業務の意味づけ）または `sap-bc-consultant`（システムレベル）
- `sap-architect` → `## Consultation Needed` → `sap-bc-consultant`（移送戦略、権限、パフォーマンス、サイジング、パッチ適用）またはモジュールコンサルタント
- `sap-analyst` / `sap-critic` / `sap-planner` には、さらに必須の **Country Context** ブロックがあります（`country/<iso>.md` を読み込みます）
- **コアエージェントへの MCP 直接読み取りアクセス** — パッケージ / DDIC / クラス / プログラム / where-used / ランタイムダンプのツールは読み取り専用で使えます。書き込み CRUD は `sap-executor` / `sap-planner` / `sap-writer` / `sap-qa-tester` / `sap-debugger` に限ります

## 31 スキル

| スキル | 説明 |
|--------|------|
| `sc4sap:setup` | プラグインのセットアップ — MCP サーバーを自動インストールし、SPRO 設定を生成し、ブロックリストのフックをインストールします |
| `sc4sap:mcp-setup` | MCP ABAP ADT サーバーを単独でインストール / 再設定するためのガイド |
| `sc4sap:sap-option` | SAP プロファイル（認証情報、RFC バックエンド、ブロックリスト、アクティブモジュール）の表示・編集、**マルチ環境プロファイルの管理**（Dev/QA/Prod の切り替え/追加/削除）、HUD の使用量上限の設定 |
| `sc4sap:sap-doctor` | プラグイン + MCP + SAP の診断（6 レイヤー） |
| `sc4sap:create-object` | ABAP オブジェクトの作成（ハイブリッドモード — 移送とパッケージを確認し、作成し、有効化） |
| `sc4sap:create-program` | ABAP プログラムの一貫したパイプライン — Main+Include、OOP/手続き型、ALV、Dynpro、テキスト要素、ABAP Unit |
| `sc4sap:program-to-spec` | ABAP プログラムをリバースエンジニアリングして機能/技術仕様書にします（Markdown / Excel） |
| `sc4sap:program-to-manual` | 1 つのプログラムのエンドユーザー向けマニュアル（単一 HTML）— 描画した画面上のシナリオ手順、番号付き吹き出し、チェックポイント、メッセージと対処 |
| `sc4sap:compare-programs` | 同じシナリオをモジュール / 国 / ペルソナで分けた 2〜5 本の ABAP プログラムを、業務の観点で並べて比較します。コンサルタント向けの編集可能な HTML レポートです（判定マトリクス、項目の差異、画面の並列表示、判断ガイド。バージョン管理あり、英語版付き） |
| `sc4sap:config-to-document` | 1 つのモジュールの設定を稼働中のシステムから文書化します（まず MM）— IMG ツリーに沿った単一 HTML です。SM30 風の画面に実際のテーブル値を表示し、顧客が変更した行を移送とともに示し、設定チェック、SAP の IMG ドキュメント、`sap-critic` がレビューしたコンサルタントノートを収めます。ノート、値、変更履歴をページ内の編集モードで直せます（`--import` で編集内容を次のバージョンに引き継ぎます） |
| `sc4sap:interface-mapping-spec` | インターフェースマッピング仕様書 — テンプレートレイアウトの編集可能な HTML 1 ページです（表紙、改訂履歴、R / MAPPING 付きの Source → Target グリッド、レスポンスブロック、変換ルール、抽出 SQL、項目ガイド）。SAP 側は DDIC / RFC シグネチャから、新規インターフェースでは項目リスト / コンサルタントの提案から取得します。相手側と変換ルールは提案し、ページ内でチェックします。バージョン管理あり、英語版付き |
| `sc4sap:smartform-preview` | SmartForm の想定印刷結果を JPG + HTML で出力します — mm 単位のウィンドウ、SmartStyle のフォント、テンプレートグリッド、SE78 のグラフィック、サンプル行付きのループ。DDIC の型に合わせた架空のサンプル値を使い、はみ出すセルとウィンドウを報告します（読み取り専用） |
| `sc4sap:smartform-from-pdf` | 印刷帳票の PDF（またはスクリーンショット）から SmartForm を作成します — 罫線からテンプレートを作り、テキストは既存の SmartStyle の書式で配置し、項目 / 明細ループ / インターフェースはユーザーと決めます。DEV にアップロードして印刷し、元のページと照らして採点します |
| `sc4sap:project-dashboard` | SAP プロジェクトダッシュボード — プロジェクトごとの編集可能な HTML 1 ページ（サマリー、KPI、マイルストーン、WBS / ガント、リスクと意思決定、チーム、履歴）に加え、ポートフォリオページと、Q-gate チェック付きの 1 ページ週次ステータスを出力します。WRICEF のステージはモジュール / 開発コンサルタントごとに管理し、実績は SAP から読み取ります（移送、パッケージのオブジェクト、ダンプ） |
| `sc4sap:role-matrix` | ロール・権限のワークブック — ビジネスロール、PFCG ロール、ロール × T-code の F/C/D、ユーザー × ロール、権限オブジェクト、SoD 競合チェック。新規設計にも SAP からの読み取り（ユーザー ID のみ）にも対応し、大規模システムではシートを分割します |
| `sc4sap:analyze-code` | ABAP コード分析（Clean ABAP / パフォーマンス / セキュリティ） |
| `sc4sap:stock-cbo` | カスタマービジネスオブジェクト（CBO）の棚卸しスキャナーで、モジュール横断のギャップ分析付きです |
| `sc4sap:cbo-relation-map` | 1 つ以上のパッケージの顧客オブジェクトの関係を、`stock-cbo` のグラフから HTML 1 ページに描きます — ハブ、利用状況、名前付きグループ、Obsidian 風の近傍ビュー、TCode までの影響範囲、パス、テーブル CRUD、項目レベルの CRUD（Fields タブ、標準テーブルの顧客アペンドを含む）、ソースの抜粋、PNG / CSV。グラフがなければ収集します（パッケージ全体または使用中の TCode。eco = マップのみ） |
| `sc4sap:analyze-symptom` | SAP 運用エラー / 症状の段階的な分析（ダンプ、ログ、SAP ノート候補） |
| `sc4sap:ops-health-check` | 運用レポート（顧客または PMO 向け HTML：サマリー、前期間との KPI 比較、ダンプの推移、課題とアクション）— ダンプのグループ化と前期間との比較、ダンプしたプログラムを変更した移送、異常終了したジョブ、更新エラー、エラー状態の IDoc。判定と次のステップ付き（読み取り専用） |
| `sc4sap:transport-readiness` | QA / PRD に移す前の移送依頼の CTS チェック — 未完了のタスク、未有効化のオブジェクト、ローカルパッケージ、共有オブジェクト（インポート順）、未リリースの DDIC 依存、SM59 の接続先を使った任意のターゲットマージチェック。依頼ごとの判定付き（読み取り専用） |
| `sc4sap:program-test` | DEV、QA、または（要望があれば）本番の行をテストダブルとして使い、DEV 上でプログラムをテストします（MCP サーバー内でマスクし、本番テーブルは 1 件ずつ確認）— 期待値を先に固定、マスク済みデータ、ケースごとの ABAP Unit 判定、ミュータント + 改ざんチェック、NOT_TESTABLE の割合（移送なし、プログラムは変更しません） |
| `sc4sap:uat-scenarios` | UAT または結合テスト（SIT）のシナリオセット — コンサルタントの草案、項目ごとの提案、T-code チェック、サイクルごとの進捗、2 種類のレイアウトでの Excel 出力（SAP に対しては読み取り専用） |
| `sc4sap:assist` | 業務アシスタント — インストール済みの業務アクションを通して、特定の伝票を照会・変更します。照会 → プレビュー → あなたの了承 → 実行 → 伝票番号（本番は照会のみ） |
| `sc4sap:smartform-to-adobe` | **ベータ — 出力品質はまだ低いです。** SAP の移行機能（CL_SSF_MIGRATION）と同じやり方で、SmartForm を Adobe フォームに変換する計画を立てます — ノードの棚卸し、インターフェース / コンテキスト / レイアウト、SAP が出すと予想されるログ、手作業が必要な暗黙のギャップ。HTML レポートで出力します（読み取り専用。SAP のサンプルフォームに限り DEV での実行も可能） |
| `sc4sap:adobe-preview` | Adobe フォーム（SFP、S/4HANA）の想定印刷結果を HTML / PDF / JPG で出力します。インターフェースの DDIC の型に合わせた架空のサンプル値を使います。DEV では SAP のサンプルフォームを SAP 自身の印刷結果と照らして採点できます（読み取り専用） |
| `sc4sap:adobe-from-pdf` | 印刷帳票の PDF から Adobe フォームを作成します — DEV 書き込みヘルパーの承認待ちで、まだ実行できません |
| `sc4sap:ask-consultant` | モジュールコンサルタントエージェントに、ユーザーが直接質問します（SD/MM/FI/CO/PP/PS/PM/QM/TR/HCM/WM/TM/BW/Ariba/BC）。読み取り専用で、設定済みの SAP 環境に沿って回答します。 |
| `sc4sap:module-to-process` | 利用者が実際に実行している TCode（本番の ST03N）から、モジュールごとに編集可能な HTML のプロセスマップを作ります。CBO タスク、バリアント、担当者、システムを含む標準 L1〜L4 のバックボーン、L3 シナリオのスイムレーン、根拠付きの業務ルール・手順・インターフェース・S/4 変換メモを含む L4 ごとの PDD 形式タスクシート。任意でコンサルタントレビュー、BPH の突き合わせ、英語版付き |
| `sc4sap:eco` | 設定を変えずに 1 つのスキルを eco コストモードで実行します — `/sc4sap:eco <skill> <args>`（サブエージェントのモデルと労力を抑え、成果物は同じです） |
| `sc4sap:trust-session` | 内部専用 — セッション全体の MCP 権限ブートストラップ |

## スキル — 使用例とワークフロー

### `/sc4sap:create-object`
ハイブリッドモードの単一オブジェクト作成です。移送とパッケージを対話で確認し、その後に作成、雛形の生成、有効化を行います。
```
/sc4sap:create-object
→ "Create a class ZCL_SD_ORDER_VALIDATOR in package ZSD_ORDER"
```
流れ：型の推定 → パッケージ + 移送の確認 → MCP `Create*` → 初期実装 → `GetAbapSemanticAnalysis` → 有効化。

### `/sc4sap:create-program`
主力のプログラム作成パイプラインです。Main + Include のラッピング、OOP または手続き型、ALV と Dynpro のフル対応を備えます。
```
/sc4sap:create-program
→ "Make an ALV report for open sales orders, selection screen by sales org + date range"
```
流れ（Phase 0〜8）：
- Phase 0 — SAP バージョンの事前確認 + アクティブモジュールの読み込み
- Phase 1A — モジュールコンサルタントによる業務インタビュー（業種/国の事前確認、業務目的、標準 SAP での代替案）
- Phase 1B — `sap-analyst` + `sap-architect` による技術インタビュー（7 つの観点）
- Phase 2 — CBO + カスタマイズ再利用のゲートを通した計画
- Phase 3 — 仕様 + ユーザーの承認
- Phase 3.5 — 実行モードのゲート（`auto` / `manual` / `hybrid`）
- Phase 4 — インクルードの並列生成 → 一括有効化
- Phase 5 — ABAP Unit
- Phase 6 — 4 バケットの規約レビュー（Sonnet 並列、MAJOR の指摘は Opus にエスカレーション）
- Phase 7 — デバッグへのエスカレーション
- Phase 8 — 所要時間の表付きの完了レポート

### `/sc4sap:analyze-code`
```
/sc4sap:analyze-code
→ "Review ZCL_SD_ORDER_VALIDATOR for Clean ABAP violations and SELECT * usage"
```

### `/sc4sap:stock-cbo`
Z パッケージをたどり、再利用できる資産をカタログ化し、モジュール横断のギャップ分析を行います。
```
/sc4sap:stock-cbo
→ "Scan ZSD_ORDER package for MM module reuse candidates"
```
流れ：`GetPackageTree` → カテゴリごとの探索 → 頻度ヒューリスティック → モジュール横断のギャップチェック → `.sc4sap/cbo/<MODULE>/<PACKAGE>/inventory.json`。

### `/sc4sap:cbo-relation-map`
`stock-cbo` が作る参照グラフ（`graph.json`）を、パッケージごとに自己完結した HTML 1 ページとして描きます。韓国語版と英語版が付きます。表示するのは顧客オブジェクトだけです — パッケージ内のメンバーと、パッケージ外の Z / Y / 名前空間のオブジェクトです。標準オブジェクトは対象外です。関係は次のとおりです：DDIC の型付け、チェックテーブル、検索ヘルプ、値テーブル、行タイプ、ビューの基底、集合検索ヘルプ、ソースからは include、call、submit、トランザクション、read、write。それぞれに、DDIC に明記、ソースに明記、推定のいずれかを付け、DD* の行またはソースの行を添えます。インクルードはプログラムまたはファンクショングループにまとめます。説明（walk / inventory）、利用状況（`usage-result.json`）、標準のチェックテーブル（DD08L、テキストのみ表示）は、インベントリフォルダにあれば追加します。概要では、ハブを業務上の関係順に（型付けのハブは別にして）、利用回数、Louvain 法で自動命名したグループとともに一覧します。探索ビューは Obsidian のグラフのように描きます（canvas、ホバーで隣接ノードが光り、ズームで名前が現れます）。関係のプリセットと、種類、型、基底、利用状況、パッケージによるフィルタを備えます。サイドパネルには、TCode までの変更の影響範囲と、各関係の前後 ±10 行のソース抜粋を表示します。パスは任意の方向にも矢印の向きにも探せ、最大 3 つの代替ルートを示します。Table CRUD タブには、各テーブルを誰が作成・読み取り・更新・削除するかを一覧します。PNG と CSV を出力できます。複数のパッケージは 1 ページにまとめます（パッケージごとに色分け）。グラフがなければ、スキルが収集します — パッケージ全体（standard：完全な `stock-cbo`、eco：Haiku による探索 + Step G のみ）、または利用者が実際に実行している TCode（`usage-scope.mjs`）です。ページ自体は SAP を呼び出しません。`build-relation-map.mjs find --base <dir> … --packages <list>` はグラフをオフラインで探します（パッケージとスコープごとに 1 フォルダ、見つからないパッケージと曖昧なパッケージは名前を示します）。そのため、ホスト型の実行（Web アプリ）でもページを 1 ステップで作れます。`--src`（複数指定可）、`--max-bytes`（抜粋なしで再構築、それでも収まらなければ終了コード 3）、`--sid` はこの実行のためのオプションです。

### `/sc4sap:analyze-symptom`
```
/sc4sap:analyze-symptom
→ "Dump MESSAGE_TYPE_X in ZFI_DEMO_POSTING at line 234 during F110"
```
流れ：`RuntimeListDumps` → `RuntimeAnalyzeDump` → スタックトレース → SAP ノート候補 → 対処案。

### `/sc4sap:program-to-spec`
ABAP プログラムをリバースエンジニアリングして、仕様書（Markdown/Excel）にします。対話形式で範囲を絞り込みます。

### `/sc4sap:program-to-manual`
業務ユーザーが手元で追えるマニュアルを書きます。作業ごとに 1 シナリオ（「発注を送る」、「入庫漏れを確認する」）とし、各手順を画面の描画図 — 選択画面、出力 ALV、ポップアップ、後続画面 — の上に番号付きの吹き出しで示します。ソースの検証から取ったチェックポイント、項目リファレンス、対処付きのメッセージ、用語集、自動の改訂履歴も付きます。自己完結した HTML 1 ファイルで、画面では Web 文書、印刷では 1 手順が A4 横 1 ページになります。作成者、チーム、会社名、機密保持の注記は、プロファイルの `config.json` → `manual` から取ります。

### `/sc4sap:uat-scenarios`
モジュールまたはプロセス領域の UAT シナリオ — あるいはモジュールをまたぐエンドツーエンドのフローの結合テスト（SIT）。後者では、各ステップがモジュールを持ち、引き継ぎごとに受け取ったものを確認します。これを 1 つの JSON セット（`scripts/uat/build-uat.mjs`）として保持し、書き直さずにテストサイクルを通して編集していきます。シナリオはプロセスチェーン、プロセス、タスクを持ち、STEP 行にはアクティビティ、システム（SAP または連携先システム）、T-code、チェックポイント、入力データ、期待される出力、テストユーザー ID、サイクルごとの結果（pass / fail / blocked）、ステータス、フォローアップ、課題があります。モジュールコンサルタントがセットを起草し、その後の変更はパッチ操作（`set-scenario`、`set-step`、`add-step`、`remove-step`、`add-scenario`）として提案します。操作は一覧表示され、ユーザーが承認した番号の分だけ適用されます。存在しないステップを指す操作は、理由を示してスキップします。SAP ステップの T-code はすべて `GetTransaction` で確認します。`check` は、不足（T-code や期待結果のないステップ、フォローアップのない失敗ステップ）とサイクルごとの進捗を一覧します。出力は、レイアウト A（スケジュール、アクティビティ、概要とテスト手順を持つシナリオごとのシート）とレイアウト B（シナリオごとのヘッダー行付きのフラットリストと、ユーザー ID のテストユーザーシート）で、スプレッドシートライブラリなしで書き出します。

**不具合と修正**（`build-uat.mjs defects`）。各課題には、修正する依頼（`transports`、任意の `<SID>K<6>`）と再テストのサイクルを記録します。CTS チェックの `model.json` があれば、ページには不具合ごとに、その依頼の CTS 状態と、次のステータスが表示されます — 修正依頼なし、修正未確認、修正進行中、移送可能（CTS で ready または released。QA へのインポートは読みません）、再テスト待ち、再テスト合格 / 不合格。依頼のテキストに `ISS-0003` または `<SET>/ISS-0003` が含まれていれば、リンクではなく提案パッチとして返します。`<ID>-defects.json` は、プロジェクトダッシュボードが読む KPI フィードです（`uat-defects-open`、`uat-defects-no-fix`、`uat-fix-ready`、`uat-retest-due`、`uat-retest-pass-rate`）。

### `/sc4sap:transport-readiness`
STMS を開く前に、「この依頼は今夜移せるか、どの順番か」に答えます。`scripts/transport/build-tr-check.mjs collect` は、依頼（番号、所有者、または `[SD]%` のようなテキストパターンで指定）、そのタスクとオブジェクト（E070 / E07T / E071、タスクのオブジェクトは依頼にまとめます）、他の未完了の依頼にある同じオブジェクト、オブジェクトのパッケージ（TADIR）、有効化の状態（システムが読めれば DWINACTV、読めなければ接続ユーザーに対する ADT の未有効化リスト — 部分的な結果として報告）を読みます。また、直近 90 日の他の未リリース依頼にある顧客 DDIC オブジェクトについては、この依頼のコードがそれを使っているか（`GetWhereUsed`）も確認します。`--target-dest <SM59 destination>` を付けると、`GetRemoteTableContents`（RFC_READ_TABLE、200 オブジェクトまで）でターゲットシステムも読みます：TADIR（オブジェクトが存在するか、どのパッケージか）、VRSD（各パーツの最後の変更の依頼 — ターゲット側のコピー用移送は出力のみで、無視します。ソースが知らない依頼番号、または異なる日付で知っている依頼番号は、ターゲットで、あるいは別の経路で行われた変更です）、そしてコードが使う顧客 DDIC オブジェクト（依存行と D010TAB）についてはターゲットの TADIR です。新しい指摘：*ターゲットで変更あり*と*ターゲットに存在しない*は blocked、*ターゲットより古い*（ロールバック）と*ターゲット未読*は警告になります。`build` は各依頼に判定を付けます — blocked（未完了のタスク、未有効化のオブジェクト、ローカルパッケージ、未リリースの DDIC 依存）、check（共有オブジェクト、部分的な未有効化リスト）、ready — そして最初の修正手順も示します。

**CAB 変更ノート**（cab モード）。`collect --cab` は、読み取りを 1 つ追加します — スケジュール済みおよびリリース済みのジョブ（TBTCO ステータス S / P）と、そのステッププログラム（TBTCP）です。`scripts/transport/build-cab-notes.mjs prepare`（オフライン）は、依頼ごとにカードを作ります：オブジェクト、影響先 — `stock-cbo` の CBO グラフを、リレーションマップの影響ルール（最初の 1 ステップはすべての関係をたどり、その後はコードの関係のみで、最大 6 ステップ）でたどり、TCode までと、その ST03N の利用状況、そして影響を受けるプログラムを実行するスケジュール済みジョブ — テストの証跡は、名前が挙がったものだけを使います（プロジェクトダッシュボード（WRICEF の依頼またはオブジェクト）、そのダッシュボードが指定または一覧する UAT セット（リンクされた課題、または影響を受ける T-code のステップで、推測として印を付けたもの）。それぞれセット ID を付けます）。固定のルールで決めるリスクレベル H / M / L。事実だけのロールバックノートは、必ず「no automatic rollback」で始まります（VRSD の以前のターゲットバージョン — 古い依頼を再度インポートせず、新しい依頼に復元します。新規オブジェクト、テーブルデータ、カスタマイジング、ターゲットを読まなかった場合は*ターゲット未確認*）。グラフのないパッケージは「なし」ではなく*影響未収集*と表示します。`sap-writer` は依頼ごとに 2〜3 文の業務向けの文を下書きし、`save` は入力にないオブジェクト、T-code、番号を含む文を拒否します。ページ（ko / en、A4 横）は、人が編集するまでテキストに*AI 下書き*の印を付けます。CAB の決定とコメントは人が入力し、Save → `import` で編集内容を保持します。

### `/sc4sap:ops-health-check`
SM / AMS 運用の朝のチェックです。`scripts/ops/build-ops-check.mjs collect` は、期間（既定は昨日以降）と、その直前の同じ長さの期間について、次を読みます：ショートダンプ（`RuntimeListDumps` — ADT フィードと、ECC では ST22 のリスト）、期間の 1 週間前以降の移送依頼（テキストとコードオブジェクト付き。E070 / E07T / E071）、異常終了したジョブ（TBTCO ステータス A と先頭ステップのプログラム）、エラーの更新依頼（VBHDR）、エラー状態の IDoc（EDIDC）。`build` は、ダンプをランタイムエラーとプログラムでグループ化し、前期間と比べて新しいグループに印を付けます。各グループの横に、最後のダンプより前にそのプログラム、インクルード、ファンクショングループ、クラスを変更した依頼を並べ、指摘ごとに判定（red / amber / green）と次のステップを示します — ダンプのグループには `/sc4sap:analyze-symptom`、その他には SM37 / SM13 / BD87 です。BASIS < 7.50 では、読み取りは `ZMCP_ADT_DISPATCH` のアクション `TABLE_READ` を通します。これはジョブ、更新、IDoc のヘッダーテーブルを名前で一覧します（ジョブログ、更新データ、IDoc データは閉じたままです）。古いディスパッチャーはこれを拒否し、その場合は空ではなく*読み取り不可 — SM37 / SM13 / WE02 で確認*と表示します。業務伝票の内容は読みません。ユーザー名は件数を数えるだけで、一覧にはしません。自己完結した HTML 1 ページ（ko / en / ja、ライトとダーク、A4 横で印刷）を、プロファイルの成果物ベースの `ops-check/<to>/` に出力します。

### `/sc4sap:program-test`
移送を動かす前に、DEV でプログラムをテストします。プログラムを指定すると、スキルがデータソース（既定は DEV の行、または `/sc4sap:sap-option` → *Test data sources* で保存した SM59 の接続先経由の、QA または本番の行のマスク済みサンプル）とコストモードを尋ね、何かを実行する前に実行計画 — 手順、作成する `$TMP` のテストプログラム、確認される内容 — を出力します。テストケースと期待値は、仕様とソースから決めて先に固定します。行は、プログラム自身のコードを ABAP Unit で実行する `$TMP` ハーネスのテストダブルになります。仕込んだミュータントと、改ざんした期待値は失敗しなければなりません。ケースごとの判定は ABAP Unit の結果から出ます。レポートは、テストできないケースの割合から始まり、グリーンの実行の後に `/sc4sap:transport-readiness` を提案します。

### `/sc4sap:assist`
具体的な伝票についての一文（「仕入先 100023 の未決の購買発注」、「受注 4711 に請求ブロックを設定」）を、接続中のシステムの業務アクション 1 件に変換します。まだ決まっていないことを 1 度に 1 つずつ尋ね、照会結果を表で示し、変更は SAP のメッセージ付きで変更前 → 変更後をプレビューし、まさにそのプレビューに対するあなたの了承があって初めて実行します。`SAP_TOOL_PROFILE=biz` または `all` と、SAP 側の業務ハンドラーが必要です。本番プロファイルは照会のみです。

### `/sc4sap:smartform-to-adobe`
> **ベータ — 出力品質はまだ低いです。** 結果は必ず SFP で確認してから使ってください。

SAP の SmartForm 移行（即座に保存され、テストモードがありません）を実行する前に、このスキルが、移行でフォームがどうなるかをノードごとに洗い出します — インターフェース、コンテキスト、レイアウト、SAP が出すと予想されるメッセージ、SAP がメッセージなしで落とすもの — そして、ギャップのリスト（暗黙のギャップを先頭に）と、それぞれの手作業の手順を含む HTML レポート（`adobe-plan-<lang>.html`）を 1 つ書きます。DEV の SAP サンプル SmartForm については、移行を新しい `$TMP` オブジェクトに対して実行できます。移行されたフォームは `/sc4sap:adobe-preview` で描画します。

### `/sc4sap:adobe-preview`
印刷プログラムなしで、Adobe フォーム（S/4HANA）の印刷結果を描きます：マスターページ、ヘッダーを繰り返すフローテーブル、改ページ、ピクチャ句、リッチテキスト、画像 — インターフェースの DDIC の型に合わせた架空の値で埋めます。HTML は常に出力し、PDF と JPG は Chrome / Edge があれば出力します。DEV では、SAP のサンプルフォームを ADS 経由で印刷し、プレビューと照らして採点できます。

### `/sc4sap:ask-consultant`
モジュールコンサルタントエージェントへの直接の質問です（「出荷伝票の作成時の与信チェックはどこで設定しますか？」）。質問はキーワードで `sap-{module}-consultant`（SD、MM、FI、CO、PP、PS、PM、QM、TR、HCM、WM、TM、BW、Ariba、BC）に振り分けられ、プロファイルの SAP バージョン、業種、国、アクティブモジュールに沿って、ローカルの SPRO キャッシュを先に使って回答します。読み取り専用で、書き込みも行の抽出もしません。具体的な伝票についての質問（「どの購買発注が未決ですか？」）は、同じターンで `/sc4sap:assist` に引き継ぎます。

### `/sc4sap:compare-programs`
同じ業務シナリオを、モジュール、国、ペルソナ、時間軸で分けた 2〜5 本のプログラムを比較します。Sonnet / Haiku が各プログラムの事実を抽出し、Opus が 1 回の処理で、機能コンサルタント向けの比較を書きます：*Differences only* 付きの判定マトリクス、項目の差異、選択画面と出力画面の並列表示、判断ガイド。編集可能でバージョン管理された HTML レポート 1 つに、英語版が付きます。

### `/sc4sap:config-to-document`
1 つのモジュールの設定を、システムにある状態のまま文書化します（まず MM。他のモジュールも同じパイプラインで扱います）。ページはモジュールの IMG ツリーに沿い、各 IMG アクティビティには、SM30 風の画面に描いた実際のテーブル値を表示します。顧客の移送で変更された行は移送履歴とともに印を付け、値に対して設定チェックを実行し、SAP 自身の IMG ドキュメントを添付します。コンサルタントノートはモジュールコンサルタントエージェントが書き、`sap-critic` がレビューします。範囲（領域、ノートのバッチ）は、測定したコストとともに最初に選びます。

### `/sc4sap:interface-mapping-spec`
インターフェースマッピング仕様書を、従来のテンプレートレイアウトの編集可能な HTML 1 ページとして書きます：表紙、改訂履歴、ヘッダー、変換ルールと MAPPING を含む Source → Target グリッド、任意の同期レスポンスブロック、抽出条件、項目ガイド。SAP 側は DDIC（テーブル、構造、ビュー）または関数モジュールのシグネチャから読み取ります。新規インターフェースでは、項目リストまたはモジュールコンサルタントの提案から取ります。相手側は提案します。ページ内のチェックがギャップを指摘します。バージョン管理され、英語版が付きます。

### `/sc4sap:module-to-process`
1 つのモジュールがシステムでどう動いているかを、利用者が実際に実行している T-code（`SAP_USAGE_RFCDEST` 経由の本番 ST03N、または保存した利用リスト）からマッピングします：使用中の T-code → プログラム → ソース → 参照グラフ → バリアント付きの標準 L1〜L4 プロセスバックボーン。出力は、BPH テーブル、L3 シナリオのスイムレーン、バリアントマトリクス、L4 タスクごとのタスクシート 1 枚（担当者、システム、ソース行付きの業務ルール、手順、関連オブジェクト、インターフェース、変換メモ）を持つ、編集可能な HTML 1 ページです。ギャップモードは、既存のマップを、プロジェクトダッシュボード向けの WRICEF 候補付きの fit / partial / gap 分析に変えます。

### `/sc4sap:eco`
`/sc4sap:eco <skill> <args>` は、今回の実行に限り 1 つのスキルを eco コストモードで実行します — [コストモード](#コストモードstandard--eco)を参照してください。

### `/sc4sap:smartform-preview`
印刷プログラムを実行せずに、SmartForm の想定印刷結果を描きます：`GetSmartFormContent` がフォーム、その SmartStyle、SE78 のグラフィックを読み取ります。ウィンドウは mm 位置にテンプレートグリッド（罫線、網掛け）とともに描き、ループはサンプル行付きで、グラフィックは印刷サイズで描き、ヘッドレスの Chrome / Edge で JPG として保存します。すべての `&field&` には、DDIC の型に合わせた架空のサンプル値を入れます（業務データは使いません）。そのため、図は実際のはみ出しを示し、内容が収まらないセルとウィンドウはレポートに一覧します。

### `/sc4sap:smartform-from-pdf`
逆方向です。印刷帳票の PDF（またはスクリーンショット。位置は推定）から SmartForm を作ります。`read-pdf.mjs` は、依存なしでページを読み取ります — 各テキストの位置、フォント、サイズ、罫線、画像です。`plan-form.mjs` は、罫線で囲まれた領域をテンプレートにし、各テキストをそのセルまたは専用のウィンドウに、そのフォントを印刷できる**既存の** SmartStyle の段落書式と文字書式で配置します（スタイルは作成しません）。どのテキストが項目か、どのグリッド行が明細行（内部テーブルに対するループ）か、そしてインターフェースの DDIC の型は、メインスレッドがユーザーと決めます（`shape-form.mjs`）。`write-form.mjs` は Form Builder の XML を書きます。フォームは DEV システムにアップロードされ（`CreateSmartForm`）、そこで印刷され（`RenderSmartForm`）、印刷結果は元のページと照らして採点されます（`compare-layout.mjs`）。

### `/sc4sap:project-dashboard`
SAP プロジェクトごとの編集可能な 1 ページと、全プロジェクトを束ねるポートフォリオページです。計画は、プロジェクトタイプ（SAP Activate の新規導入、S/4 コンバージョン、ロールアウト、AMS リリース、小規模プロジェクト）のテンプレートから作ります。進捗は、編集モードでの PM の入力と、接続中のシステムからの読み取り専用の取得から得ます：移送依頼はカスタマイジング（設定作業）とワークベンチ（開発作業）に分け、パッケージのオブジェクト、未有効化のオブジェクト、カットオーバー後のダンプも読みます。すべての WRICEF アイテムは、モジュールコンサルタントと開発コンサルタントのもとでステージを進むため、両者の間の引き継ぎキューが見えます。チームメンバーは日付で参加・離脱し、離脱者の未完了アイテムは再割り当て対象として印が付きます。固定のヘッダー行を持つスプレッドシート形式の編集で、モバイルでも使えます。

週次ステータス：`build-project-doc.mjs status --project <CODE> [--week-end] [--gate] [--evidence <file>]…` は、1 ページのステータス（A4、印刷は最大 2 ページ、スマートフォンレイアウト）を書き出します — 全体とワークストリームごとの RAG（PM 自身の判断付き）、前回のステータス実行以降に動いたこと、KPI の変化、主要なリスク、必要な意思決定、今後 2 週間のマイルストーン。そして週をモデルに保持する（`statusLog`、26 週分）ので、ダッシュボードページは翌週のベースラインを持ちます。ゲートを付けると、各終了基準は、渡された証跡（CTS チェック、UAT ページまたはセット、運用レポート、UAT 不具合フィード）に対して、任意のルールタグ（`[cts-blocked<=0]`、`[uat-pass:2nd>=95]`、`[defects-open<=3]`、`[wricef>=ut:80]` …）を通してチェックされ、判定が提案されます。PM のマイルストーンのステータスはそのまま残ります。リスクと意思決定はモデルのリストで、専用のタブで編集します。`--refresh` を付けない限りオフラインです。

### `/sc4sap:role-matrix`
ロール・権限のドキュメントを、編集可能なワークブック 1 つにまとめます：チェック付きの表紙、ビジネスロール、PFCG ロール、ビジネスロール × T-code のマトリクス（F フル / C 変更 / D 表示）、ユーザー × ロールの割り当て、権限オブジェクト、ユーザーごと・ロール内での自動競合チェック付きの SoD ルール、変更履歴。新規設計では、モジュールコンサルタントがロール、T-code、権限オブジェクト、SoD ルールを提案し、ST03N の利用状況があれば、利用者が実行している T-code に絞り込みます。SAP からは、PFCG のロールテーブルを読み取ります（レベルは ACTVT から推定し、「?」を付けます）。ユーザーの割り当ては、ユーザー ID と有効期間のみです — ユーザーマスタ、ログオン、パスワードのテーブルは決して読まず、氏名と部署は手入力です。ロール名は、1 回の読み取りの 5,000 行の上限を超えて範囲ごとに読み取り、長いシートはページに分け（行と 50 ロール列）、検索、CSV、貼り付けはシート全体に対して動きます。

**トリアージモード** — 1 人のユーザーが 1 つの T-code で「権限がありません」になる場合：SU53 のチェック（またはメッセージのみの場合は、T-code 起動時のチェックと SU24 の提案を推定として）を、権限インスタンスごとにユーザーのロールに対して評価し、4 つの判定のいずれかを出します — A 不足、B 保有しているが有効ではない（プロファイル生成 / ユーザー比較）、C 割り当てが今日は有効ではない（終了済みまたは未開始）、D 不明。最大 5 つの候補ロールを、最小権限のものから順に提案し、それぞれが追加する T-code レベルの SoD 競合を併記します。HTML 1 ページと短いチケット用サマリーを出力します。読み取り専用で、そのユーザーのロール割り当てのみを読み取り、PRD の実行は先に確認し、ユーザー ID はファイル名とタイトルに出しません。

### `/sc4sap:sap-doctor`
プラグイン + MCP + SAP 接続の診断です。何かおかしいときに最初に実行してください。

### `/sc4sap:sap-option`
`.sc4sap/sap.env` — 認証情報、RFC バックエンド、ブロックリストのポリシー、アクティブモジュール — を表示・編集します。秘密情報はマスクされます。

## チャットからのルーティング

ほとんどのユーザーは、スラッシュコマンドを打つ代わりに、やりたいことを文章で伝えます。[`common/skill-router.md`](../common/skill-router.md) のダイジェストが、セッション開始時に注入されます：

- **そのまま実行**：how / why / 設定の質問 → `ask-consultant`。具体的な伝票（未決の購買発注、出庫の転記、リリース、ブロック、取消）→ `assist`（書き込みの前に必ず確認します）。実行時のダンプやエラー → `analyze-symptom`。日次チェック / ジョブ失敗 / 運用レポート → `ops-health-check`。この依頼は QA / PRD に移せるか → `transport-readiness`。接続の問題 → `sap-doctor`。
- **1 行で提案し、了承されたら実行**：成果物系と書き込み系のスキル（create-program、program-to-spec、config-to-document、uat-scenarios、…）。
- **ルーティングしない**：ユーザーが打ったスラッシュコマンド、すでに実行中のスキル、プラグイン自体についての質問。

[`common/intent-router.md`](../common/intent-router.md) は、1 つの文を、ユーザーに打ち直しを求めることなく、知識（`ask-consultant`）、照会または実行（`assist`）に振り分けます。

## コストモード（standard / eco）

| モード | 変わること |
|---|---|
| `standard`（既定） | スキルは記述どおりに動きます — 判断には Opus、テンプレートと一括書き込みには Sonnet、取得 / 検証 / 検出には Haiku のチェッカー |
| `eco` | サブエージェントのモデルと労力を抑え、メインスレッドの労力を下げます。**成果物もチェックも同じです**（レビュー、検証ゲート、安全のためのステップは決して省略しません） |

設定は `/sc4sap:sap-option`（`costMode`、またはスキルごとに `costModeBySkill`）で行うか、1 回の実行だけなら `/sc4sap:eco <skill> <args>` を使います。解決の優先順位とスキルごとの表は [`common/cost-mode.md`](../common/cost-mode.md) にあります。モードを尋ねるスキル（たとえば `program-test`）は、上記のどれでも決まらないときだけ尋ねます。

## オフラインプロファイル

`connection: offline` のプロファイルには SAP 接続がなく、MCP ブリッジは停止したままです。各スキルは、**full**（同じように動作。例：`uat-scenarios` — T-code は未確認の印付き）、**degraded**（システムへの照会なし、またはユーザーが渡したファイルで動作。例：参照資料とローカルファイルで答える `ask-consultant`、ダウンロードしたフォーム XML に対する `smartform-to-adobe`）、**blocked**（停止の行を返す）のいずれかです。一覧とローカルの知識の優先順位は [`common/offline-mode.md`](../common/offline-mode.md) にあります。

## 🌐 マルチ環境プロファイル（Dev / QA / Prod）

**多国籍の SAP 顧客は、法人ごとに 3 層のランドスケープを運用します**（Sandbox / Dev / QA / Prod。複数の法人を持つことも多く、KR、US、DE…）。sc4sap は、これらすべてを 1 つの Claude Code セッションから管理でき、**Dev 以外の層では安全策が自動で働きます。**

### プロファイルの保存先

| 場所 | 内容 |
|---|---|
| `~/.sc4sap/profiles/<alias>/sap.env` | ユーザーレベルのプロファイル定義（接続、tier、業種、モジュール）。すべてのリポジトリで共有されます。 |
| `~/.sc4sap/profiles/<alias>/config.json` | ユーザーレベルのプロファイルごとの設定（命名規約、systemInfo、activeTransport の履歴）。 |
| `~/.sc4sap/profiles/.trash/` | 論理削除したプロファイル。削除から 7 日後に自動で消去されます。 |
| `<project>/.sc4sap/active-profile.txt` | プロジェクトレベルのポインタ — このリポジトリが今どのプロファイルと通信するか。 |
| `<project>/.sc4sap/work/<alias>/` | プロファイルごとのプロジェクト成果物（仕様書、CBO カタログ、監査）。読み取り専用のクロスビューです：QA のセッションから Dev で作った仕様書を見られますが、書き込みは常にアクティブなプロファイルの下に置かれます。 |

### tier に基づく読み取り専用の強制（厳格ポリシー）

`SAP_TIER` は列挙型です：`DEV` | `QA` | `PRD`。標準でない tier（Sandbox、Staging、Pre-Prod、Training）は、より安全な方に対応づけられます（例：Staging → PRD）。

| ツール群 | DEV | QA | PRD |
|---|---|---|---|
| `Create*` / `Update*` / `Delete*`（DDIC、ABAP、CDS、BO、SB、MDE、Screen、GUI、Package） | ✓ | ✗ | ✗ |
| `CreateTransport` | ✓ | ✗ | ✗ |
| `RunUnitTest` | ✓ | ✓ | ✗ |
| `RuntimeRunProgramWithProfiling` / `RuntimeRunClassWithProfiling` | ✓ | ✗ | ✗ |
| `Get*` / `Read*` / `Search*` / `RuntimeAnalyze*` / `RuntimeList*` / `ValidateServiceBinding` | ✓ | ✓ | ✓ |

2 層の防御：
- **Layer 1 — PreToolUse フック**（`scripts/hooks/tier-readonly-guard.mjs`）を `scripts/install-hooks.mjs` でインストールします。ツールのリクエストが送られる前に動作し、LLM がユーザーに説明できる明確な拒否理由を出します。
- **Layer 2 — MCP サーバーのガード**（`abap-mcp-adt-powerup/src/lib/readonlyGuard.ts`）— 回避できません。ユーザーがフックを無効にしても、プラグインのインストールを省略しても、サーバーが QA/PRD での更新系ツールを `ERR_READONLY_TIER` で拒否します。`ReloadProfile` は常に許可されるので、ユーザーは抜け道の議論なしに Dev へ切り替えて戻れます。

### パスワード用の OS キーチェーン（`@napi-rs/keyring`）

プロファイルは `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>` を保存します — 秘密情報そのものではなく参照です。実際の値は OS の資格情報ストアにあります：

| OS | バックエンド |
|---|---|
| Windows | Credential Manager |
| macOS | Keychain |
| Linux | libsecret（GNOME Keyring / KWallet） |

実装は `@napi-rs/keyring` を使います — Rust + N-API のビルド済みバイナリで、インストール時の `node-gyp` コンパイルも、Node のバージョンアップ時の再ビルドも不要です。`optionalDependencies` として宣言されており、ヘッドレス環境（Docker、CI）では、目立つ警告付きで `SAP_PASSWORD_STORAGE=file`（平文）に穏当にフォールバックします。既存の平文の `.sc4sap/sap.env` は、最初のアップグレード時にキーチェーンへ移行されます。

### プロファイルの切り替え、追加、削除

すべて `/sc4sap:sap-option` から行います：

- **切り替え** — 対話式のピッカー（ネイティブの `AskUserQuestion` UI）で、プロファイルごとのプレビューパネルに接続の詳細と、許可されるツールのマトリクスを表示します。`active-profile.txt` を書き込み、MCP サーバーで `mcp__sap__ReloadProfile` を呼び出し（Claude Code の再起動は不要）、HUD は新しい `alias [tier] 🔒` のバッジで再描画されます。
- **追加** — ウィザードが、エイリアス、tier、ホスト/クライアント/ユーザー、パスワード（キーチェーンに直接送られ、画面には表示されません）を取得します。同じ会社の自動検出：`KR-DEV` がある状態で `KR-QA` を追加すると、`SAP_INDUSTRY`、`SAP_ACTIVE_MODULES`、`ABAP_RELEASE`、`namingConvention` ブロックのコピーを提案します。
- **削除** — 確認のために、ユーザーがエイリアスをそのまま入力する必要があります。完全削除せず `.trash/{alias}-{timestamp}/` にアーカイブします。アクティブなプロファイルの削除は拒否します。
- **編集** — tier 以外の項目を変更します（PRD → DEV への誤ったダウングレードを防ぐため、この経路では tier は変更できません）。パスワードの編集は、キーチェーンのエントリを書き換えます。
- **消去** — 7 日より古い `.trash/*` を完全に削除します（すぐにすべて消去するには `--all`）。

### 従来の単一プロファイル `sap.env` からの移行

マルチプロファイル版にアップグレードした既存ユーザーは、`.sc4sap/sap.env` があるのに `active-profile.txt` がないプロジェクトで初めて Claude Code を起動したときに、SessionStart のバナー（`scripts/legacy-migration-banner.mjs`）を目にします。バナーは `/sc4sap:sap-option` を案内し、そこで 2 問の移行ウィザード（エイリアス、tier）が進みます。従来のファイルはロールバック用に `sap.env.legacy` にリネームされ、データは削除されません。

### HUD

ステータスラインの 2 行目に `{alias} [{tier}]` を表示し、`tier != DEV` のときは 🔒 が付きます。色は使いません — テーマに依存しない唯一の目印が、ロックのアイコンです。

```
 KR-DEV [DEV]       SID S4H · client 100 · user DEVELOPER · CTS DEVK904224
 KR-PRD [PRD] 🔒    SID S4P · client 400 · user READER
```

### 関連ファイル

- 設計：[`multi-profile-design.md`](multi-profile-design.md)
- 実装計画：[`multi-profile-implementation-plan.md`](multi-profile-implementation-plan.md)
- CLI：`scripts/sap-profile-cli.mjs`（list / switch / add / remove / migrate / purge / keychain-set / keychain-delete）
- スキルの補足ファイル：`skills/sap-option/profile-management.md`、`skills/sap-option/migration.md`

## MCP ABAP ADT サーバー — 独自の機能

sc4sap は **[abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)**（150 以上のツール）を基盤にしています。通常の Class / Program / Table / CDS / FM の CRUD に加え、ほとんどの MCP サーバーが扱わない、**従来型 Dynpro 成果物の R/U/C のフルカバレッジ**を備えます：

| 成果物 | カバレッジ |
|--------|------------|
| **Screen (Dynpro)** | `GetScreen` / `CreateScreen` / `UpdateScreen` / `DeleteScreen` — ヘッダー + フローロジックの完全なラウンドトリップ |
| **GUI Status** | `GetGuiStatus` / `CreateGuiStatus` / `UpdateGuiStatus` / `DeleteGuiStatus` — メニューバー、ファンクションキー、ツールバー |
| **Text Element** | `GetTextElement` / `CreateTextElement` / `UpdateTextElement` / `DeleteTextElement` — テキストシンボル、選択テキスト、リスト見出し |
| **Includes** | `GetInclude` / `CreateInclude` / `UpdateInclude` / `DeleteInclude` — Main+Include の規約 |
| **ローカルの定義/マクロ/テスト/型** | プログラム内のローカルセクションを個別に編集 |
| **Metadata Extension (CDS)** | `Get/Create/Update/Delete MetadataExtension` — Fiori/UI アノテーションの階層化 |
| **Behavior Definition / Implementation (RAP)** | RAP の BDEF + BHV のサイクル全体 |
| **Service Definition / Binding** | OData V2/V4 の公開 + `ValidateServiceBinding` |
| **Enhancements / BAdI** | `GetEnhancements`、`GetEnhancementSpot`、`GetEnhancementImpl` による探索 |
| **Runtime & Profiling** | `RuntimeAnalyzeDump`、`RuntimeListSystemMessages`、`RuntimeGetGatewayErrorLog`、`RuntimeGetProfilerTraceData`、`RuntimeRunProgramWithProfiling` — ST22 / SM02 / /IWFND/ERROR_LOG / SAT 風のプロファイリングを Claude から実行 |
| **Semantic / AST** | `GetAbapAST`、`GetAbapSemanticAnalysis`、`GetAbapSystemSymbols`、`GetWhereUsed` |
| **Unit Tests** | ABAP Unit（`CreateUnitTest`）と CDS Unit（`CreateCdsUnitTest`）の両方 |
| **Transport** | `GetTransport`、`ListTransports`、`CreateTransport` |

## 共通規約（`common/`）

スキル横断の作成ルールは `common/` にあり、すべてのスキルとエージェントが同じ手順に従います。`CLAUDE.md` は、これらのファイルを参照する薄い索引です。

| ファイル | 対象 |
|------|------|
| `clean-code.md` + `clean-code-oop.md` + `clean-code-procedural.md` | Clean ABAP の標準（パラダイムごとに分割） |
| `include-structure.md` | メインプログラム + 条件付きのインクルード群（t/s/c/ct/e/o/i/a/f） |
| `oop-pattern.md` | 2 クラスの OOP 分割（`c` に `LCL_DATA` + `LCL_ALV`、`e` に `LCL_EVENT_ALV`） |
| `alv-rules.md` | フル ALV（CL_GUI_ALV_GRID + Docking）と SALV + SALV ファクトリのフィールドカタログ |
| `text-element-rule.md` | 必須のテキスト要素 — 2 パスの言語ルール（主言語 + `'E'` のセーフティネット） |
| `constant-rule.md` | フィールドカタログ以外のマジックリテラルに対する必須の CONSTANTS |
| `procedural-form-naming.md` | ALV に結びつく FORM への `_{screen_no}` サフィックス |
| `naming-conventions.md` | プログラム、インクルード、LCL_*、画面、GUI ステータスの共通の命名 |
| `sap-version-reference.md` | ECC と S/4HANA の違い |
| `abap-release-reference.md` | リリースごとの ABAP 構文の利用可否 |
| `spro-lookup.md` | SPRO 参照の優先順位（ローカルキャッシュ → 静的 → MCP） |
| `data-extraction-policy.md` | エージェントの拒否プロトコル + `acknowledge_risk` ハードルール |
| `active-modules.md` | モジュール横断の連携マトリクス（MM↔PS、SD↔CO、QM↔PP、…） |
| `context-loading-protocol.md` | 4 層のオンデマンドファイル読み込み（グローバル → ロール → トリガー → タスクごと） |
| `model-routing-rule.md` | Sonnet / Opus / Haiku のルーティング + 応答プレフィックス規約 + フェーズバナー規約。スキルごと・フェーズごとのモデル割り当ては **[`skill-model-architecture.md`](skill-model-architecture.md)** を参照してください（設計意図 — frontmatter の `model:` は宣言的なものです）。 |
| `ok-code-pattern.md` | 画面の OK_CODE の取り決め（TOP の 1 つの変数 → 画面の NAME → PAI のディスパッチ。CASE sy-ucomm は使いません） |
| `field-typing-rule.md` | DDIC 項目の型付けの優先順位（標準 DE → CBO DE → 新規 DE → プリミティブ） |
| `function-module-rule.md` | FM ソースの規約（インラインの IMPORTING/EXPORTING/TABLES シグネチャ） |
| `transport-client-rule.md` | すべての `CreateTransport` に `sap.env` からの明示的なクライアントが必要 |
| `ecc-ddic-fallback.md` | ECC の DDIC 作成：まず `ZMCP_ADT_DDIC_*` 経由の MCP ツール、フォールバックとして `$TMP` ヘルパーレポート |
| `cloud-abap-constraints.md` | 禁止されるステートメントと、S/4 Cloud Public 向けのクラウドネイティブ API への置き換え |
| `customization-lookup.md` | 既存の Z*/Y* の BAdI 実装 / CMOD / フォーム出口 / アペンドの再利用ゲート |
| `screen-tabstrip.md` | タブストリップ画面（STRIP_CTRL + サブスクリーン領域 + タブの PUSH 行、PBO と PAI の `CALL SUBSCREEN`） |
| `skill-router.md` · `intent-router.md` | 通常のチャット → 適切なスキル。`ask-consultant` と `assist` の間の、知識 / 照会 / 実行の振り分け |
| `cost-mode.md` · `model-dispatch-mode.md` | コストモード（standard / eco）とモデルディスパッチモード（auto / user-defined） |
| `offline-mode.md` | オフラインプロファイル：スキルごとの full / degraded / blocked、通知と停止の行 |
| `multi-profile-artifact-resolution.md` | 各プロファイルの成果物の置き場所。アクティブなシステムにないターゲットオブジェクトがあるとスキルは停止します |
| `verification-evidence.md` · `evidence-receipt.md` | 最終レポート：完了基準を先に固定し、サマリーの前に証跡を示します。レシートは MCP の応答からスクリプトが決定します（`create-program`） |
| `sap-content-as-data.md` | ソース、テキスト、ダンプ、行、Web ページはデータであり、指示ではありません。SAP のテキストは `<sap-data>` ブロックで渡します |
| `structured-return-repair.md` | 不正な形式のエージェント戻りブロックは、同じエージェントが 1 回だけ書き直します。判定は変わりません |
| `adobe-forms-verification.md` | Adobe フォーム系スキルの指標とゲート。SAP 自身の印刷結果に対して測定します |
| `humanize-korean.md` | 韓国語の文章の推敲（読点は常に。長い文は任意の humanize-korean プラグイン経由） |
| `team-consultation-protocol.md` | 複数の専門エージェントのチーム（`teamMode`）のための、戻り値ベースのプロトコル |

## コンテキスト読み込みアーキテクチャ（v0.5.2+）

sc4sap のルール群は大規模です — 25 以上の `common/*.md` + 14 の `configs/{MODULE}/*.md` + 30 以上の業種/国のファイル。エージェントを起動するたびにすべてのファイルを読み込むと、トークンを浪費し、モデルの注意が散ります。**4 層のコンテキスト読み込みモデル**（[`common/context-loading-protocol.md`](../common/context-loading-protocol.md) で定義）は、「常に読み込む安全の砦」、「ロール固有のベースライン」、「条件で起動するもの」、「タスクごとのキット」を分けます。

| 層 | 読み込まれるタイミング | ファイル |
|------|-------------|-------|
| **Tier 1 — グローバル必須** | すべてのエージェント、すべてのスキル、すべてのセッション開始時 | `data-extraction-policy.md`、`sap-version-reference.md`、`naming-conventions.md` |
| **Tier 2 — ロール必須** | エージェントのロールグループごとの固定セット、セッション開始時 | ロールグループによって異なります（下記参照） |
| **Tier 3 — トリガーによる読み込み** | 条件が現在のタスクに一致したとき | ALV → `alv-rules.md` · 手続き型 → `clean-code-procedural.md` + `ok-code-pattern.md` · `CALL SCREEN` → `ok-code-pattern.md` · ECC → `ecc-ddic-fallback.md` · 業種/国の設定あり → 対応するファイル · など |
| **Tier 4 — タスクごとのキット** | 呼び出すスキル/フェーズ/バケットが宣言 | `phase4-parallel.md` ではウェーブごと、`phase6-review.md` では §1〜§12 ごと |

### Tier 2 のロールグループ

| ロールグループ | エージェント | Tier 2 で追加されるもの |
|------------|--------|-------------|
| **コードライター** | `sap-executor`、`sap-qa-tester`、`sap-debugger` | `clean-code.md`、`abap-release-reference.md`、`transport-client-rule.md`、`include-structure.md`（+ パラダイムのファイル） |
| **レビュアー** | `sap-code-reviewer`、`sap-critic` | `clean-code.md`、`abap-release-reference.md`、`include-structure.md`（Phase 6 ではバケットごとに絞り込み） |
| **プランナー / アーキテクト** | `sap-planner`、`sap-architect` | `include-structure.md`、`active-modules.md`、`customization-lookup.md`、`field-typing-rule.md` |
| **アナリスト / ライター** | `sap-analyst`、`sap-writer` | `active-modules.md` |
| **ドキュメントスペシャリスト** | `sap-doc-specialist` | *（なし — タスク駆動のみ）* |
| **モジュールコンサルタント** | 14 のモジュールコンサルタント（SD、MM、FI、CO、PP、PS、PM、QM、TR、HCM、WM、TM、BW、Ariba） | `spro-lookup.md`、`customization-lookup.md`、`active-modules.md`、`configs/{MODULE}/*.md`（オンデマンド — 質問に必要なファイルのみ） |
| **Basis コンサルタント** | `sap-bc-consultant` | `transport-client-rule.md`、`configs/common/*.md` |

### 強制の仕組み

すべての `agents/*.md` ファイルは、`<Agent_Prompt>` の先頭にある `<Mandatory_Baseline>` ブロックで、自分のロールグループを宣言します。エージェントは、MCP を呼び出す前に、セッション開始時に Tier 1 + Tier 2 を読み込みます。スキルのプロンプトが宣言するのは Tier 4（タスクごと）の追加分だけで、Tier 1 + 2 は前提とされます。MAJOR なブロッカーがあると、エージェントは `BLOCKED — context kit insufficient: <list>` を返し、スキルが更新したキットを提供できるようにします。

### 測定された効果

- 1 回のディスパッチあたりのトークン：v0.5.0 以前の暗黙の全件読み込みと比べて −40〜−60%。
- `/sc4sap:create-program` での Opus の使用比率：−50%（ルーティングマトリクスは `model-routing-rule.md`）。
- レビュアーの MAJOR 指摘の検出：改善 — §1〜§12 の各項目は、12 個のルールファイルを一度に流し読みするのではなく、関連するルールだけをコンテキストに入れて実行されます。

## 応答プレフィックス規約（v0.5.2+）

`/sc4sap:*` スキルが起動したすべての応答は、どのモデルが作業を実行し、どのサブエージェントが起動されたかが一目で分かるよう、1 行のプレフィックスで始まります：

```
[Model: <main-model> · Dispatched: <sub-summary>]
```

例：

```
[Model: Opus]
— pure main-thread response, no sub-agent dispatches

[Model: Opus · Dispatched: Sonnet×2]
— main thread + two parallel Sonnet executors (Wave 2 G4-prep text bulk)

[Model: Opus · Dispatched: Opus×1 (planner)]
— Phase 2 planner dispatch

[Model: Opus · Dispatched: Sonnet×3 (B3a executor range α/β/γ)]
— Multi-Executor Split per multi-executor-split.md Strategy A
```

この規約は、すべての `/sc4sap:*` の SKILL.md にある `<Response_Prefix>` ブロックが強制し、[`common/model-routing-rule.md`](../common/model-routing-rule.md) の *Response Prefix Convention* を参照します。プレフィックスはスキルが起動したターンにのみ適用され、無関係な話題に切り替えたユーザーのメッセージでは、そのターンのプレフィックスを付けません。

## 業種リファレンス（`industry/`）

14 の業種ファイル — すべての `sap-*-consultant` が参照します。それぞれが **Business Characteristics / Key Processes / Master Data / Module Implications / Common Customizations / SAP Industry Solutions / Pitfalls** を扱います。

業種：retail、fashion、cosmetics、tire、automotive、pharmaceutical、food-beverage、chemical、electronics、construction、steel、utilities、banking、public-sector。

## 国別・ローカライズリファレンス（`country/`）

15 の国別ファイル + `eu-common.md` — アナリスト / クリティック / プランナーに必須です。**Formats / Tax System / e-Invoicing / Banking / Payroll / Statutory Reporting / SAP Country Version / Pitfalls** を扱います。

| ファイル | 主な特徴 |
|------|-------------------|
| 🇰🇷 `kr.md` | e-세금계산서 (NTS)、사업자등록번호、주민번호 PII |
| 🇯🇵 `jp.md` | Qualified Invoice System (2023+)、Zengin、法人番号 |
| 🇨🇳 `cn.md` | Golden Tax、发票/e-fapiao、SAFE FX |
| 🇺🇸 `us.md` | Sales & Use Tax (no VAT)、1099、Nexus |
| 🇩🇪 `de.md` | USt、ELSTER、XRechnung / ZUGFeRD、SEPA |
| 🇬🇧 `gb.md` | VAT + MTD、BACS/FPS/CHAPS、Post-Brexit (GB vs XI) |
| 🇫🇷 `fr.md` | TVA、FEC、Factur-X 2026 |
| 🇮🇹 `it.md` | IVA、FatturaPA / SDI (mandatory since 2019) |
| 🇪🇸 `es.md` | IVA、SII (real-time 4-day)、TicketBAI |
| 🇳🇱 `nl.md` | BTW、KvK、Peppol、XAF |
| 🇧🇷 `br.md` | NF-e、SPED、CFOP、PIX |
| 🇲🇽 `mx.md` | CFDI 4.0、SAT、Carta Porte、SPEI |
| 🇮🇳 `in.md` | GST、IRN e-invoice、e-Way Bill、TDS |
| 🇦🇺 `au.md` | GST、ABN、STP Phase 2、BAS |
| 🇸🇬 `sg.md` | GST、UEN、InvoiceNow、PayNow |
| 🇪🇺 `eu-common.md` | VIES、INTRASTAT、SEPA、GDPR |

複数国へのロールアウト：関連するすべてのファイルを読み込み、国をまたぐ接点（EU 域内 VAT、会社間取引、移転価格、源泉徴収）を明示します。

## アクティブモジュール連携

`common/active-modules.md` は、モジュール横断の連携マトリクスを定義します。複数のモジュールがアクティブなとき、スキルは連携用の項目を先回りして提案します。

例：**PS がアクティブ**なランドスケープで MM の購買発注を作成する場合 → 勘定設定カテゴリ `P`/`Q` + `PS_POSID`（WBS 要素）を提案します。**CO がアクティブ**ならコストセンタの導出を、**QM がアクティブ**なら入庫時の検査ロットの自動作成を提案します。

`/sc4sap:setup`（Step 4）または `/sc4sap:sap-option modules` で設定します。`create-program`、`create-object`、`stock-cbo`、およびすべてのコンサルタントエージェントが利用します。

## SAP プラットフォームへの対応（ECC / S4 オンプレミス / クラウド）

`sc4sap:create-program` は、必須の SAP バージョン事前確認を実行し、`.sc4sap/config.json` から `sapVersion` と `abapRelease` を読み取ります：

- **ECC** — RAP/ACDOCA/BP なし。構文はリリースで制限されます
- **S/4HANA オンプレミス** — 従来型 Dynpro は警告します。拡張性を優先し、会計は MATDOC + ACDOCA を使います
- **S/4HANA Cloud (Public)** — **従来型 Dynpro は禁止**。RAP + Fiori Elements、`if_oo_adt_classrun`、または SALV のみに誘導します。完全なリストは `common/cloud-abap-constraints.md` にあります
- **S/4HANA Cloud (Private)** — CDS + AMDP + RAP + Business Partner API を優先します

### ECC / BASIS < 7.50 — MCP ツール互換性マトリクス

レガシーシステムでは、アクティブなプロファイルに次のいずれかが設定されていると、MCP サーバー（`abap-mcp-adt-powerup`）は自動的に `AdtClientLegacy` 経由にルーティングします：

- `SAP_VERSION=ECC` — 常にプロファイルをレガシーとして扱います
- `ABAP_RELEASE` が数値で `< 750`（例：`740`、`731`）
- `SAP_SYSTEM_TYPE=legacy` — 明示的な上書き（後方互換）

レガシーモードは、BASIS < 7.50 に存在しないエンドポイントの一部をあえて拒否し、分かりにくい 404 の代わりに、明確な `"not supported on this SAP system"` メッセージを返します。

ECC 7.40（BASIS 7.40、SAP_SYSTEM_TYPE=onprem、SAP_VERSION=ECC、ABAP_RELEASE=740）で検証したマトリクス：

| カテゴリ | ツール | ECC 7.40 | 備考 |
|---|---|---|---|
| Session、Search、Discovery | `GetSession`、`SearchObject`、`GetObjectInfo`、`GetObjectStructure`、`GetInactiveObjects` | ✅ | — |
| パッケージの読み取り | `GetPackageContents`、`GetPackageTree` | ✅ | — |
| パッケージのメタデータ | `GetPackage` | ❌ | `/sap/bc/adt/packages` がありません — SE80/SE21 を使ってください |
| DDIC の読み取り | `GetTable`、`GetStructure`、`GetDataElement`、`GetDomain` | ❌ | `/sap/bc/adt/ddic/{tables,structures,dataelements,domains}` は 7.50 で追加されました |
| DDIC の書き込み（従来型） | `Table`、`Structure`、`DataElement`、`Domain` の `Create/Update/Delete` | ❌ | 同じギャップです — MCP は Create を `ZMCP_ADT_DDIC_*` FM（セットアップ Step 9a.2、OData バックエンド）にルーティングします。それ以外は [`common/ecc-ddic-fallback.md`](../common/ecc-ddic-fallback.md) の **$TMP ヘルパーレポートによるフォールバック**を使います |
| 従来型ビュー（`VIEW/DV`） | V_T001_CORE のような従来型ビューの `GetView` | ❌ | 従来型ビューのエンドポイントは ECC 7.40 で 404 になります |
| CDS ビュー（`DDLS/DF`） | `GetView`、`CreateView`、`UpdateView`、`DeleteView` | ✅ | `/sap/bc/adt/ddic/ddl/sources/` は BASIS 7.40 SP05+ から存在し、CDS DDL は問題なく有効化されます |
| ABAP ソース | Program、Class、Interface、Include、FunctionGroup、FunctionModule の `Get/Create/Update/Delete` | ✅ | 読み書きとも完全対応。`UpdateFunctionModule` は、$TMP オブジェクトでは `transport_request` を自動的に `"local"` にします |
| 分析 | `GetAbapSemanticAnalysis`、`GetAbapAST` | ✅ | クライアント側の解析で、SAP を呼び出しません |
| WhereUsed | `GetWhereUsed` | ⚠️ | 従来型オブジェクトのみ — `TABL` のターゲットは "Unsupported object type" を返します |
| エンハンスメント | `GetEnhancements`、`GetEnhancementSpot`、`GetEnhancementImpl` | ❌ | `/sap/bc/adt/enhancements` は BASIS < 7.50 で 404 です — SE18 / SE19 / CMOD / SMOD を使ってください |
| 移送 | `ListTransports`、`GetTransport`、`CreateTransport` | ✅ | — |
| ランタイム / ダンプ | `RuntimeListDumps`、`RuntimeAnalyzeDump`、`RuntimeGetDumpById` | ✅ | ADT 経由の ST22 |
| Screen / GUI Status | `GetScreen`、`GetGuiStatus`、`GetTextElement`（+ Create/Update） | ℹ️ | RFC 経由のディスパッチ — `SAP_RFC_BACKEND` の事前確認が必要です（odata / soap） |
| RAP / Behavior / Service / MetadataExt | すべての `*BehaviorDefinition`、`*BehaviorImplementation`、`*ServiceDefinition`、`*ServiceBinding`、`*MetadataExtension` | ❌ | S/4HANA 専用 — ECC には RAP スタックがありません |
| テーブルの内容 | `GetTableContents`、`GetSqlQuery` | ℹ️ | 動作しますが、プロファイルごとのデータ抽出ブロックリストで制限されます（§データ抽出ブロックリストを参照） |

凡例：✅ 完全対応 · ⚠️ 部分対応 · ❌ 明確なエラーで拒否（SAP プラットフォームの制約） · ℹ️ 動作するが、事前のセットアップ / ポリシーに依存。

上流のリファレンス（同じマトリクスの、MCP サーバー側の正式版）：[`abap-mcp-adt-powerup` README → Legacy (ECC / BASIS < 7.50) Compatibility Matrix](https://github.com/babamba2/abap-mcp-adt-powerup#legacy-ecc--basis--750-compatibility-matrix)。

## SPRO 設定リファレンス

14 の SAP モジュールすべての組み込みリファレンスデータが `configs/{MODULE}/` にあります：
- `spro.md` — SPRO の設定テーブル/ビュー
- `tcodes.md` — トランザクションコード
- `bapi.md` — BAPI/FM のリファレンス
- `tables.md` — 主要テーブル
- `enhancements.md` — BAdI / ユーザー出口 / BTE / VOFM
- `workflows.md` — 開発ワークフロー

モジュール：SD、MM、FI、CO、PP、PS、PM、QM、TR、HCM、WM、TM、Ariba、BW。

### SPRO ローカルキャッシュ（トークン節約）

`/sc4sap:setup spro` は、顧客固有の SPRO カスタマイジングを `.sc4sap/spro-config.json` に抽出します。コンサルタントは `common/spro-lookup.md` に従います：
1. ローカルキャッシュ → 2. 静的リファレンス → 3. MCP へのライブ照会（確認あり）。

## SAP 固有のフック

`hooks/hooks.json` に登録されています：

| イベント | フック | 動作 |
|---|---|---|
| SessionStart | `session-start.mjs`、`project-memory-session.mjs`、`legacy-migration-banner.mjs` | プラグインのルールとスキルルーターのダイジェスト、`.sc4sap/project-memory.json` からのプロジェクト環境、従来の単一プロファイル `sap.env` 向けのバナー |
| Setup（`init`、`maintenance`） | `setup-init.mjs`、`setup-maintenance.mjs` | `claude --init-only` / `-p --init` の実行時に `.sc4sap` の構成を作成し、`claude -p --maintenance` の実行時に古い状態を削除し設定を確認します |
| PreToolUse（SAP ツール） | `permission-approver.mjs` | SAP の MCP 呼び出しを自動承認し、パイプラインとそのエージェントが呼び出しごとの確認なしで動けるようにします — ただし、行データの読み取り（`GetTableContents`、`GetRemoteTableContents`、`GetSqlQuery`）と業務アクション（`PreviewBusinessAction`、`ExecuteBusinessAction`）は除き、これらは常に確認が出ます 唯一の例外として、`stock-cbo` と同じ形で DD* リポジトリメタデータを読む `GetSqlQuery` は自動承認されます。 |
| PreToolUse（行の読み取り、ソースの書き込み） | `hooks/block-forbidden-tables.mjs` | 🔒 データ抽出ブロックリスト（下記）— 行を読める経路である、Create / Update 経由で書かれるテストコードや CDS ビューにも適用されます |
| PreToolUse（行の読み取り） | `program-test/pt-gate.mjs` | program-test の実行中：実行の `mask` のない読み取りと、実行自身の接続先以外への本番の読み取りを拒否します |
| PreToolUse（ファイルツール） | `evidence/guard.mjs` | エージェントは、スクリプトが管理する証跡ファイル（レシート、マスク済みの行、ハーネス）を書き込めません |
| PostToolUse（SAP ツール） | `evidence/record.mjs` | MCP の応答を、実行の証跡台帳に記録します |
| PostToolUseFailure | `post-tool-use-failure.mjs` | リトライの指針のために、失敗とリトライ回数を記録します |
| SubagentStart / SubagentStop | `subagent-tracker.mjs`、`verify-deliverables.mjs` | 起動したエージェントを追跡します。エージェントが期待される成果物を残さなかった場合に（ブロックせず）警告します |
| Stop / SessionEnd | `context-guard-stop.mjs`、`session-end.mjs` | コンテキストが大きくなったときにセッションのリフレッシュを提案します。セッションのサマリーログ |

tier ガード（`scripts/hooks/tier-readonly-guard.mjs`、QA / PRD は読み取り専用）は、`/sc4sap:setup` によってプロジェクト設定にインストールされます（マルチ環境プロファイルを参照）。

## 🔒 データ抽出ブロックリスト

機微なテーブル（PII、認証情報、給与、銀行、取引系の会計）の行データが `GetTableContents` / `GetSqlQuery` で取得されるのを防ぐ、多層防御です。

**4 つの強制レイヤー**：L1 エージェントの指示 · L2 `CLAUDE.md` のグローバル指令 · L3 Claude Code の `PreToolUse` フック · L4 MCP サーバーの環境変数で制御するガード。

**ブロックリストの出典**：`exceptions/table_exception.md` が索引で、実際のリストは `exceptions/` の下の 11 のセクション別ファイルにあります。

| 層 | カバー範囲 |
|------|------------|
| minimal | 銀行/支払、マスタデータ PII、住所、認証/セキュリティ、HR/給与、税/政府 ID、価格/条件、カスタム `Z*` の PII パターン |
| standard | + 保護対象の業務データ（VBAK/BKPF/ACDOCA/VBRK/EKKO/CDHDR/STXH + CDS） |
| strict | + 監査/セキュリティのログ、コミュニケーション/ワークフロー |

**アクション**：`deny`（ブロック）と `warn`（警告ブロック付きで続行）。呼び出しの中に `deny` のテーブルが 1 つでもあれば、呼び出し全体がブロックされます。

**プロファイル**（`/sc4sap:setup` で選択）：`strict` / `standard` / `minimal` / `custom`。サイト固有の追加は `.sc4sap/blocklist-extend.txt` で行います。

**インストール**（`/sc4sap:setup` が自動で行います。手動の場合）：
```bash
node scripts/install-hooks.mjs            # user-level
node scripts/install-hooks.mjs --project  # project-level
```

**検証**：
```bash
echo '{"tool_name":"mcp__abap__GetTableContents","tool_input":{"table":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
# Expected: JSON with "permissionDecision":"deny"
```

**L4 のサーバー側の強制**（外部スクリプトを含む、あらゆるクライアントを止めます）：
```bash
export SC4SAP_POLICY=on
export SC4SAP_POLICY_PROFILE=strict
export SC4SAP_BLOCKLIST_PATH=/path/to/sc4sap/exceptions/table_exception.md
export SC4SAP_ALLOW_TABLE=TAB1,TAB2  # session emergency exemption (logged)
```

スキーマ/DDIC のメタデータ（`GetTable`、`GetStructure`、`GetView`、`GetDataElement`、`GetDomain`）と存在確認は、引き続き許可されます。

## 🚫 `acknowledge_risk` — ハードルール

`GetTableContents` / `GetSqlQuery` は、`acknowledge_risk: true` を受け取って、確認が必要な層のゲートを回避できます。**これは監査上の境界であり、便利なフラグではありません。**

1. **最初の呼び出しで `acknowledge_risk: true` を設定しないでください** — フック/サーバーにゲートさせます
2. **`ask` の応答が返ったら**停止し、拒否をユーザーに伝えます
3. テーブルと範囲を示して、**明示的な yes/no の質問をします**
4. 明示的に肯定するキーワード `yes` / `y` / `승인` / `authorize` / `approve` / `proceed` / `confirmed` があった**後にのみ**、`acknowledge_risk: true` で再試行します
5. **曖昧な命令は承認ではありません** — `"pull it"`、`"try it"`、`"뽑아봐"`、`"my mistake"`、無言
6. **呼び出しごと、テーブルごと、セッションごと** — 承認は引き継がれません

完全なプロトコル：`common/data-extraction-policy.md`。

### ⚠️ 「常に許可」の落とし穴
`GetTableContents` / `GetSqlQuery` の権限確認が表示されたら、**「Always allow」**ではなく**「Allow once」**を選んでください。Claude Code は「Always allow」を選ぶと、ツール ID を `permissions.allow` に追記し、安全装置を恒久的に無効にします。復旧方法：親スキルを再実行してください — `trust-session` の Step 2 が、呼び出しのたびに `GetTableContents`/`GetSqlQuery` のエントリを検出して削除します。

## 🔀 SAP 接続：Web ポート、RFC バックエンド、NCo

sc4sap は、Web ポート（HTTP 80NN / HTTPS 443NN）上の ADT で SAP と通信します。Web ポートを開けられない環境では、Windows の開発者 PC 上の **SAP .NET Connector（NCo）を使い、RFC ポート（33NN）経由**で接続できます — ICF ノード、Gateway サービス、`S_SERVICE` は不要で、`S_ADT_RES` と開発権限は変わりません。NCo は SAP のライセンス製品で、各ユーザーがインストールします。対応するのはアプリケーションサーバー + インスタンスのみです（ログオングループ、SAProuter、SNC は非対応）。詳細：[はじめに → RFC（NCo）](GETTING-STARTED.ja.md#web-ポートを開けられない場合-rfcnco)。

Screen / GUI Status / Text Element の操作は、SAP 上の RFC 対応 FM 経由でディスパッチされます。Web ポート上の 2 つのトランスポートバックエンド：

| `SAP_RFC_BACKEND` | 方式 | 使いどころ |
|---|---|---|
| `odata`（既定） | HTTPS OData v2 `ZMCP_ADT_SRV` | 堅牢化された Gateway 環境で動作します。標準の Gateway 認証（S_SERVICE）を通ります。[docs/odata-backend.md](odata-backend.md) |
| `soap` | HTTPS `/sap/bc/soap/rfc` | `/sap/bc/soap/rfc` の ICF ノードが有効な場合の従来のパス（本番では無効化されることが増えています） |

`native`、`gateway`、`zrfc` は MCP 4.10.0 で削除されました — これらを指定すると、MCP サーバーは起動を拒否します。`odata` または `soap` に切り替えてください。

`/sc4sap:sap-option` でいつでも切り替えられます。MCP を再接続し、`/sc4sap:sap-doctor` で確認してください。

---

← [README に戻る](../README.ja.md) · [インストール →](INSTALLATION.ja.md) · [変更履歴 →](CHANGELOG.ja.md)
