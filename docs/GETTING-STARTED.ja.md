# sc4sap はじめに(初めて使う方向け)

← [README に戻る](../README.ja.md) · [English](GETTING-STARTED.md) · [한국어](GETTING-STARTED.ko.md) · [Deutsch](GETTING-STARTED.de.md) · セットアップの詳細: [インストール & セットアップ](INSTALLATION.ja.md)

Claude Code を一度も使ったことがない方向けのステップバイステップガイドです。上から順に進めてください。

> **Windows · 約 30〜40 分**

## ステップ

- [ ] [0. 始める前に](#0-始める前に)
- **SAP サーバーの準備(Basis)**
  - [ ] [B1. Web ポートを開く(最初に)](#b1-web-ポートを開く最初に)
  - [ ] [B2. ICF サービスを有効化する](#b2-icf-サービスを有効化する)
  - [ ] [B3. ユーザー権限](#b3-ユーザー権限)
  - [ ] [B4. システムとユーザーの設定](#b4-システムとユーザーの設定)
- **お使いの PC**
- [ ] [1. PowerShell スクリプトを許可する](#1-powershell-スクリプトを許可する)
- [ ] [2. Git をインストールする](#2-git-をインストールする)
- [ ] [3. Node.js をインストールする](#3-nodejs-をインストールする)
- [ ] [4. Claude Code をインストールする](#4-claude-code-をインストールする)
- [ ] [5. サインインする](#5-サインインする)
- [ ] [6. 作業フォルダーを作る](#6-作業フォルダーを作る)
- [ ] [7. sc4sap プラグインをインストールする](#7-sc4sap-プラグインをインストールする)
- [ ] [8. SAP に接続する](#8-sap-に接続する)
- [ ] [B5. Gateway サービスを登録する](#b5-gateway-サービスを登録する)
- [ ] [B6. プロファイルを確認する](#b6-プロファイルを確認する)
- [ ] [9. 動作を確認する](#9-動作を確認する)
- [ ] [B7. 接続チェック(詳細)](#b7-接続チェック詳細)
- [トラブルシューティング](#トラブルシューティング) · [アップデート](#アップデート)

---

## 0. 始める前に

次のものを用意してください。

| 項目 | 内容 |
|---|---|
| PC | Windows 10 / 11。管理者権限があると進めやすいです。 |
| Claude のプラン | Claude Pro または Max。会社の Team / Enterprise アカウントでも使えます。API キーでも使えます。 |
| SAP システム | ECC 6.0 または S/4HANA On-Premise。ADT が有効であること。 |
| SAP ログオン情報 | サーバー URL、クライアント、ユーザー ID、パスワード、言語。 |
| インターネット | github.com、npmjs.org、claude.ai にアクセスできること。社内ネットワークでブロックされている場合は IT 部門に相談してください。 |

<details>
<summary>SAP の URL が分からない場合</summary>

Eclipse ADT で使うアドレスと同じものです。通常は `https://servername:44300` のような形式です。Basis チームに「ADT URL」を確認してください。
</details>

<details>
<summary>ADT が有効かどうかの確認方法</summary>

SAP GUI で `SICF` を実行します。サービス `/sap/bc/adt` が有効になっている必要があります。権限がない場合は Basis チームに依頼してください。
</details>

> **社内の SAP サーバーに初めて接続しますか?** 先に Basis チームに [B1–B4](#b1-web-ポートを開く最初に) を依頼してください。**B1 の Web ポート**が開いていないと、ほかのテストは何もできません。インストールは DEV サーバーに一度だけ行います。QA と PRD にはトランスポートでオブジェクトを配布します。

✅ すべての準備が整いました。

---

## B1. Web ポートを開く(最初に)

**[Basis]** sc4sap は SAP サーバーの **Web(HTTP/HTTPS)ポート**に接続します。SAP GUI のポート(32xx)や RFC ポート(33xx)は使いません。このポートが閉じている間は、B2 以降は何もテストできません。

### ポート番号

SAP のポートは、通常 **プレフィックス + インスタンス番号**です。例はインスタンス `00` の場合です。

| 用途 | ルール | 例(インスタンス 00) |
|---|---|---|
| SAP GUI | 32 + 番号 | 3200 |
| RFC | 33 + 番号 | 3300 |
| **Web HTTP(sc4sap が使用)** | **80 + 番号** | **8000** |
| Web HTTPS(sc4sap が使用) | 443 + 番号 | 44300 |

サーバーによっては別の番号を使っています。実際の番号は、下の手順 1 で確認できます。

### 手順

| 手順 | 担当 | 内容 | 確認 |
|---|---|---|---|
| 1 | Basis | サーバーに Web ポートがあるか確認する: `SMICM` → Goto → Services | ポート番号付きの有効な HTTP(または HTTPS)の行があること。 |
| 2 | Basis | なければ追加する: `RZ10` で `icm/server_port_<n>` = `PROT=HTTP,PORT=8000` を設定 → ICM を再起動 | 手順 1 に新しい行が表示されること。 |
| 3 | Basis · ネットワークチーム | ファイアウォールで、開発者の PC → サーバー IP と Web ポートを許可する。 | — |
| 4 | 開発者 | PC からテストする(下のコマンド)。 | `TcpTestSucceeded : True` |

```powershell
Test-NetConnection sapdev.example.com -Port 8000
```

> **Basis への依頼内容:** 「SAP サーバーの Web ポート(80 + インスタンス番号、または HTTPS 443 + インスタンス番号)を、開発者の PC から到達できるようにしてください。」

### Web ポートを開けられない場合: RFC(NCo)

Web ポートの代わりに、開発者の PC にある SAP .NET Connector(NCo)を使い、**RFC ポート(33 + インスタンス番号)**経由で sc4sap を接続できます。

| 項目 | Web ポート | NCo |
|---|---|---|
| ポート | Web 80NN / 443NN | RFC 33NN |
| ICF ノード(B2) | 必要 | 不要 |
| Gateway サービス登録(B5) | 必要 | 不要 |
| `S_SERVICE` | 必要 | 不要 |
| `S_ADT_RES` | 必要 | **こちらも必要**(ADT は RFC でもこれを確認します) |
| `S_RFC` | ADT + Z 関数モジュール | 同じ + `SADT_REST`(RFC 経由の ADT) |
| Z 関数のインストールとトランスポート | DEV にインストール → QA へトランスポート | 同じ |
| 開発者の PC | どれでも可 | NCo をインストールした Windows |

> **NCo は各ユーザーが自分の PC にインストールします。** NCo(SAP Connector for Microsoft .NET 3.1)は SAP のライセンス製品のため、sc4sap には同梱できません。ソフトウェアをダウンロードできる S-user で、SAP Support Portal(Software Downloads)から入手してください。S-user がない場合は、Basis チームにインストーラーを依頼してください。SAP GUI と一緒に最初から入っている PC もあります。

| その他の制限 | 内容 |
|---|---|
| Windows のみ | Mac と Linux は不可です。それらの PC は Web ポートを使います。 |
| サーバー直接接続のみ | アプリケーションサーバー + インスタンス番号のみです。メッセージサーバー(ログオングループ)、SAProuter、SNC は使えません。 |
| 暗号化 | SNC がない場合、RFC の通信は暗号化されません。社内ネットワーク内でのみ使い、Basis に確認してください。 |
| Z 関数のバージョン | `ZMCP_ADT_DISPATCH` には NCo 用の関数(`FM_PROXY`)が必要です。現在のソースには含まれています。 |
| 権限は同じ | `S_ADT_RES` と、参照 / 開発の権限は変わりません。不要になるのは ICF、Gateway、`S_SERVICE` だけです。 |

---

## B2. ICF サービスを有効化する

**[Basis]** トランザクション `SICF` で、次のノードを有効化します。親ノードが無効だと、子ノードは動作しません。

| ノード | 必須 | 用途 |
|---|---|---|
| `/default_host/sap`, `/default_host/sap/bc` | はい | 親ノード |
| `/default_host/sap/bc/adt` | はい | ADT パス(すべての読み取りと書き込み)。CSRF トークンは `/sap/bc/adt/core/discovery` から取得します。 |
| `/default_host/sap/opu/odata` | はい | OData パス(画面、GUI ステータス、テキストプール、ダンプ) |

---

## B3. ユーザー権限

**[Basis]** SAP 標準ロール `SAP_BC_DWB_ABAPDEVELOPER` のコピーから始め、下の権限を追加します。システムごとに違いがあるため、Basis に確認してもらってください。

### 基本権限(全ユーザー)

| オブジェクト | 項目と値 | 用途 | 書き込みユーザー | 参照専用ユーザー |
|---|---|---|---|---|
| `S_ADT_RES` | `URI` = `/sap/bc/adt/*` | ADT アクセス | はい | はい |
| `S_RFC` | `RFC_TYPE` = FUGR, `RFC_NAME` = `SADT*`, `SDTX`, `SYST`, `RFC1`, `ACTVT` = 16 | ADT 内部の RFC | はい | はい |
| `S_RFC`(追加) | `RFC_NAME` = `ZMCP_ADT_UTILS` | ディスパッチャー、テキストプール、DDIC 関数モジュール | はい | はい |
| `S_SERVICE` | サービス `ZMCP_ADT_SRV` | OData パス | はい | はい |
| `S_DEVELOP` | `DEVCLASS` = `$TMP`, `Z*`, `Y*` · `OBJTYPE` = PROG, CLAS, INTF, FUGR, DEVC, … · `OBJNAME` = `Z*`, `Y*` · `ACTVT` = 01, 02, 03, 06, 07, 16 | 01 作成 · 02 変更 · 03 表示 · 06 削除 · 07 有効化 · 16 実行 | すべて | 03 のみ |
| `S_TRANSPRT` | `TTYPE` = DTRA, TASK · `ACTVT` = 01, 02, 03 | トランスポートの表示、作成、割り当て | すべて | 03 のみ |
| `S_TABU_DIS`, `S_TABU_NAM` | 読み取るテーブルグループ / テーブル名, `ACTVT` = 03 | テーブルの読み取り | はい | はい |
| ST22 の表示 | — | ダンプ一覧 | 任意 | 任意 |

### Gateway 登録(開発者 1 名)

開発者が Gateway サービス(B5)を自分で登録する場合のみ必要です。標準の開発者ロールには含まれていません。登録はサーバーにつき一度だけなので、1 人いれば十分です。

| オブジェクト | 項目と値 | 用途 |
|---|---|---|
| `S_TCODE` | `/IWBEP/REG_SERVICE`, `/IWFND/MAINT_SERVICE`, `/IWFND/CACHE_CLEANUP`, `/IWFND/ERROR_LOG`, `SEGW`, `SICF` | 登録、キャッシュのクリア、エラーログ |
| `/IWBEP/SB` | プロジェクト `ZMCP_ADT`(または `Z*`)、すべてのアクティビティ | SEGW 経由の登録(代替手段) |
| `S_DEVELOP`(追加) | `OBJTYPE` = Gateway リポジトリオブジェクト(サービス、モデル、サービスグループ、…) · `OBJNAME` = `ZMCP_ADT*` · `ACTVT` = 01, 02, 03 | Gateway カタログのエントリ |
| `S_ICF_ADM` | ノード `ZMCP_ADT_SRV` | ICF ノードの有効化 |
| `S_TRANSPRT` | `ACTVT` = 01, 02 | トランスポート可能なパッケージに登録する場合のみ |

---

## B4. システムとユーザーの設定

**[Basis]**

| 項目 | 必要なこと | 満たさない場合 |
|---|---|---|
| 開発者キー | ユーザーに登録されていること | Z オブジェクトの書き込みが失敗する |
| システム変更オプション | 顧客ネームスペース(Z/Y)とローカルオブジェクトが変更可能であること | 書き込みが失敗する |
| クライアント設定 | リポジトリとクライアント共通オブジェクトの変更が許可されていること | 書き込みが失敗する |
| ユーザータイプ | ダイアログまたはサービスユーザー | ログオンが失敗する |
| パスワード | 初期パスワードではないこと(SAP GUI で一度ログオンして変更する) | HTTP ログオンが失敗する |

---

## 1. PowerShell スクリプトを許可する

Windows は、既定で PowerShell スクリプトをブロックします。許可しないと、Claude Code のインストーラーや `claude`、`npm` コマンドがエラーで止まります。

**① PowerShell を開く**

1. <kbd>Win</kbd> キーを押して「PowerShell」と入力します。
2. **Windows PowerShell** をクリックします。
3. 管理者権限が必要な場合は、右クリックして **管理者として実行** を選びます。

**② 現在の設定を確認する**

```powershell
Get-ExecutionPolicy -List
```

`CurrentUser` と `LocalMachine` の両方が `Undefined` または `Restricted` の場合、スクリプトはブロックされています。

**③ スクリプトを許可する — どちらか一つを実行します**

オプション A — 自分のアカウントのみ(管理者権限は不要、推奨)

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

オプション B — PC 全体(管理者として開いた PowerShell で)

```powershell
Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned
```

確認を求められたら <kbd>Y</kbd>(または <kbd>A</kbd>)を入力して <kbd>Enter</kbd> を押します。

**④ もう一度確認する**

```powershell
Get-ExecutionPolicy
```

`RemoteSigned` と表示されるはずです。

<details>
<summary>RemoteSigned とは?</summary>

自分の PC で作ったスクリプトは実行できます。インターネットからダウンロードしたスクリプトは、署名がある場合のみ実行できます。開発者の PC でよく使われる設定です。
</details>

<details>
<summary>「overridden by a policy defined at a more specific scope」と表示される</summary>

会社のグループポリシーで設定されているため、自分では変更できません。IT 部門に、PowerShell の実行ポリシーを RemoteSigned にするよう依頼してください。
</details>

✅ 実行ポリシーが `RemoteSigned` になりました。

---

## 2. Git をインストールする

Claude Code と sc4sap は、内部で Git を使います。Windows では必須です。

1. [git-scm.com/download/win](https://git-scm.com/download/win) からインストーラーをダウンロードします。
2. すべて既定のままにして **Next** をクリックします。
3. 完了したら、**新しい PowerShell ウィンドウ**を開いて確認します。

```powershell
git --version
```

`git version 2.xx.x` のように表示されるはずです。

✅ Git をインストールしました。

---

## 3. Node.js をインストールする

sc4sap の SAP 接続サーバー(MCP)は Node.js 上で動きます。**バージョン 20 以降**が必要です。

1. [nodejs.org](https://nodejs.org) から **LTS** 版をダウンロードします。
2. 既定のままにします。
3. 開いている PowerShell ウィンドウを閉じ、新しく開いて確認します。

```powershell
node --version
npm --version
```

`v20` 以降(例: `v22.11.0`)と表示されるはずです。

✅ Node.js をインストールしました。

---

## 4. Claude Code をインストールする

Claude Code は、ターミナルで使う Claude です。sc4sap はその上で動くプラグインです。

オプション A — 公式のインストールスクリプト(推奨)

```powershell
irm https://claude.ai/install.ps1 | iex
```

オプション B — npm(社内ネットワークでオプション A がブロックされる場合)

```powershell
npm install -g @anthropic-ai/claude-code
```

PowerShell を閉じ、新しいウィンドウを開いて確認します。

```powershell
claude --version
```

バージョン番号が表示されるはずです。

<details>
<summary>「claude is not recognized」と表示される</summary>

新しい PowerShell ウィンドウを開いてください。それでも失敗する場合は、PC を再起動してください。
</details>

✅ Claude Code をインストールしました。

---

## 5. サインインする

初回の起動時に、サインイン画面が表示されます。

```powershell
claude
```

1. 矢印キーでカラーテーマを選び、<kbd>Enter</kbd> を押します。
2. **Claude account with subscription** を選びます。API キーを使う場合は **Anthropic Console** を選びます。
3. ブラウザーが開きます。Claude アカウントでサインインし、承認します。
4. ターミナルに戻ると、プロンプト(`>`)が表示されます。

> **確認** — `hello` と入力します。Claude が返事をすれば、サインインできています。
>
> **終了するには** — `/exit` と入力するか、<kbd>Ctrl</kbd> + <kbd>C</kbd> を 2 回押します。

✅ サインインしました。

---

## 6. 作業フォルダーを作る

sc4sap は、起動したフォルダーに作業ファイルを保存します。そのためのフォルダーを作ります。

```powershell
mkdir $HOME\Documents\sap-work
cd $HOME\Documents\sap-work
claude
```

> **今後は、必ずこの手順で起動してください** — PowerShell を開き、`cd $HOME\Documents\sap-work`、続けて `claude` を実行します。

<details>
<summary>フォルダーを信頼するか聞かれた場合</summary>

**Yes, proceed** を選びます。ご自身の作業フォルダーです。
</details>

✅ 作業フォルダーで Claude Code が開きました。

---

## 7. sc4sap プラグインをインストールする

> ⚠️ ここからは、PowerShell ではなく **Claude Code のプロンプト(`>`)**に入力します。

**① マーケットプレイスを追加する**

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
```

**② プラグインをインストールする**

```
/plugin install sc4sap
```

スコープを聞かれたら、**User**(どのフォルダーでも使える)が最も簡単です。

**③ Claude Code を再起動する**

1. `/exit` で終了します。
2. 同じフォルダーで、もう一度 `claude` を実行します。

> **確認** — `/sc4sap` だけを入力します。`/sc4sap:setup` などの一覧が表示されれば成功です。

✅ プラグインをインストールしました。

---

## 8. SAP に接続する

セットアップウィザードが、1 問ずつ質問します。

```
/sc4sap:setup
```

**ウィザードの流れ**

```
SAP version · industry → MCP server installed automatically → logon details → connection test → safety hooks → done
```

**よくある質問**

| 質問 | 答え |
|---|---|
| SAP version | `S4` または `ECC`。ABAP リリースは SAP GUI の **System → Status** にあります(例: `757`) |
| Industry | 一覧から会社の業種を選びます。迷う場合は、最も近いものを選びます。 |
| プロファイル名(alias) | `country-purpose` を推奨します(例: `KR-DEV`) |
| Tier | 開発システムは `DEV`、品質保証は `QA`、本番は `PRD`。QA と PRD は自動的に参照専用になります。 |
| SAP_URL | ADT のアドレス(例: `https://sapdev.example.com:44300`) |
| SAP_CLIENT | クライアント番号(例: `100`) |
| ユーザー / パスワード | 普段使っている SAP のログオン情報です。パスワードは Windows 資格情報マネージャーに保存されます。 |
| RFC backend | 迷う場合は既定(`soap`)のままにします。 |
| ABAP ユーティリティオブジェクト | DEV でのみ聞かれます。トランスポート依頼が必要になる場合があります。 |
| SPRO 抽出 / カスタマイジングのインベントリ | 初回は <kbd>N</kbd> でスキップし、後から実行できます。 |

<details>
<summary>権限の確認メッセージが表示される</summary>

Claude は、ファイルの書き込みやコマンドの実行の前に確認します。セットアップ中は **Yes** を選んで構いません。
</details>

<details>
<summary>MCP サーバーの再接続を求められる</summary>

`/mcp` と入力し、`sap` サーバーを選んで **Reconnect** を選びます。
</details>

✅ セットアップウィザードが完了しました。

---

## B5. Gateway サービスを登録する

**[開発者]** OData パスには、サービス `ZMCP_ADT_SRV` が必要です。バックエンド(`/IWBEP`)と、フロントエンド(`/IWFND`)の**両方**に登録してください。片方だけでは動きません。NCo(B1)を使う場合は、この手順をスキップします。

### 始める前に

- `/sc4sap:setup`(手順 8)で、次のものが準備されていること:
  - SEGW プロジェクト `ZMCP_ADT`、タイプは "Service with SAP Annotations" — セットアップ中に SAP GUI で作成します。
  - クラス `ZCL_ZMCP_ADT_MPC_EXT`、`ZCL_ZMCP_ADT_DPC_EXT` — セットアップが作成して有効化します。
  - 関数モジュール `ZMCP_ADT_DISPATCH`、`ZMCP_ADT_TEXTPOOL` — リモート実行可能にします。セットアップで求められたら、SE37 で "Remote-Enabled" にチェックを入れます。
- B2 のノード `/default_host/sap/opu/odata` が有効であること。
- B3 の Gateway 登録の権限を持っていること。

### 値

| 項目 | 値 |
|---|---|
| サービス名 · 外部サービス名 | `ZMCP_ADT_SRV` |
| モデル名 | `ZMCP_ADT_MDL` |
| バージョン | `0001` |
| ネームスペース | 空 |
| モデルプロバイダークラス | `ZCL_ZMCP_ADT_MPC_EXT` |
| データプロバイダークラス | `ZCL_ZMCP_ADT_DPC_EXT` |
| システムエイリアス | `LOCAL`(同じサーバー、RFC 宛先 `NONE`) |
| パッケージ | クラスのパッケージ、または `$TMP` |

### 手順

1. **バックエンド** — `/IWBEP/REG_SERVICE` → Register → 値を入力 → Save
2. **フロントエンド** — `/IWFND/MAINT_SERVICE` → Add Service → システムエイリアス `LOCAL`、外部サービス名 `ZMCP_ADT_SRV` → Get Services → Add Selected Services → パッケージを選択
3. **ICF ノード** — `SICF` → `/default_host/sap/opu/odata/sap/ZMCP_ADT_SRV` → Activate Service
4. **キャッシュ** — `/IWFND/CACHE_CLEANUP` → モデルキャッシュをクリーンアップ → Execute

> **代替手段:** `/IWBEP/SB` があれば、手順 1 の代わりに SEGW を使えます。`ZMCP_ADT` を開く → Generate Runtime Objects (F6) → 有効化 → Register(システムエイリアス `LOCAL`)。その後、手順 2〜4 を上記のとおり行います。

### 確認

ブラウザーで次を開きます。

```
https://sapdev.example.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV/$metadata?sap-client=100
```

- `<edmx:Edmx>` で始まる XML ドキュメントが表示されれば成功です。
- `FunctionImport Name="Dispatch"` と `ComplexType Name="DispatchResult"` が含まれている必要があります。

### 問題が起きた場合

| 症状 | 原因 | 対処 |
|---|---|---|
| `$metadata` が 404 を返す | ICF ノードが無効、またはフロントエンドの登録がない | 手順 3(SICF)と 2(Add Service) |
| `$metadata` は 200 だが、呼び出しが 500 を返す | バックエンド(`/IWBEP`)の登録がない(`/IWFND/MAINT_SERVICE` のバックエンドタブが空) | 手順 1 を実行 → フロントエンドのサービスを削除して、もう一度追加 |
| 登録後も 500 のまま | モデルキャッシュが古い | `/IWFND/CACHE_CLEANUP` を実行し、`ZMCP_ADT_FLUSH_CACHE` を `P_FLUSH` で実行 |
| 原因不明の 500 | OData エラーの裏に ABAP 例外が隠れている | `/IWFND/ERROR_LOG` でトランザクション ID を調べ、`ZMCP_ADT_FLUSH_CACHE` を `P_DIAG` で実行 |
| 401 | ログオン失敗 | ユーザーとパスワードを確認し、パスワードが初期状態でないことを確認 |

> **緊急用オプション:** `ZMCP_ADT_FLUSH_CACHE` の `P_REG` は、バックエンドのテーブルに直接書き込むため、値が漏れる可能性があります。できる限り、上の手順を使ってください。

---

## B6. プロファイルを確認する

**[開発者]** 接続情報は `~/.sc4sap/profiles/<alias>/sap.env` にあります。`/sc4sap:setup` が書き込みます。パスワードはファイルには入っていません。Windows 資格情報マネージャーに保存されています。値を変更するには `/sc4sap:sap-option` を使います。

| キー | 例 | 意味 |
|---|---|---|
| `SAP_URL` | `https://sapdev.example.com:44300` | サーバーのアドレス |
| `SAP_CLIENT` | `100` | ログオンするクライアント |
| `SAP_AUTH_TYPE` | `basic` | Basic 認証 |
| `SAP_USERNAME` | `SC4SAP_DEV01` | ログオンユーザー(例) |
| `SAP_PASSWORD` | (資格情報マネージャー) | ファイルには保存しない |
| `SAP_LANGUAGE` | `EN` | ログオン言語 |
| `SAP_SYSTEM_TYPE` | `onprem` | オンプレミスのサーバー |
| `SAP_VERSION` | `ECC` または `S4` | ECC では ECC 専用の処理を使う |
| `ABAP_RELEASE` | `740` | BASIS リリース番号 |
| `SAP_TIER` | `DEV` | QA / PRD は書き込みをブロック |
| `SAP_RFC_BACKEND` | `odata` | OData パス(NCo の場合は `nco`) |
| `SAP_RFC_ODATA_SERVICE_URL` | `https://sapdev.example.com:44300/sap/opu/odata/sap/zmcp_adt_srv` | OData サービスのアドレス |
| `SAP_RFC_ODATA_CSRF_TTL_SEC` | `600` | CSRF トークンの再利用時間(秒) |
| `MCP_BLOCKLIST_PROFILE` | `minimal` | 保護テーブルのブロックレベル |
| `MCP_BLOCKLIST_EXTEND` | `ZHR*` | 追加でブロックするテーブル |

> **sc4sap は、保護テーブルを自動でブロックします。** BKPF や KNA1 などのテーブルは、読み取る前にユーザーの承認が必要です。SAP ユーザーに権限があっても、sc4sap のブロックは有効です。

---

## 9. 動作を確認する

ヘルスチェックを実行します。

```
/sc4sap:sap-doctor
```

すべてに合格すれば、インストールは完了です。

**最初に使うのにおすすめのコマンド**

| やりたいこと | 例 |
|---|---|
| プログラムを分析する | `/sc4sap:analyze-code ZMY_REPORT` |
| プログラムの仕様書を作る | `/sc4sap:program-to-spec ZMY_REPORT` |
| モジュールコンサルタントに質問する | `/sc4sap:ask-consultant Where is the credit check on delivery creation configured?` |
| ダンプの原因を調べる | `/sc4sap:analyze-symptom look at yesterday's ST22 dumps` |
| 新しいプログラムを作る | `/sc4sap:create-program` |
| 設定を表示・変更する | `/sc4sap:sap-option` |

> 普通の言葉で頼むこともできます。例: 「ZMY_REPORT のソースを読んで、何をするプログラムか説明して」

✅ `sap-doctor` に合格しました。

---

## B7. 接続チェック(詳細)

`sap-doctor` が失敗したときや、どのパスがブロックされているか知りたいときに使います。Claude Code にそのまま入力してください。

| 順番 | Claude への依頼 | 確認する内容 |
|---|---|---|
| 1 | "Search for table MARA" | ADT パス(B1、B2、B3) |
| 2 | "Show the GUI status of program SAPLSPO1" | OData → `ZMCP_ADT_DISPATCH` パス(B5) |
| 3 | `/sc4sap:sap-doctor` | ADT と OData の両方 |
| 4 | "Create a test program in $TMP, change it, activate it, then delete it" | 書き込み権限(書き込みユーザー、DEV のみ) |

> **1 は動くのに 2 が動かない場合、** ADT は開いていますが、OData パスがブロックされています。B5 の確認と問題の表を見てください。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| `claude` / `node` / `git` が認識されない | PowerShell を閉じ、新しいウィンドウを開きます。それでも失敗する場合は、PC を再起動します。 |
| スクリプトの実行が無効というエラー | [手順 1](#1-powershell-スクリプトを許可する) をもう一度確認します。`Get-ExecutionPolicy` が `RemoteSigned` である必要があります。グループポリシーでブロックされている場合は IT 部門に依頼してください。 |
| npm のインストールが止まる、または失敗する | 会社のプロキシかファイアウォールが原因と考えられます。IT 部門に、npmjs.org と github.com へのアクセスを依頼してください。 |
| `/sc4sap:setup` が一覧に出ない | Claude Code を完全に閉じて、もう一度起動します。`/plugin` で sc4sap がインストールされているか確認します。 |
| SAP 接続テストが失敗する(401) | ユーザー ID、パスワード、クライアントを確認します。`/sc4sap:sap-option` で修正できます。 |
| SAP 接続テストが失敗する(403 / 404) | SICF で `/sap/bc/adt` が無効か、ADT の権限がありません。Basis チームに依頼してください。 |
| 証明書(SSL)エラー | サーバーが社内の証明書を使っている可能性があります。エラーメッセージを Claude に貼り付けて質問してください。 |
| パスワードを変更したのに古いパスワードが使われる | Claude Code を完全に終了して、もう一度起動します。接続サーバーは、起動時にパスワードを読み込みます。 |
| `UserPromptSubmit hook ... keyword-detector.mjs / skill-injector.mjs timed out`、またはセットアップがチャットで SAP のパスワードを求める | 古い sc4sap(0.6.59 より前)がインストールされています。現行バージョンにはこのフックはなく、パスワードはマスクされた PowerShell ウィンドウで受け取ります。[アップデート](#アップデート)の手順で更新して再起動し、`/plugin` でバージョンを確認してください。フックが残る場合は、別のプラグイン(例: oh-my-claudecode)が管理しています。 |
| 何が悪いのか分からない | `/sc4sap:sap-doctor` を実行し、結果を Claude に見せてください。 |

## アップデート

Claude Code のプロンプトで次を実行します。

```
/plugin marketplace update sc4sap
/plugin install sc4sap
```

更新後は、Claude Code を再起動してください。

> 🔒 **安全性** — QA と PRD のプロファイルでは、オブジェクトの作成、変更、削除が 2 層でブロックされます。機密性の高いテーブルのデータ読み取りは、既定でブロックされます。
