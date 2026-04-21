# Setup Wizard Steps

Referenced by `SKILL.md` — this file is the **index** of the setup wizard. Heavy steps have been split into companion files in this same `skills/setup/` folder. Follow the links and read each step's file before asking the user the related question.

> **Multi-profile note (0.6.0+)**: profile definitions live in `~/.sc4sap/profiles/<alias>/{sap.env, config.json}`; the project folder carries only `<project>/.sc4sap/active-profile.txt` plus `work/<alias>/` artifacts. The single-file `<project>/.sc4sap/sap.env` exists only as a legacy state that Step 0 below migrates away. See [`../../docs/multi-profile-design.md`](../../docs/multi-profile-design.md) and [`../../docs/multi-profile-setup-gap.md`](../../docs/multi-profile-setup-gap.md).

## Step 0 — Legacy Detection & Profile Bootstrap

Run BEFORE any other question. Call:

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/sap-profile-cli.mjs" detect-legacy
```

Branch on the returned JSON:

- `needsMigration=true` → route to **[`../sap-option/migration.md`](../sap-option/migration.md)**. Collect `alias` + `tier`, run `sap-profile-cli.mjs migrate`, then DELETE `<project>/.sc4sap/config.json` (decision §4.3 of the setup gap plan — engagement state is migrated into the new profile's config first). Resume at Step 5.
- `needsMigration=false` AND `profileCount=0` → proceed to Step 1 normally; Step 4 will create the first profile.
- `needsMigration=false` AND `profileCount≥1` → ask whether to use the current active profile (if `active-profile.txt` exists) or create another (routes into Step 4.1 with 4.3 meta-copy offer).

Full flow detail lives in **[`wizard-step-04-profile-creation.md`](wizard-step-04-profile-creation.md)** → §4.0.

## Step 1 — Version Check

Verify Claude Code version compatibility (`claude --version`).

## Step 2 — System Identification (SAP Version, ABAP Release, Industry)

Full procedure: **[`wizard-step-02-system-identification.md`](wizard-step-02-system-identification.md)**. Ask the three sub-questions one at a time; do not batch them. Values feed into the profile env at Step 4.

## Step 3 — Install `abap-mcp-adt-powerup` MCP Server

Clone (`github.com/babamba2/abap-mcp-adt-powerup.git`) and build the external MCP server into the **plugin root's** `vendor/abap-mcp-adt/` folder (typically `~/.claude/plugins/marketplaces/sc4sap/vendor/abap-mcp-adt/`), **NOT** the user's project directory.

- **⚠️ Path resolution (MANDATORY)**: the install target must be the plugin root, not the current working directory. Resolve the plugin root **dynamically** — never hardcode the path. This skill file lives at `<PLUGIN_ROOT>/skills/setup/SKILL.md`, so:
  - `PLUGIN_ROOT` = absolute path of this `SKILL.md`, then go up two levels (`../..`)
  - On Windows this will usually be `C:\Users\<user>\.claude\plugins\marketplaces\sc4sap`, but **derive it at runtime**, do not assume
- **Invocation**: always call the script with its **absolute path**, not a relative path, so CWD is irrelevant:
  ```bash
  node "<PLUGIN_ROOT>/scripts/build-mcp-server.mjs"
  ```
  The script itself uses `__dirname` to anchor `vendor/` next to itself, so once invoked with the absolute path it will always install into `<PLUGIN_ROOT>/vendor/abap-mcp-adt/` regardless of where the user ran Claude Code from.
- If already installed (launcher present at `<PLUGIN_ROOT>/vendor/abap-mcp-adt/dist/server/launcher.js`), skip (use `--update` to refresh)
- On failure, show error and guide user to manual install

## Step 4 — Profile Creation & SAP Connection

Full procedure: **[`wizard-step-04-profile-creation.md`](wizard-step-04-profile-creation.md)**. Collects `alias` + `SAP_TIER` + connection fields, then delegates write to `sap-profile-cli.mjs add` (profile env in `~/.sc4sap/profiles/<alias>/`, password in OS keychain, active pointer in `<project>/.sc4sap/active-profile.txt`). NO file is written under `<project>/.sc4sap/sap.env` or `<project>/.sc4sap/config.json`.

**4bis. RFC backend selection (MANDATORY — ask before Step 5)** — pick the transport for Screen / GUI Status / Text Element ops (soap / native / gateway / odata / zrfc) and run the backend-specific preflight. Full procedure lives in **[`rfc-backend-selection.md`](rfc-backend-selection.md)** — all `SAP_RFC_*` keys are written to the active profile env, never to the project folder.

## Step 5 — Reconnect MCP

Prompt user to reconnect via `/mcp`. The MCP server's `ReloadProfile` tool reads the active pointer + profile env (with keychain resolution) and refreshes its cached connection. No Claude Code restart is needed.

## Step 6 — Connection Test

Test SAP system connection via `GetSession`.

## Step 7 — Persist Connected System Info

Parse the `GetSession` response for System ID (SID), MANDT (client), BNAME (user), SPRAS (language). Display them for the user to confirm, then **write them into the active profile's `~/.sc4sap/profiles/<alias>/config.json` → `systemInfo`** (NOT the project folder).

Target shape in the profile's `config.json`:

```json
{
  "sapVersion": "S4",
  "abapRelease": "816",
  "industry": "other",
  "activeModules": ["FI", "CO", "MM", "SD", "PP"],
  "systemInfo": {
    "sid": "S4H",
    "client": "100",
    "user": "DEVUSER",
    "language": "EN",
    "capturedAt": "2026-04-21T12:34:56Z"
  }
}
```

Rules:
- Write `systemInfo` as a nested object. Merge with existing fields — do not overwrite the full file.
- `capturedAt` is an ISO timestamp so staleness can be detected later.
- If `GetSession` fails, skip this write and tell the user the HUD will fall back to reading `SAP_USERNAME` / `SAP_CLIENT` from the profile env (SID will be blank until a session succeeds).
- Re-run this step from `/sc4sap:sap-option` or by re-invoking `/sc4sap:setup` whenever the user connects to a different system. Each alias has its own `config.json` — data never crosses profiles.

## Step 8 — ADT Access Check

Run `GetInactiveObjects` to confirm ADT access rights.

## Step 9 — Create ABAP Utility Objects

Full procedure: **[`wizard-step-09-abap-objects.md`](wizard-step-09-abap-objects.md)**.

**Tier gate**: Step 9 runs ONLY when the active profile's `SAP_TIER=DEV`. On QA/PRD, it REFUSES and prints CTS import guidance (decision §4.2). DEV installs are deduped by `SAP_URL + SAP_CLIENT` — sibling DEV profiles on the same system reuse the install; sentinel lives at `~/.sc4sap/profiles/<alias>/.abap-utils-installed`.

Four bundles in `$TMP`: 9a (`ZMCP_ADT_UTILS` FMs) + 9b (ALV OOP handlers) + 9c (conditional — OData classes when `SAP_RFC_BACKEND=odata`) + 9d (conditional — ZRFC ICF handler when `SAP_RFC_BACKEND=zrfc`).

## Step 10 — Finalize Profile `config.json`

Write the remaining plugin-side fields into `~/.sc4sap/profiles/<alias>/config.json`:

- `sapVersion`, `abapRelease`, `industry`, `activeModules` — from Step 2
- `namingConvention` — either migrated from the legacy project `config.json` at Step 0 or freshly emitted defaults
- `blocklistProfile` — from Step 12 (L3 hook profile; written back here for HUD + sap-option display)
- `systemInfo` — already written at Step 7 (merge, don't overwrite)
- `activeTransport` — migrated from the legacy project `config.json` at Step 0, if any

The project folder NEVER has a `.sc4sap/config.json` in multi-profile mode (decision §4.3). Only `active-profile.txt` + `work/<alias>/` artifacts live there.

Keep the profile's `sap.env` and `config.json` in sync: `sapVersion` / `abapRelease` / `industry` / `activeModules` are duplicated on purpose — the MCP server reads the env; plugin-side components (HUD, PreToolUse hook, skills, agents) read the config JSON. `/sc4sap:sap-option edit` maintains both atomically.

## Steps 11 & 11b — Optional Extraction (SPRO + Customizations)

Full procedure: **[`wizard-step-11-optional-extraction.md`](wizard-step-11-optional-extraction.md)**. Both prompts optional. Artifacts land under `<project>/.sc4sap/work/<activeAlias>/` per [`../../common/multi-profile-artifact-resolution.md`](../../common/multi-profile-artifact-resolution.md). Execution detail: [`spro-auto-generation.md`](spro-auto-generation.md) and [`customization-auto-generation.md`](customization-auto-generation.md).

## Step 12 — 🔒 PreToolUse Hooks (L1, MANDATORY)

Full procedure: **[`wizard-step-12-blocklist-hook.md`](wizard-step-12-blocklist-hook.md)**. Installs BOTH `block-forbidden-tables.mjs` (row-extraction guard) and `tier-readonly-guard.mjs` (tier-based mutation guard) into `.claude/settings.json` (project-level, per decision §4.4). Not skippable. Setup cannot complete without Step 12 succeeding.

## Step 13 — Install HUD Status Line

Some Claude Code versions do not render plugin-declared `statusLine` entries unless the same block is present in `~/.claude/settings.json`. Run:

```bash
node "<PLUGIN_ROOT>/scripts/hud/install-statusline.mjs"
```

The installer is idempotent:
- If no `statusLine` exists → writes the sc4sap HUD entry.
- If a sc4sap entry already exists → refreshes it.
- If a **non-sc4sap** `statusLine` exists → leaves it alone and prints a warning; re-run with `--force` only if the user confirms they want to overwrite their custom status line.

After success, tell the user: "Restart Claude Code to see the HUD render below the input box." See `hud-statusline.md` for the full spec. The HUD reads `<project>/.sc4sap/active-profile.txt` + the profile env to render `{alias} [{tier}] {🔒 if readonly}`.

<SAP_Version_Reference>
When you need to explain ECC vs S/4HANA differences (tables, TCodes, BAPIs, development patterns) during setup or when routing follow-up questions, **read `common/sap-version-reference.md`** and apply the rules there. Do not duplicate the comparison table inline — the file is the single source of truth.
</SAP_Version_Reference>

<ABAP_Release_Reference>
When you need to reason about ABAP syntax availability for a given `ABAP_RELEASE` (e.g., whether inline declarations, RAP, or Open SQL expressions are allowed), **read `common/abap-release-reference.md`** and follow the rules there. Do not duplicate the feature matrix inline.
</ABAP_Release_Reference>
