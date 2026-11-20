# sc4sap Getting Started (first-time users)

← [Back to README](../README.md) · [한국어](GETTING-STARTED.ko.md) · all setup options: [Installation & Setup](INSTALLATION.md)

A step-by-step guide for people who have never used Claude Code. Follow it from top to bottom.

> **Windows · about 30–40 minutes**

## Steps

- [ ] [0. Before you start](#0-before-you-start)
- **SAP server preparation (Basis)**
  - [ ] [B1. Open the web port (first)](#b1-open-the-web-port-first)
  - [ ] [B2. Activate the ICF services](#b2-activate-the-icf-services)
  - [ ] [B3. User authorizations](#b3-user-authorizations)
  - [ ] [B4. System and user settings](#b4-system-and-user-settings)
- **Your PC**
- [ ] [1. PowerShell execution policy](#1-allow-powershell-scripts)
- [ ] [2. Install Git](#2-install-git)
- [ ] [3. Install Node.js](#3-install-nodejs)
- [ ] [4. Install Claude Code](#4-install-claude-code)
- [ ] [5. Sign in](#5-sign-in)
- [ ] [6. Create a work folder](#6-create-a-work-folder)
- [ ] [7. Install the sc4sap plugin](#7-install-the-sc4sap-plugin)
- [ ] [8. Connect to SAP](#8-connect-to-sap)
- [ ] [B5. Register the Gateway service](#b5-register-the-gateway-service)
- [ ] [B6. Check the profile](#b6-check-the-profile)
- [ ] [9. Check that it works](#9-check-that-it-works)
- [ ] [B7. Connection checks (in detail)](#b7-connection-checks-in-detail)
- [Troubleshooting](#troubleshooting) · [Updating](#updating)

---

## 0. Before you start

Have these ready.

| Item | Details |
|---|---|
| PC | Windows 10 / 11. Admin rights make it easier. |
| Claude plan | Claude Pro or Max. A company Team / Enterprise account works too. An API key also works. |
| SAP system | ECC 6.0 or S/4HANA On-Premise, with ADT enabled. |
| SAP logon | Server URL, client, user ID, password, language. |
| Internet | Access to github.com, npmjs.org and claude.ai. If the company network blocks them, ask IT. |

<details>
<summary>Not sure what the SAP URL is?</summary>

It is the same address Eclipse ADT uses, usually like `https://servername:44300`. Ask your Basis team for the "ADT URL".
</details>

<details>
<summary>How to check that ADT is enabled</summary>

Run `SICF` in SAP GUI. The service `/sap/bc/adt` must be active. Without authorization, ask your Basis team.
</details>

> **Connecting to a company SAP server for the first time?** Ask your Basis team for [B1–B4](#b1-open-the-web-port-first) first. The **B1 web port** must be open before anything else can be tested. Install on the DEV server once; QA and PRD get the objects by transport.

✅ Everything is ready.

---

## B1. Open the web port (first)

**[Basis]** sc4sap connects to the SAP server through its **web (HTTP/HTTPS) port**. It does not use the SAP GUI port (32xx) or the RFC port (33xx). While this port is closed, nothing from B2 on can be tested.

### Port numbers

SAP ports are usually **a prefix + the instance number**. The examples are for instance `00`.

| Use | Rule | Example (instance 00) |
|---|---|---|
| SAP GUI | 32 + number | 3200 |
| RFC | 33 + number | 3300 |
| **Web HTTP (used by sc4sap)** | **80 + number** | **8000** |
| Web HTTPS (used by sc4sap) | 443 + number | 44300 |

Some servers use other numbers. Step 1 below shows the real ones.

### Steps

| Step | Who | What | Check |
|---|---|---|---|
| 1 | Basis | Check that the server has a web port: `SMICM` → Goto → Services | An active HTTP (or HTTPS) row with a port number. |
| 2 | Basis | If not, add one: in `RZ10` set `icm/server_port_<n>` = `PROT=HTTP,PORT=8000` → restart ICM | The new row appears in step 1. |
| 3 | Basis · network team | Allow developer PCs → server IP and web port in the firewall. | — |
| 4 | Developer | Test from the PC (command below). | `TcpTestSucceeded : True` |

```powershell
Test-NetConnection sapdev.example.com -Port 8000
```

> **What to ask Basis:** "Please make the SAP server's web port (80 + instance number, or HTTPS 443 + instance number) reachable from developer PCs."

### If the web port cannot be opened: RFC (NCo)

Instead of the web port, sc4sap can connect through the **RFC port (33 + instance number)** with the SAP .NET Connector (NCo) on the developer PC.

| Item | Web port | NCo |
|---|---|---|
| Port | web 80NN / 443NN | RFC 33NN |
| ICF nodes (B2) | needed | not needed |
| Gateway service registration (B5) | needed | not needed |
| `S_SERVICE` | needed | not needed |
| `S_ADT_RES` | needed | **also needed** (ADT checks it over RFC too) |
| `S_RFC` | ADT + Z function modules | same + `SADT_REST` (ADT over RFC) |
| Z function install and transport | install on DEV → transport to QA | same |
| Developer PC | any | Windows with NCo installed |

> **Every user installs NCo on their own PC.** NCo (SAP Connector for Microsoft .NET 3.1) is licensed SAP software, so sc4sap cannot ship it. Download it from the SAP Support Portal (Software Downloads) with an S-user that may download software. Without one, ask your Basis team for the installer. Some PCs already have it with SAP GUI.

| Other limits | Details |
|---|---|
| Windows only | Not on Mac or Linux; those PCs use the web port. |
| Direct server only | Application server + instance number only. No message server (logon groups), SAProuter or SNC. |
| Encryption | Without SNC the RFC traffic is not encrypted. Use it inside the company network only, and confirm with Basis. |
| Z function version | `ZMCP_ADT_DISPATCH` needs the NCo function (`FM_PROXY`). Current sources include it. |
| Same authorizations | `S_ADT_RES` and the read / development authorizations stay the same. Only ICF, Gateway and `S_SERVICE` drop out. |

---

## B2. Activate the ICF services

**[Basis]** Activate these nodes in transaction `SICF`. A child node does not work while its parent is inactive.

| Node | Required | Use |
|---|---|---|
| `/default_host/sap`, `/default_host/sap/bc` | yes | parent nodes |
| `/default_host/sap/bc/adt` | yes | ADT path (all reads and writes). The CSRF token comes from `/sap/bc/adt/core/discovery`. |
| `/default_host/sap/opu/odata` | yes | OData path (screens, GUI status, text pools, dumps) |

---

## B3. User authorizations

**[Basis]** Start from a copy of the SAP standard role `SAP_BC_DWB_ABAPDEVELOPER` and add the authorizations below. Systems differ, so let Basis confirm.

### Base authorizations (every user)

| Object | Fields and values | Use | Write user | Read-only user |
|---|---|---|---|---|
| `S_ADT_RES` | `URI` = `/sap/bc/adt/*` | ADT access | yes | yes |
| `S_RFC` | `RFC_TYPE` = FUGR, `RFC_NAME` = `SADT*`, `SDTX`, `SYST`, `RFC1`, `ACTVT` = 16 | ADT internal RFC | yes | yes |
| `S_RFC` (extra) | `RFC_NAME` = `ZMCP_ADT_UTILS` | dispatcher, text pool, DDIC function modules | yes | yes |
| `S_SERVICE` | service `ZMCP_ADT_SRV` | OData path | yes | yes |
| `S_DEVELOP` | `DEVCLASS` = `$TMP`, `Z*`, `Y*` · `OBJTYPE` = PROG, CLAS, INTF, FUGR, DEVC, … · `OBJNAME` = `Z*`, `Y*` · `ACTVT` = 01, 02, 03, 06, 07, 16 | 01 create · 02 change · 03 display · 06 delete · 07 activate · 16 execute | all | 03 only |
| `S_TRANSPRT` | `TTYPE` = DTRA, TASK · `ACTVT` = 01, 02, 03 | display, create and assign transports | all | 03 only |
| `S_TABU_DIS`, `S_TABU_NAM` | table groups / names to read, `ACTVT` = 03 | table reads | yes | yes |
| ST22 display | — | dump list | optional | optional |

### Gateway registration (one developer)

Needed only if a developer registers the Gateway service (B5) personally. The standard developer role does not have it. Registration is once per server, so one person is enough.

| Object | Fields and values | Use |
|---|---|---|
| `S_TCODE` | `/IWBEP/REG_SERVICE`, `/IWFND/MAINT_SERVICE`, `/IWFND/CACHE_CLEANUP`, `/IWFND/ERROR_LOG`, `SEGW`, `SICF` | register, clear caches, error log |
| `/IWBEP/SB` | project `ZMCP_ADT` (or `Z*`), all activities | registration through SEGW (alternative) |
| `S_DEVELOP` (extra) | `OBJTYPE` = Gateway repository objects (service, model, service group, …) · `OBJNAME` = `ZMCP_ADT*` · `ACTVT` = 01, 02, 03 | Gateway catalog entries |
| `S_ICF_ADM` | node `ZMCP_ADT_SRV` | activate the ICF node |
| `S_TRANSPRT` | `ACTVT` = 01, 02 | only when registering in a transportable package |

---

## B4. System and user settings

**[Basis]**

| Item | Needed | Otherwise |
|---|---|---|
| Developer key | registered for the user | writing Z objects fails |
| System change option | customer namespace (Z/Y) and local objects modifiable | writes fail |
| Client settings | changes to repository and cross-client objects allowed | writes fail |
| User type | dialog or service user | logon fails |
| Password | not initial (log on once in SAP GUI and change it) | HTTP logon fails |

---

## 1. Allow PowerShell scripts

Windows blocks PowerShell scripts by default. Unless you allow them, the Claude Code installer and the `claude` and `npm` commands stop with an error.

**① Open PowerShell**

1. Press <kbd>Win</kbd> and type "PowerShell".
2. Click **Windows PowerShell**.
3. For admin rights, right-click and choose **Run as administrator**.

**② Check the current setting**

```powershell
Get-ExecutionPolicy -List
```

If both `CurrentUser` and `LocalMachine` are `Undefined` or `Restricted`, scripts are blocked.

**③ Allow scripts — run one of these**

Option A — your account only (no admin rights needed, recommended)

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Option B — the whole PC (in an admin PowerShell)

```powershell
Set-ExecutionPolicy -Scope LocalMachine -ExecutionPolicy RemoteSigned
```

When asked to confirm, type <kbd>Y</kbd> (or <kbd>A</kbd>) and press <kbd>Enter</kbd>.

**④ Check again**

```powershell
Get-ExecutionPolicy
```

It should print `RemoteSigned`.

<details>
<summary>What is RemoteSigned?</summary>

Scripts made on your PC run; scripts downloaded from the internet run only when signed. A common setting on developer PCs.
</details>

<details>
<summary>"overridden by a policy defined at a more specific scope"</summary>

Your company set this by group policy, so you cannot change it yourself. Ask IT to allow the PowerShell execution policy RemoteSigned.
</details>

✅ The execution policy is `RemoteSigned`.

---

## 2. Install Git

Claude Code and sc4sap use Git internally. On Windows it is required.

1. Download the installer from [git-scm.com/download/win](https://git-scm.com/download/win).
2. Keep every default and click **Next**.
3. When done, open a **new PowerShell window** and check:

```powershell
git --version
```

It should print something like `git version 2.xx.x`.

✅ Git is installed.

---

## 3. Install Node.js

The SAP connection server of sc4sap (MCP) runs on Node.js. **Version 20 or later** is required.

1. Download the **LTS** version from [nodejs.org](https://nodejs.org).
2. Keep the defaults.
3. Close open PowerShell windows, open a new one and check:

```powershell
node --version
npm --version
```

It should print `v20` or later, e.g. `v22.11.0`.

✅ Node.js is installed.

---

## 4. Install Claude Code

Claude Code is Claude in your terminal. sc4sap is a plugin on top of it.

Option A — official install script (recommended)

```powershell
irm https://claude.ai/install.ps1 | iex
```

Option B — npm (when option A is blocked on the company network)

```powershell
npm install -g @anthropic-ai/claude-code
```

Close PowerShell, open a new window and check:

```powershell
claude --version
```

It should print a version number.

<details>
<summary>"claude is not recognized"</summary>

Open a new PowerShell window. If it still fails, restart the PC.
</details>

✅ Claude Code is installed.

---

## 5. Sign in

The first start shows the sign-in screens.

```powershell
claude
```

1. Pick a colour theme with the arrow keys and press <kbd>Enter</kbd>.
2. Choose **Claude account with subscription**. With an API key, choose **Anthropic Console**.
3. A browser opens. Sign in with your Claude account and approve.
4. Back in the terminal you see the prompt (`>`).

> **Check** — type `hello`. If Claude answers, you are signed in.
>
> **To leave** — type `/exit` or press <kbd>Ctrl</kbd> + <kbd>C</kbd> twice.

✅ You are signed in.

---

## 6. Create a work folder

sc4sap keeps its work files in the folder you start it from. Create one for it.

```powershell
mkdir $HOME\Documents\sap-work
cd $HOME\Documents\sap-work
claude
```

> **From now on, always start like this** — open PowerShell, `cd $HOME\Documents\sap-work`, then `claude`.

<details>
<summary>Asked whether you trust the folder?</summary>

Choose **Yes, proceed**. It is your own work folder.
</details>

✅ Claude Code is open in your work folder.

---

## 7. Install the sc4sap plugin

> ⚠️ From here on, type into the **Claude Code prompt (`>`)**, not into PowerShell.

**① Add the marketplace**

```
/plugin marketplace add https://github.com/babamba2/superclaude-for-sap.git
```

**② Install the plugin**

```
/plugin install sc4sap
```

When asked for the scope, **User** (available in every folder) is the easiest.

**③ Restart Claude Code**

1. Leave with `/exit`.
2. Run `claude` again in the same folder.

> **Check** — type just `/sc4sap`. A list with `/sc4sap:setup` and others means it worked.

✅ The plugin is installed.

---

## 8. Connect to SAP

The setup wizard asks one question at a time.

```
/sc4sap:setup
```

**Wizard flow**

```
SAP version · industry → MCP server installed automatically → logon details → connection test → safety hooks → done
```

**Common questions**

| Question | Answer |
|---|---|
| SAP version | `S4` or `ECC`. The ABAP release is under **System → Status** in SAP GUI, e.g. `757` |
| Industry | Pick your company's industry from the list; if unsure, the closest one. |
| Profile name (alias) | `country-purpose` is recommended, e.g. `KR-DEV` |
| Tier | `DEV` for a development system, `QA` for quality, `PRD` for production. QA and PRD become read-only automatically. |
| SAP_URL | The ADT address, e.g. `https://sapdev.example.com:44300` |
| SAP_CLIENT | The client number, e.g. `100` |
| User / password | Your usual SAP logon. The password is stored in Windows Credential Manager. |
| RFC backend | If unsure, keep the default (`soap`). |
| ABAP utility objects | Asked on DEV only. A transport request may be needed. |
| SPRO extraction / customizing inventory | You can skip it with <kbd>N</kbd> the first time and run it later. |

<details>
<summary>A permission prompt appears</summary>

Claude asks before writing files or running commands. During setup you can choose **Yes**.
</details>

<details>
<summary>Asked to reconnect the MCP server</summary>

Type `/mcp`, pick the `sap` server and choose **Reconnect**.
</details>

✅ The setup wizard is done.

---

## B5. Register the Gateway service

**[Developer]** The OData path needs the service `ZMCP_ADT_SRV`. Register it in **both** the backend (`/IWBEP`) and the frontend (`/IWFND`); one alone does not work. Skip this step when you use NCo (B1).

### Before you start

- `/sc4sap:setup` (step 8) must have prepared:
  - SEGW project `ZMCP_ADT`, type "Service with SAP Annotations" — you create it in SAP GUI during setup.
  - Classes `ZCL_ZMCP_ADT_MPC_EXT`, `ZCL_ZMCP_ADT_DPC_EXT` — setup writes and activates them.
  - Function modules `ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL` — remote-enabled. When setup asks, tick "Remote-Enabled" in SE37.
- The node `/default_host/sap/opu/odata` from B2 is active.
- You have the Gateway registration authorizations from B3.

### Values

| Field | Value |
|---|---|
| Service name · external service name | `ZMCP_ADT_SRV` |
| Model name | `ZMCP_ADT_MDL` |
| Version | `0001` |
| Namespace | empty |
| Model provider class | `ZCL_ZMCP_ADT_MPC_EXT` |
| Data provider class | `ZCL_ZMCP_ADT_DPC_EXT` |
| System alias | `LOCAL` (same server, RFC destination `NONE`) |
| Package | the classes' package or `$TMP` |

### Steps

1. **Backend** — `/IWBEP/REG_SERVICE` → Register → enter the values → Save
2. **Frontend** — `/IWFND/MAINT_SERVICE` → Add Service → system alias `LOCAL`, external service name `ZMCP_ADT_SRV` → Get Services → Add Selected Services → choose the package
3. **ICF node** — `SICF` → `/default_host/sap/opu/odata/sap/ZMCP_ADT_SRV` → Activate Service
4. **Caches** — `/IWFND/CACHE_CLEANUP` → clean up the model cache → Execute

> **Alternative:** with `/IWBEP/SB` you can use SEGW instead of step 1: open `ZMCP_ADT` → Generate Runtime Objects (F6) → activate → Register (system alias `LOCAL`). Then do steps 2–4 as above.

### Check

Open in a browser:

```
https://sapdev.example.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV/$metadata?sap-client=100
```

- An XML document starting with `<edmx:Edmx>` means it works.
- It must contain `FunctionImport Name="Dispatch"` and `ComplexType Name="DispatchResult"`.

### Problems

| Symptom | Cause | Fix |
|---|---|---|
| `$metadata` returns 404 | ICF node inactive, or the frontend registration is missing | steps 3 (SICF) and 2 (Add Service) |
| `$metadata` is 200 but calls return 500 | backend (`/IWBEP`) registration missing (the backend tab of `/IWFND/MAINT_SERVICE` is empty) | run step 1 → delete the frontend service and add it again |
| still 500 after registering | old model cache | run `/IWFND/CACHE_CLEANUP`, and `ZMCP_ADT_FLUSH_CACHE` with `P_FLUSH` |
| unexplained 500 | an ABAP exception hidden behind the OData error | look up the transaction ID in `/IWFND/ERROR_LOG`, run `ZMCP_ADT_FLUSH_CACHE` with `P_DIAG` |
| 401 | logon failed | check user and password, and that the password is not initial |

> **Emergency option:** `P_REG` of `ZMCP_ADT_FLUSH_CACHE` writes the backend tables directly and may miss values. Use the steps above whenever you can.

---

## B6. Check the profile

**[Developer]** The connection lives in `~/.sc4sap/profiles/<alias>/sap.env`; `/sc4sap:setup` writes it. The password is not in the file — it is in the Windows Credential Manager. Change values with `/sc4sap:sap-option`.

| Key | Example | Meaning |
|---|---|---|
| `SAP_URL` | `https://sapdev.example.com:44300` | server address |
| `SAP_CLIENT` | `100` | logon client |
| `SAP_AUTH_TYPE` | `basic` | basic authentication |
| `SAP_USERNAME` | `SC4SAP_DEV01` | logon user (example) |
| `SAP_PASSWORD` | (Credential Manager) | never in the file |
| `SAP_LANGUAGE` | `EN` | logon language |
| `SAP_SYSTEM_TYPE` | `onprem` | on-premise server |
| `SAP_VERSION` | `ECC` or `S4` | ECC uses the ECC-specific handling |
| `ABAP_RELEASE` | `740` | BASIS release number |
| `SAP_TIER` | `DEV` | QA / PRD block writes |
| `SAP_RFC_BACKEND` | `odata` | OData path (`nco` for NCo) |
| `SAP_RFC_ODATA_SERVICE_URL` | `https://sapdev.example.com:44300/sap/opu/odata/sap/zmcp_adt_srv` | OData service address |
| `SAP_RFC_ODATA_CSRF_TTL_SEC` | `600` | CSRF token reuse time (seconds) |
| `MCP_BLOCKLIST_PROFILE` | `minimal` | protected-table blocking level |
| `MCP_BLOCKLIST_EXTEND` | `ZHR*` | extra tables to block |

> **sc4sap blocks protected tables on its own.** Tables such as BKPF or KNA1 need the user's approval before a read. sc4sap's block applies even when the SAP user is authorized.

---

## 9. Check that it works

Run the health check.

```
/sc4sap:sap-doctor
```

When everything passes, the installation is complete.

**Good first commands**

| What you want | Example |
|---|---|
| Analyse a program | `/sc4sap:analyze-code ZMY_REPORT` |
| Specification of a program | `/sc4sap:program-to-spec ZMY_REPORT` |
| Ask a module consultant | `/sc4sap:ask-consultant Where is the credit check on delivery creation configured?` |
| Find the cause of a dump | `/sc4sap:analyze-symptom look at yesterday's ST22 dumps` |
| Build a new program | `/sc4sap:create-program` |
| View or change settings | `/sc4sap:sap-option` |

> You can also just ask in plain words, e.g. "Read the source of ZMY_REPORT and explain what it does".

✅ `sap-doctor` passed.

---

## B7. Connection checks (in detail)

Use these when `sap-doctor` fails or you want to know which path is blocked. Type them into Claude Code as they are.

| Order | Ask Claude | Checks |
|---|---|---|
| 1 | "Search for table MARA" | ADT path (B1, B2, B3) |
| 2 | "Show the GUI status of program SAPLSPO1" | OData → `ZMCP_ADT_DISPATCH` path (B5) |
| 3 | `/sc4sap:sap-doctor` | ADT and OData together |
| 4 | "Create a test program in $TMP, change it, activate it, then delete it" | write authorizations (write user, DEV only) |

> **If 1 works but 2 does not,** ADT is open and the OData path is blocked. See the check and problems in B5.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `claude` / `node` / `git` not recognized | Close PowerShell and open a new window. If it still fails, restart the PC. |
| Error that running scripts is disabled | Recheck [step 1](#1-allow-powershell-scripts): `Get-ExecutionPolicy` must be `RemoteSigned`. Blocked by group policy → ask IT. |
| npm install hangs or fails | Likely the company proxy or firewall. Ask IT for access to npmjs.org and github.com. |
| `/sc4sap:setup` is not in the list | Close Claude Code completely and start it again. Check under `/plugin` that sc4sap is installed. |
| SAP connection test fails (401) | Check user ID, password and client. Fix them with `/sc4sap:sap-option`. |
| SAP connection test fails (403 / 404) | `/sap/bc/adt` is inactive in SICF, or ADT authorization is missing. Ask your Basis team. |
| Certificate (SSL) error | The server may use a company certificate. Paste the error message into Claude and ask. |
| Password changed but the old one is still used | Quit Claude Code completely and start it again. The connection server reads the password at start. |
| `UserPromptSubmit hook ... keyword-detector.mjs / skill-injector.mjs timed out`, or setup asks for the SAP password in the chat | An old sc4sap version (before 0.6.59) is installed: current versions have no such hooks and take the password in a masked PowerShell window. Update as under [Updating](#updating), restart, and check the version under `/plugin`. If the hooks remain, another plugin (e.g. oh-my-claudecode) owns them. |
| No idea what is wrong | Run `/sc4sap:sap-doctor` and show Claude the result. |

## Updating

In the Claude Code prompt:

```
/plugin marketplace update sc4sap
/plugin install sc4sap
```

Restart Claude Code after updating.

> 🔒 **Safety** — on QA and PRD profiles, creating, changing and deleting objects is blocked in two layers. Data reads of sensitive tables are blocked by default.
