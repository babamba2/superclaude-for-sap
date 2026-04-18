<p align="center">
  <img src="sc4sap.png" alt="SuperClaude for SAP" width="720"/>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ko.md">한국어</a> | 日本語 | <a href="README.de.md">Deutsch</a>
</p>

# SuperClaude for SAP (sc4sap)

> SAP ABAP 開発向け Claude Code プラグイン — SAP ECC / S/4HANA On-Premise / S/4HANA Cloud (Public & Private) 対応

[![MCP server on npm](https://img.shields.io/npm/v/@babamba2/abap-mcp-adt-powerup?label=mcp-server&color=cb3837&logo=npm)](https://www.npmjs.com/package/@babamba2/abap-mcp-adt-powerup)
[![Plugin version](https://img.shields.io/badge/sc4sap-v0.2.4-6B4FBB)](https://github.com/babamba2/superclaude-for-sap/releases)
[![GitHub stars](https://img.shields.io/github/stars/babamba2/superclaude-for-sap?style=flat&color=yellow)](https://github.com/babamba2/superclaude-for-sap)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## sc4sap とは

SuperClaude for SAP は Claude Code をフルスタック SAP 開発アシスタントに変換します。[MCP ABAP ADT サーバー](https://github.com/babamba2/abap-mcp-adt-powerup)(150+ ツール)経由で SAP システムに接続し、クラス・関数モジュール・レポート・CDS ビュー・Dynpro・GUI ステータスなどの ABAP オブジェクトを直接作成・読み取り・更新・削除します。

## 主要機能

| 機能 | 説明 |
|------|------|
| 🔌 **MCP 自動インストール** | `/sc4sap:setup` 中に `abap-mcp-adt-powerup` を自動インストール・設定・接続テスト。手動 MCP 配線不要。 |
| 🏗️ **自動プログラムメーカー** | ABAP プログラムのエンドツーエンド生成:Main + 条件付き Include、OOP/Procedural、フル ALV + Docking、Dynpro + GUI ステータス、必須 Text Elements、ABAP Unit — プラットフォーム対応(ECC / S4 On-Prem / Cloud)。 |
| 🔍 **プログラム解析** | MCP で ABAP オブジェクトを読み取り → Clean ABAP / パフォーマンス / セキュリティレビュー、または機能/技術仕様へのリバースエンジニアリング(Markdown/Excel)。 |
| 🧪 **コード解析** | `/sc4sap:analyze-code` — `sap-code-reviewer` 専用の静的レビュー:Clean ABAP / パフォーマンス / セキュリティ / SAP 標準準拠。重大度順の指摘と具体的な修正提案。 |
| 🔀 **プログラム比較** | `/sc4sap:compare-programs` — 同一の業務シナリオを共有しつつモジュール(MM/CO)・国(KR/EU)・ペルソナ(コントローラー/倉庫)で分岐した 2〜5 本の ABAP プログラムをコンサルタント視点で 10 次元比較 → Markdown レポート。 |
| 🩺 **運用診断** | 運用トリアージ:ST22 ダンプ、SM02、/IWFND/ERROR_LOG、プロファイラトレース、ログ、where-used — すべて Claude から。 |
| ♻️ **CBO 再利用** | Z パッケージを一度棚卸し → `create-program` / `program-to-spec` が既存 CBO 資産を優先再利用。ブラウンフィールドに必須。 |
| 🧷 **CBO 拡張認識 (CMOD / GGB1·2 / BAdI / APPEND)** | ユーザーエグジット (CMOD)、置換/検証 (GGB1/GGB2)、BAdI 実装、APPEND ストラクチャを棚卸し。`create-program` / BAPI 呼び出しでは既存の拡張フィールド(例:BAPI `EXTENSIONIN` / テーブル append)を新規 CBO より優先;ダンプ・障害対応では拡張ポイントを第一容疑者として検査。 |
| 🏭 **業界コンテキスト** | 14 業界リファレンス (retail, fashion, cosmetics, tire, automotive, pharma, F&B, chemical, electronics, construction, steel, utilities, banking, public-sector)。 |
| 🌏 **国別ローカライゼーション** | 15 カ国 + EU 共通 (KR/JP/CN/US/DE/GB/FR/IT/ES/NL/BR/MX/IN/AU/SG)。適格請求書、銀行、給与、税制。 |
| 🧩 **アクティブモジュール認識** | クロスモジュール統合ヒント:MM + PS 有効 → MM CBO に WBS フィールド自動提案;SD + CO 有効 → CO-PA 派生。[詳細 →](common/active-modules.md) |
| 🤝 **モジュールコンサルテーション** | `sap-analyst` / `sap-critic` / `sap-planner` / `sap-architect` がビジネス判断が必要な場合、14 モジュールコンサルタント + 1 BC コンサルタントに委任。 |

## ドキュメント

- 📦 **[インストール & セットアップ →](docs/INSTALLATION.ja.md)** — 要件、インストールオプション、ウィザードステップ、ブロックリスト設定
- 🎯 **[機能詳細 →](docs/FEATURES.ja.md)** — 25 エージェント、18 スキル、MCP ツール、RFC バックエンド、フック、データ抽出ポリシー
- 📜 **[変更履歴 →](docs/CHANGELOG.ja.md)** — バージョン履歴と破壊的変更


<p align="center">
  <img src="sc4sap_unleashed.png" alt="SC4SAP Unleashed" width="720"/>
</p>


## 作者

- **paek seunghyun** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/seunghyun-paek-5b83b7183/)

## コントリビューター

- **김시훈 (Kim Sihun)** &nbsp; [![LinkedIn](https://img.shields.io/badge/-LinkedIn-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/sihun-kim-27737132b/)

## 謝辞

このプロジェクトは **허예찬 (Hur Ye-chan)** 氏の [**oh-my-claudecode**](https://github.com/huryechan/oh-my-claudecode) から着想を得ています。マルチエージェントオーケストレーションパターン、Socratic ディープインタビューゲーティング、永続ループの概念、プラグイン哲学全般はすべてその作業に遡ります。

**fr0ster** 氏の [**mcp-abap-adt**](https://github.com/fr0ster/mcp-abap-adt) は、私たちがカスタマイズした MCP サーバー(`abap-mcp-adt-powerup`)を構築する上で大きな貢献をしました。先駆的な ADT-over-MCP の取り組み — リクエスト形成、エンドポイントカバレッジ、オブジェクト I/O — は、自社サーバーの設計・拡張時に依拠した概念的基盤となりました。

## ライセンス

[MIT](LICENSE)
