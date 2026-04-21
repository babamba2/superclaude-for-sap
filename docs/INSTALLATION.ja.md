# インストール & セットアップ

← [README に戻る](../README.ja.md)

## 要件

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D%2020.0.0-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-CLI-6B4FBB?logo=anthropic&logoColor=white)
![SAP ECC](https://img.shields.io/badge/SAP-ECC_6.0-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA](https://img.shields.io/badge/SAP-S%2F4HANA_On--Premise-0FAAFF?logo=sap&logoColor=white)
![SAP S/4HANA Cloud](https://img.shields.io/badge/SAP-S%2F4HANA_Cloud-0FAAFF?logo=sap&logoColor=white)
![MCP ABAP ADT](https://img.shields.io/badge/MCP_ABAP_ADT-Auto--Installed-FF6600)

| 項目 | 詳細 |
|------|------|
| **Node.js** | >= 20.0.0 |
| **Claude Code** | CLI インストール済 (Max/Pro サブスクリプションまたは API キー) |
| **SAP システム** | **SAP ECC 6.0** / **S/4HANA On-Premise** / **S/4HANA Cloud (Public & Private)** — ADT 有効 |

> **MCP サーバー** ([abap-mcp-adt-powerup](https://github.com/babamba2/abap-mcp-adt-powerup)) は `/sc4sap:setup` 中に**自動インストール・設定**されます — 手動の事前インストール不要。

## インストール

> **注** — sc4sap は**まだ公式 Claude Code プラグインマーケットプレイスに登録されていません**。当面はこのリポジトリをカスタムマーケットプレイスとして追加し、プラグインをインストールしてください。

### オプション A — カスタムマーケットプレイスとして追加 (推奨)

Claude Code セッション内で:

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
/plugin install sc4sap
```

更新:

```
/plugin marketplace update babamba2/superclaude-for-sap
/plugin install sc4sap
```

### オプション B — ソースからインストール

```bash
git clone https://github.com/babamba2/superclaude-for-sap.git
cd superclaude-for-sap
npm install && npm run build
```

その後 Claude Code で `/plugin marketplace add <ローカルパス>` を実行してローカルプラグインディレクトリを指定。

## セットアップ

```bash
# セットアップスキルを実行 — ウィザードが1問ずつ案内
/sc4sap:setup
```

### サブコマンド

```bash
/sc4sap:setup                # フルウィザード (デフォルト)
/sc4sap:setup doctor         # /sc4sap:sap-doctor へルーティング
/sc4sap:setup mcp            # /sc4sap:mcp-setup へルーティング
/sc4sap:setup spro           # SPRO 設定自動抽出のみ
/sc4sap:setup customizations # Z*/Y* 拡張・エクステンションインベントリのみ
```

### マルチプロファイルアーキテクチャ (0.6.0+)

sc4sap は同一の Claude Code セッション内で複数の SAP 接続 (Dev / QA / Prod × N 社) をサポートします。

```
~/.sc4sap/                                    ← ユーザーホーム (リポジトリ間で共有)
└── profiles/
    ├── KR-DEV/{sap.env, config.json}         ← 接続ごとに 1 プロファイル
    ├── KR-QA/ {sap.env, config.json}
    └── KR-PRD/{sap.env, config.json}

<project>/.sc4sap/                            ← プロジェクトルート (engagement スコープ)
├── active-profile.txt                        ← "KR-DEV"
└── work/
    ├── KR-DEV/{program, cbo, customizations, ...}
    └── KR-PRD/{...}
```

Tier enum (`DEV` / `QA` / `PRD`) が readonly 強制の基準: QA/PRD プロファイルは `Create*` / `Update*` / `Delete*` を 2 レイヤーで遮断 — PreToolUse フック (L1, ワイヤ以前) + MCP サーバー自身のガード (L2, バイパス不可)。QA/PRD プロファイルは Step 9 ABAP ユーティリティインストールも **拒否** — 対応する DEV プロファイルでインストールし CTS 経由で転送してください。

パスワードは OS キーチェーン (Windows 資格情報マネージャー / macOS Keychain / Linux libsecret) に `@napi-rs/keyring` で保存されます。キーチェーンが利用できない環境 (headless / Docker / optional 依存未インストール) では sc4sap が自動的にプロファイル env の平文にフォールバックし、ユーザーに警告します。

全設計: [`multi-profile-design.md`](multi-profile-design.md)。アーティファクト解決ルール: [`../common/multi-profile-artifact-resolution.md`](../common/multi-profile-artifact-resolution.md)。

### ウィザードステップ

ウィザードは**1回に1質問**のみ — 全質問を一度に提示しません。既存のプロファイル値は表示され、Enter で維持可能。

| # | ステップ | 内容 |
|---|---------|------|
| **0** | **レガシー検出 & プロファイルブートストラップ** | 他の質問の **前** に実行。`sap-profile-cli.mjs detect-legacy` を呼び出す。0.6.0 以前の `<project>/.sc4sap/sap.env` が見つかれば → マイグレーションフローにルーティング (`alias` + `tier` 確認 → `sap-profile-cli.mjs migrate` → `sap.env.legacy` へアーカイブ → プロジェクト `config.json` 削除 → `active-profile.txt` で新プロファイルを指示 → Step 5 から再開)。レガシーもプロファイルも無い場合 → 新規インストールとして Step 1 へ進む。プロファイルが既に存在する場合 → スイッチ vs 新規追加を選択 |
| 1 | **バージョンチェック** | Claude Code バージョン互換性検証 |
| 2 | **SAP バージョン + 業界** | `S4` / `ECC` 選択、ABAP リリース入力、15 業界メニューから選択。SPRO テーブル / BAPI / TCode + ABAP 構文ゲーティング + 業界固有構成パターンを駆動 |
| 3 | **MCP サーバーインストール** | `abap-mcp-adt-powerup` を `<PLUGIN_ROOT>/vendor/abap-mcp-adt/` にクローン+ビルド。既にインストール済の場合スキップ (`--update` で更新) |
| **4** | **プロファイル作成 + SAP 接続** | `alias` (`^[A-Z0-9_-]+$`、規約は `{ISO-COUNTRY}-{TIER}` 例: `KR-DEV`)、`SAP_TIER` (`DEV`/`QA`/`PRD`)、オプショナルな同一企業メタコピー、その後接続フィールド (`SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE`) を 1 項目ずつ収集。書き込みは `sap-profile-cli.mjs add` に委譲 → プロファイル env を `~/.sc4sap/profiles/<alias>/` に、パスワードを OS キーチェーンに、ポインター `<project>/.sc4sap/active-profile.txt=<alias>` を記録。`<project>/.sc4sap/sap.env` と `<project>/.sc4sap/config.json` は **一切作成されません** |
| 4bis | **RFC バックエンド選択** | `soap` / `native` / `gateway` / `odata` / `zrfc` から選択。すべての `SAP_RFC_*` キーはアクティブプロファイル env に記録。[RFC バックエンド](FEATURES.ja.md#-rfc-バックエンド選択) 参照 |
| 5 | **MCP 再接続** | `/mcp` を実行。サーバーの `ReloadProfile` ツールがポインター + プロファイル env (キーチェーン解決込み) を読み、キャッシュされた接続を更新 — Claude Code の再起動は不要 |
| 6 | **接続テスト** | SAP に対する `GetSession` ラウンドトリップ |
| 7 | **システム情報確認** | システム ID、クライアント、ユーザー、言語を表示。`~/.sc4sap/profiles/<alias>/config.json → systemInfo` に保存 (プロジェクトフォルダーではない) |
| 8 | **ADT 権限チェック** | `GetInactiveObjects` で ADT 権限検証 |
| **9** | **ABAP ユーティリティ作成 (tier ゲート)** | **DEV のみインストール可能。** `ZMCP_ADT_UTILS` FG + `ZIF_S4SAP_CM` / `ZCL_S4SAP_CM_*` ALV OOP ハンドラ (+ 4bis で OData / ZRFC 選択時は関連クラス) を作成。システム dedup キーは `SAP_URL + SAP_CLIENT` — 同一システムの sibling DEV プロファイルが既にインストール済なら再利用。**QA / PRD** ではインストールを **拒否** し CTS インポートガイドを出力 — 対応する DEV システムでインストールし標準 TMS ルートで転送 |
| 10 | **プロファイル `config.json` 最終化** | `sapVersion`, `abapRelease`, `industry`, `activeModules`, `namingConvention`, `blocklistProfile`, `activeTransport` を `~/.sc4sap/profiles/<alias>/config.json` に記録。プロジェクト `.sc4sap/` にはマルチプロファイルモードで `config.json` が **存在しない** |
| 11 | **SPRO 抽出 (任意)** | `y/N` — トークン消費は大きいが `<project>/.sc4sap/work/<alias>/spro-config.json` キャッシュで以後のトークン使用量を大幅削減 |
| 11b | **カスタマイズインベントリ (任意)** | `y/N` — `Z*`/`Y*` 拡張 + アペンド構造をスキャン。`<project>/.sc4sap/work/<alias>/customizations/{MODULE}/{enhancements,extensions}.json` に保存 |
| **12** | **🔒 PreToolUse フック (必須)** | `.claude/settings.json` に `block-forbidden-tables.mjs` (行抽出ガード) **および** `tier-readonly-guard.mjs` (tier ベースの変更ガード) の **両方** をインストール (`node scripts/install-hooks.mjs --project`)。両方のスモークテストを実行。どちらか失敗すればセットアップ未完了 |
| 13 | **HUD ステータスライン** | `~/.claude/settings.json` に sc4sap ステータスラインを登録。再起動後、HUD が `{alias} [{tier}] {🔒 if readonly}` + トークン使用量を表示 |

> **多層防御 — 3 つの enforcement レイヤー**
> - **L1a (Step 12、行抽出)** — Claude Code `PreToolUse` フック。プロファイルは `~/.sc4sap/profiles/<alias>/config.json → blocklistProfile`。機密テーブルの `GetTableContents` / `GetSqlQuery` を拒否
> - **L1b (Step 12、tier)** — Claude Code `PreToolUse` フック。呼び出しごとにアクティブプロファイルの `SAP_TIER` を再読込 (stateless)。QA/PRD の変更を拒否
> - **L2 (MCP サーバー、バイパス不可)** — `abap-mcp-adt-powerup` 内部ガード。行抽出は `sap.env → MCP_BLOCKLIST_PROFILE`; tier は `ReloadProfile` 時点で設定された `@readonly(tier)` デコレータ。フックが欠けても誤設定でも発動
>
> L1 フックは IO/parse エラー時に OPEN fail; L2 MCP ガードは常に有効。推奨デフォルト: L1a `strict`、MCP サーバーブロックリスト `standard`。

## セットアップ後

### プロファイル操作

- アクティブシステム切替: `/sc4sap:sap-option switch <alias>` (またはインタラクティブピッカー — `AskUserQuestion` で tier + 許可ツールマトリクスをプレビュー)
- 別会社 / tier 追加: `/sc4sap:sap-option add` (ウィザード: alias → tier → オプショナル同一企業メタコピー → 接続 + キーチェーンパスワード取得)
- プロファイル一覧: `/sc4sap:sap-option list` — alias、tier バッジ、ホスト、アクティブ プロファイルの `●` マーカー
- 削除 / ローテーション / パージ: `/sc4sap:sap-option remove|edit|purge` — ソフト削除は `~/.sc4sap/profiles/.trash/<alias>-<ts>/` へ 7 日自動パージ
- Tier は既存プロファイル上で不変 — 変更するには remove + add

### ヘルス & メンテナンス

- ヘルスチェック: `/sc4sap:sap-doctor`
- 認証情報ローテーション / 業界変更 / L2 MCP ブロックリスト調整: `/sc4sap:sap-option`
- SPRO 再抽出: `/sc4sap:setup spro` (アクティブプロファイル必須)
- カスタマイズインベントリ再実行: `/sc4sap:setup customizations` (アクティブプロファイル必須)

### マイグレーションのロールバック (0.6.0 アップグレードを元に戻す)

```bash
mv .sc4sap/sap.env.legacy .sc4sap/sap.env
rm .sc4sap/active-profile.txt
rm -rf ~/.sc4sap/profiles/<alias>
# パスワードをキーチェーンに保存した場合 (plaintext fallback ではない):
echo '{"service":"sc4sap","account":"<alias>/<user>"}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/sap-profile-cli.mjs" keychain-delete
```

---

関連: [機能詳細 →](FEATURES.ja.md) · [変更履歴 →](CHANGELOG.ja.md)
