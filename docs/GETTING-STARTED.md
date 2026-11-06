# sc4sap Getting Started (first-time users)

← [Back to README](../README.md) · [한국어](GETTING-STARTED.ko.md) · all setup options: [Installation & Setup](INSTALLATION.md)

A step-by-step guide for people who have never used Claude Code. Follow it from top to bottom.

> **Windows · about 30–40 minutes**

## Steps

- [ ] [0. Before you start](#0-before-you-start)
- [ ] [1. PowerShell execution policy](#1-allow-powershell-scripts)
- [ ] [2. Install Git](#2-install-git)
- [ ] [3. Install Node.js](#3-install-nodejs)
- [ ] [4. Install Claude Code](#4-install-claude-code)
- [ ] [5. Sign in](#5-sign-in)
- [ ] [6. Create a work folder](#6-create-a-work-folder)
- [ ] [7. Install the sc4sap plugin](#7-install-the-sc4sap-plugin)
- [ ] [8. Connect to SAP](#8-connect-to-sap)
- [ ] [9. Check that it works](#9-check-that-it-works)
- [Troubleshooting](#troubleshooting) · [Updating](#updating)

---

## 0. Before you start

Have these ready.

| Item | Details |
|---|---|
| PC | Windows 10 / 11. Admin rights make it easier. |
| Claude plan | Claude Pro or Max. A company Team / Enterprise account works too. An API key also works. |
| SAP system | ECC 6.0, S/4HANA On-Premise or S/4HANA Cloud, with ADT enabled. |
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

✅ Everything is ready.

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
| No idea what is wrong | Run `/sc4sap:sap-doctor` and show Claude the result. |

## Updating

In the Claude Code prompt:

```
/plugin marketplace update sc4sap
/plugin install sc4sap
```

Restart Claude Code after updating.

> 🔒 **Safety** — on QA and PRD profiles, creating, changing and deleting objects is blocked in two layers. Data reads of sensitive tables are blocked by default.
