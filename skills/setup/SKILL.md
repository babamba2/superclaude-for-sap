---
name: sc4sap:setup
description: Plugin setup — install abap-mcp-adt-powerup, write .sc4sap/{sap.env,config.json}, create ZMCP_ADT_UTILS + ZCL_S4SAP_CM_* ALV OOP handlers, install PreToolUse blocklist hook, optional SPRO config auto-generation
level: 2
---

# SC4SAP Setup

Use `/sc4sap:setup` as the unified setup and configuration entrypoint for SuperClaude for SAP.

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

## Usage

```bash
/sc4sap:setup                  # full setup wizard
/sc4sap:setup doctor           # diagnose installation and SAP connection
/sc4sap:setup mcp              # configure abap-mcp-adt-powerup MCP server
/sc4sap:setup spro             # auto-generate SPRO config from S/4HANA system
/sc4sap:setup customizations   # extract customer Z*/Y* enhancements + extensions
```

## Routing

Process the request by the **first argument only**:

- No argument, `wizard`, or `--force` → run the full setup wizard. **Read `wizard-steps.md`** (in this skill folder) and execute the 13 steps defined there in order.
- `doctor` → route to `/sc4sap:sap-doctor` with remaining args
- `mcp` → route to `/sc4sap:mcp-setup` with remaining args
- `spro` → run SPRO config auto-generation. **Read `spro-auto-generation.md`** (in this skill folder) and follow its 3 steps.
- `customizations` (also accepts `cust` / `enhancements`) → run customer enhancement + extension extraction. **Read `customization-auto-generation.md`** (in this skill folder) and follow its 3 steps.

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call, file write, or user question.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:setup` to pre-grant MCP tool + file-op permissions for the session. Setup itself creates ABAP objects (`ZMCP_ADT_UTILS`, `ZCL_S4SAP_CM_*` ALV handlers) and writes multiple local files (`.sc4sap/sap.env`, `.sc4sap/config.json`, `.claude/settings.local.json`, hook files) — each of which would otherwise trigger a permission prompt.

- If `.sc4sap/session-trust.log` already has a line within the last 24h, skip silently.
- Otherwise run it and surface the one-line confirmation.
- `GetTableContents` / `GetSqlQuery` remain prompt-gated even after trust-session — setup does not need them.
- All subsequent `Agent` dispatches within this skill MUST pass `mode: "dontAsk"`.

Full spec: see [`../trust-session/SKILL.md`](../trust-session/SKILL.md).
</Session_Trust_Bootstrap>

## Interaction Style (MANDATORY)

> **Ask one question at a time. Never batch questions.**
>
> - Walk through the steps **sequentially** and collect each input **one by one**.
> - Do not advance to the next question until the user has answered the current one.
> - As soon as the user answers, record/apply the value and move to the next step.
> - Even when a single step has multiple fields (e.g., Step 4 SAP connection info), ask **one field per message**.
>   Example: ask `SAP_URL?` → wait for answer → ask `SAP_CLIENT?` → wait → ask `SAP_AUTH_TYPE?` → ...
> - If a value already exists in `.sc4sap/sap.env` or `.sc4sap/config.json`, show the current value and offer "press Enter to keep / type a new value".
> - Keep prompts short. Do not paste long wall-of-text instructions.
>
> Never dump the entire questionnaire in a single message — users find it frustrating.

## Companion files (MUST read when relevant)

- `wizard-steps.md` — the 13-step setup wizard **index**. Read before running the full wizard. Heavy steps are split out (see below).
- `wizard-step-02-system-identification.md` — Step 2 detail (SAP version, ABAP release, Industry). Read when asking the Step 2 sub-questions.
- `wizard-step-09-abap-objects.md` — Step 9 detail (9a `ZMCP_ADT_UTILS` FMs, 9b ALV OOP handlers, 9c OData-conditional classes). Read before executing Step 9.
- `wizard-step-11-optional-extraction.md` — Step 11 (SPRO prompt) + 11b (Customization prompt). Read when reaching those optional prompts.
- `wizard-step-12-blocklist-hook.md` — Step 12 L3 PreToolUse hook install. Read before asking for the blocklist profile.
- `spro-auto-generation.md` — SPRO extraction workflow. Read when the first arg is `spro` or when Step 11 proceeds.
- `customization-auto-generation.md` — customer Z*/Y* enhancement + extension extraction. Read when the first arg is `customizations` (also `cust` / `enhancements`) or when running wizard step 11b.
- `rfc-backend-selection.md` — Step 4bis RFC backend selection (soap/native/gateway/odata).
- `odata-classes-install.md` — Step 9c OData backend classes install.
- `hud-statusline.md` — HUD status line spec (displayed segments, env vars, performance, overrides).

## HUD Status Line

The plugin ships a sc4sap-branded status line that activates automatically on install (declared in `.claude-plugin/plugin.json` → `statusLine`). **Read `hud-statusline.md`** for the full specification, including displayed segments, environment variables (`SC4SAP_WEEKLY_LIMIT_USD`, `NO_COLOR`), performance characteristics, and how to disable it.

## Notes

- `/sc4sap:sap-doctor`, `/sc4sap:mcp-setup`, `/sc4sap:sap-option` remain valid direct entrypoints.
- Prefer `/sc4sap:setup` in documentation and user guidance.
- Config is stored in `.sc4sap/` in the project root (`sap.env` for MCP-server env, `config.json` for plugin-side settings, optional `blocklist-extend.txt` / `blocklist-custom.txt`).
- After setup: to change SAP credentials or the L4 MCP blocklist profile, use `/sc4sap:sap-option`. To change the L3 hook profile, re-run `/sc4sap:setup` or edit `.sc4sap/config.json`.
