# 変更履歴

← [README に戻る](../README.ja.md) · [インストール](INSTALLATION.ja.md) · [機能](FEATURES.ja.md)

sc4sap のすべての注目すべき変更をここに記録しています。完全なリリースノートは [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases) を参照。

本プロジェクトは [Semantic Versioning](https://semver.org/) および [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 形式に従います。

---

## [未リリース]

_未リリース変更なし。_

---

## [0.6.1] - 2026-04-21

### 追加
- **`/sc4sap:setup` マルチプロファイル認識** — ウィザードに Step 0 (レガシー検出 + プロファイルブートストラップ) と専用プロファイル作成フロー (`skills/setup/wizard-step-04-profile-creation.md`) を追加。0.6.0 以前の `<project>/.sc4sap/sap.env` ユーザーは `sap-profile-cli.mjs migrate` で自動マイグレーション; 新規インストールは `~/.sc4sap/profiles/<alias>/` に最初のプロファイルを OS キーチェーンバックの認証情報付きで作成。
- **Tier ゲート Step 9** — ABAP ユーティリティインストール (`ZMCP_ADT_UTILS`, `ZCL_S4SAP_CM_*`, OData/ZRFC クラス) は `SAP_TIER=DEV` でのみ実行。QA/PRD プロファイルはインストール拒否 + CTS インポートガイド出力; DEV インストールは `SAP_URL+SAP_CLIENT` で sibling プロファイル間 dedup (`~/.sc4sap/profiles/<alias>/.abap-utils-installed` sentinel)。
- **Step 12 PreToolUse ダブルフック** — `.claude/settings.json` (プロジェクトレベル) に `block-forbidden-tables.mjs` と `tier-readonly-guard.mjs` の **両方** をインストール、各々のスモークテスト実施。
- **共有プロファイル resolver** (`scripts/lib/profile-resolve.mjs`) — `resolveSapEnvPath`, `resolveConfigJsonPath`, `resolveArtifactBase`, `readActiveSapEnv`, `readActiveConfigJson`, `readDotenv`, `normalizeTier`。HUD / フック / スクリプトが使用する active-profile → `~/.sc4sap/profiles/<alias>/` 解決パターンを一元化。
- **Gap-plan ドキュメント** (`docs/multi-profile-setup-gap.md`) — `multi-profile-design.md` + `-implementation-plan.md` の姉妹ドキュメント; setup スキル改修のための 5 決定を記録。
- **アクティブモジュール認識** (`common/active-modules.md`) — クロスモジュール統合マトリックス。`SAP_ACTIVE_MODULES` 環境変数 + `config.json` の `activeModules` が `create-program`, `create-object`, `analyze-cbo-obj`, コンサルタントエージェントで統合フィールド提案を駆動。例: MM オブジェクト + PS 有効 → WBS フィールド (`PS_POSID` / `AUFNR`) 自動提案。
- **Fix #3 `handleUpdateDomain.ts`** — ハンドラプロパティ名を `AdtDomain.update()` の snake_case 期待値と一致 (`value_table`, `fixed_values`, `conversion_exit`, `sign_exists`)。以前は silent drop。
- **Fix #4 `core/domain/update.ts`** (mcp-abap-adt-clients) — `<doma:valueTableRef>` 自己閉じケース用に `patchXmlElementAttribute` → `patchXmlBlock`。`adtcore:uri` + `adtcore:type` + `adtcore:name` の完全な属性を生成。

### 変更
- **マルチプロファイルモードのアーティファクトパス** — `extract-spro.mjs`, `extract-customizations.mjs`, 消費スキルが `<project>/.sc4sap/` 直下ではなく `<project>/.sc4sap/work/<activeAlias>/` に書き込み (`common/multi-profile-artifact-resolution.md` 準拠)。レガシー (`active-profile.txt` 無) フォールバック維持。
- **`rfc-backend-selection.md`** — `soap` / `native` / `gateway` / `odata` / `zrfc` バックエンドのすべての `SAP_RFC_*` env キーはアクティブプロファイル env (`~/.sc4sap/profiles/<alias>/sap.env`) に書き込み、プロジェクトフォルダーには決して書き込まない。`odata` / `zrfc` bootstrap 順序ノートは維持。
- **`handleCreateTable.ts`** — Create 直後に MANDT ベースの transparent table スケルトン (`key mandt : mandt not null`) を自動注入。SAP バックエンドのデフォルト CDS スタイル `key client : abap.clnt` を置換。初回ユーザーは UpdateTable で `ExceptionResourceAlreadyExists` に遭遇しなくなる。
- **`handleUpdateTable.ts`** — `ddl_code` スキーマ description に MANDT 例 + annotation 保持ガイド追加。

### 修正
- **`sap-profile-cli.mjs list`/`show` パスワード漏洩** — プロファイル env が plaintext fallback 状態 (キーチェーン利用不可) のとき `passwordRef` フィールドが生のパスワードを出力していた。現在は non-keychain 値に対して `"plaintext (masked)"` リテラルを返す; `keychain:…` 参照はそのまま通過。
- **マイグレーション後の HUD ENV ステータス** — `sc4sap-status.mjs::sapEnvPresent / readConfig / activeTransport / systemInfo / sproCacheAge` がすべて `<project>/.sc4sap/…` のみ参照していたため、マルチプロファイルマイグレーション後に機能しなかった。現在はアクティブプロファイルポインター優先解決、レガシーフォールバック維持。
- **`block-forbidden-tables.mjs` プロファイル不一致** — アクティブプロファイルの `config.json` が別の値でも、フックがデフォルト `standard` を報告していた (レガシープロジェクト `config.json` のみ読んでいたが、マイグレーションで削除済)。現在はアクティブプロファイルの config を読む。
- **`code-simplifier.mjs`** と **`sap-option-tui.mjs`** — それぞれ Stop フックと standalone TUI がレガシープロジェクトパスのみ読んでいたのを、共有プロファイルヘルパー経由で解決するよう修正。

### ドキュメント
- **`INSTALLATION.md` / `.ko.md` / `.ja.md` / `.de.md`** — 4 言語すべてを 0.6.0 マルチプロファイル setup 向けに書き換え。「マルチプロファイルアーキテクチャ」セクション追加、ウィザード表を 12 → 14 ステップ (新 Step 0 + Step 13 HUD) に拡張、3 層防御 (L1a 行抽出フック + L1b tier フック + L2 MCP サーバーガード) を明文化、セットアップ後のプロファイル管理 + ロールバックレシピ追加。
- README 分割 — メインページをスリム化 (コア機能 + 作者 + コントリビューター)。インストール / 詳細機能 / 履歴を `docs/INSTALLATION.md` / `docs/FEATURES.md` / `docs/CHANGELOG.md` (本ファイル) に移動。

---

## リリース履歴

以前のリリースは [Git タグ履歴](https://github.com/babamba2/superclaude-for-sap/tags) および [GitHub Releases](https://github.com/babamba2/superclaude-for-sap/releases) を参照。

### バージョン体系

sc4sap は `v{MAJOR}.{MINOR}.{PATCH}` 形式:
- **MAJOR** — スキル API、設定スキーマ、最小 SAP/Claude Code バージョンへの破壊的変更
- **MINOR** — 新しいスキル、新しいエージェント、新しい common 規則、後方互換の機能追加
- **PATCH** — バグ修正、ドキュメントのみの変更、非破壊的リファクタリング

### 互換性

- **Claude Code**: >= 2.x
- **Node.js**: >= 20.0.0
- **SAP**: ECC 6.0 / S/4HANA On-Premise / S/4HANA Cloud (Public & Private)
- **MCP サーバー**: バンドルされた `abap-mcp-adt-powerup` (`/sc4sap:setup` が自動インストール、リリースごとにバージョン固定)

---

← [README に戻る](../README.ja.md)
