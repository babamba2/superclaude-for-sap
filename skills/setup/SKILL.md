---
name: sc4sap:setup
description: Plugin setup — detect legacy single-profile state (migrate → multi-profile), create or register a SAP connection profile under ~/.sc4sap/profiles/<alias>/, install abap-mcp-adt-powerup MCP server, optionally install DEV-only ZMCP_ADT_UTILS + ZCL_S4SAP_CM_* ALV OOP handlers (tier-gated), register both PreToolUse hooks (blocklist + tier-readonly-guard), optional SPRO / customizations extraction
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

- No argument, `wizard`, or `--force` → run the full setup wizard (Steps 0–13). **Read `wizard-steps.md`** (in this skill folder) and execute the steps defined there in order. Step 0 performs legacy detection + profile bootstrap before any question.
- `doctor` → route to `/sc4sap:sap-doctor` with remaining args
- `mcp` → route to `/sc4sap:mcp-setup` with remaining args
- `spro` → **Active-profile precondition** (decision §4.5): if `<project>/.sc4sap/active-profile.txt` is absent AND `~/.sc4sap/profiles/` is empty, error out with `"No active SAP profile — run /sc4sap:setup (full wizard) first"`. If the pointer is absent but profiles exist, error with `"No active profile — use /sc4sap:sap-option switch <alias>"`. Otherwise, run SPRO config auto-generation — **read `spro-auto-generation.md`** and follow its 3 steps.
- `customizations` (also accepts `cust` / `enhancements`) → same active-profile precondition as `spro`. Then run customer enhancement + extension extraction — **read `customization-auto-generation.md`** and follow its 3 steps.

<Session_Trust_Bootstrap>
**MANDATORY — runs as Step 0 before any MCP call, file write, or user question.**

Invoke `/sc4sap:trust-session` with `parent_skill=sc4sap:setup` to pre-grant MCP tool + file-op permissions for the session. Setup itself creates ABAP objects on DEV tier profiles (`ZMCP_ADT_UTILS`, `ZCL_S4SAP_CM_*` ALV handlers) and writes multiple local files (`~/.sc4sap/profiles/<alias>/{sap.env, config.json}`, `<project>/.sc4sap/active-profile.txt`, `.claude/settings.local.json`, hook files) — each of which would otherwise trigger a permission prompt. Note: `trust-session` only allows writes under `.sc4sap/**`; writes under `~/.sc4sap/profiles/**` are routed through `sap-profile-cli.mjs` (a Bash invocation) so they go through the normal permission flow — trust-session cannot blanket-approve user-home paths.

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

- `wizard-steps.md` — the 14-step setup wizard **index** (Step 0–13). Read before running the full wizard. Heavy steps are split out (see below).
- `wizard-step-02-system-identification.md` — Step 2 detail (SAP version, ABAP release, Industry).
- `wizard-step-04-profile-creation.md` — Step 4 detail (alias + `SAP_TIER` + connection fields → `sap-profile-cli.mjs add`). Read before Step 4.
- `wizard-step-09-abap-objects.md` — Step 9 detail, including the **DEV-only tier gate** (QA/PRD REFUSE → CTS import guidance).
- `wizard-step-11-optional-extraction.md` — Step 11 (SPRO prompt) + 11b (Customization prompt). Artifacts land under `work/<activeAlias>/`.
- `wizard-step-12-blocklist-hook.md` — Step 12 installs BOTH L1 PreToolUse hooks: `block-forbidden-tables.mjs` + `tier-readonly-guard.mjs`.
- `spro-auto-generation.md` — SPRO extraction workflow. Read when the first arg is `spro` or when Step 11 proceeds.
- `customization-auto-generation.md` — customer Z*/Y* enhancement + extension extraction. Read when the first arg is `customizations` (also `cust` / `enhancements`) or when running wizard step 11b.
- `rfc-backend-selection.md` — Step 4bis RFC backend selection (soap/native/gateway/odata/zrfc). Writes `SAP_RFC_*` to the ACTIVE PROFILE env, never to the project folder.
- `odata-classes-install.md` — Step 9c OData backend classes install (DEV tier only).
- `hud-statusline.md` — HUD status line spec. HUD reads `<project>/.sc4sap/active-profile.txt` + profile env to render alias + tier badge.
- **External references**: [`../../docs/multi-profile-design.md`](../../docs/multi-profile-design.md), [`../../docs/multi-profile-setup-gap.md`](../../docs/multi-profile-setup-gap.md), [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md), [`../sap-option/migration.md`](../sap-option/migration.md), [`../sap-option/profile-management.md`](../sap-option/profile-management.md).

## HUD Status Line

The plugin ships a sc4sap-branded status line that activates automatically on install (declared in `.claude-plugin/plugin.json` → `statusLine`). **Read `hud-statusline.md`** for the full specification, including displayed segments, environment variables (`SC4SAP_WEEKLY_LIMIT_USD`, `NO_COLOR`), performance characteristics, and how to disable it.

## Notes

- `/sc4sap:sap-doctor`, `/sc4sap:mcp-setup`, `/sc4sap:sap-option` remain valid direct entrypoints. Prefer `/sc4sap:setup` in documentation and user guidance.
- **Configuration layout (0.6.0 multi-profile)**:
  - **User home** (profile definitions, shared across repos):
    - `~/.sc4sap/profiles/<alias>/sap.env` — MCP-server env; password is stored in the OS keychain and referenced via `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>`.
    - `~/.sc4sap/profiles/<alias>/config.json` — plugin-side settings (`sapVersion`, `abapRelease`, `industry`, `activeModules`, `namingConvention`, `systemInfo`, `activeTransport`, `blocklistProfile`).
    - `~/.sc4sap/profiles/<alias>/.abap-utils-installed` — Step 9 sentinel (DEV only).
    - `~/.sc4sap/profiles/.trash/<alias>-<ts>/` — soft-deleted profiles (7-day auto-purge).
  - **Project root** (engagement-scoped artifacts):
    - `<project>/.sc4sap/active-profile.txt` — alias of the currently active profile.
    - `<project>/.sc4sap/work/<alias>/{program, cbo, customizations, audit, comparisons, spro-config.json}` — per-profile artifacts (see [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md)).
    - `<project>/.sc4sap/sap.env.legacy` — migration backup (rollback); exists only right after Step 0 migration.
    - Legacy `<project>/.sc4sap/{sap.env, config.json}` — DELETED by Step 0 migration (decision §4.3). Fresh installs never create them.
    - Optional `<project>/.sc4sap/blocklist-{extend,custom}.txt` — L1 hook extension lists.
- **Post-setup edits**:
  - Change connection / password / industry / blocklist profile / RFC backend → `/sc4sap:sap-option`.
  - Switch active system → `/sc4sap:sap-option switch <alias>`.
  - Add another company or tier → `/sc4sap:sap-option add`.
  - Tier is immutable on a profile — change by remove + add via `/sc4sap:sap-option`.
- **Tier semantics** (enforced by `scripts/hooks/tier-readonly-guard.mjs` + L2 MCP guard):
  - `DEV` — writes allowed; Step 9 installs on this tier only.
  - `QA` — read + `RunUnitTest` only; mutations blocked; Step 9 refuses.
  - `PRD` — strict read-only; `RunUnitTest` blocked; Step 9 refuses.
