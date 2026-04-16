# Setup Wizard Steps

Referenced by `SKILL.md` — this file is the **index** of the setup wizard. Heavy steps have been split into companion files in this same `skills/setup/` folder. Follow the links and read each step's file before asking the user the related question.

## Step 1 — Version Check

Verify Claude Code version compatibility.

## Step 2 — System Identification (SAP Version, ABAP Release, Industry)

Full procedure: **[`wizard-step-02-system-identification.md`](wizard-step-02-system-identification.md)**. Ask the three sub-questions one at a time; do not batch them.

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

## Step 4 — Configure SAP Connection

Ask user for SAP credentials and write `.sc4sap/sap.env`:
- `SAP_URL` (e.g., `https://your-sap-host:44300`)
- `SAP_CLIENT` (e.g., `100`)
- `SAP_AUTH_TYPE` (`basic` or `xsuaa`)
- `SAP_USERNAME` / `SAP_PASSWORD`
- `SAP_LANGUAGE` (default: `EN`)
- `SAP_SYSTEM_TYPE` (`onprem` or `cloud`)
- `SAP_VERSION` (`S4` or `ECC`) — from step 2
- `ABAP_RELEASE` (e.g., `750`, `756`, `758`) — from step 2; consumed by agents to gate ABAP syntax features
- `SAP_INDUSTRY` (e.g., `retail`, `cosmetics`, `automotive`, `other`) — from step 2; consumed by consultant agents to load `industry/<key>.md` for business-context analysis
- `TLS_REJECT_UNAUTHORIZED=0` (dev only, self-signed certs) — omit or unset in production
- `SC4SAP_MCP_AUTOBUILD=1` — auto-rebuild vendor MCP server when missing after a plugin version upgrade. Default `1` so users don't have to re-run `/sc4sap:setup mcp` after every version bump. Set to `0` to disable auto-build and require manual install.

**4bis. RFC backend selection (MANDATORY — ask before Step 5)** — pick the transport for Screen / GUI Status / Text Element ops (soap / native / gateway / odata) and run the backend-specific preflight. Full procedure lives in **[`rfc-backend-selection.md`](rfc-backend-selection.md)** — read that file and execute its steps before continuing to Step 5.

**Blocklist policy (optional, defaults to `standard`)** — this is the **MCP server-side guard (L4)** in `abap-mcp-adt-powerup`, read from env vars in `sap.env`. It is distinct from the **PreToolUse hook (L3)** configured in Step 12. Write these as commented examples so the user can uncomment as needed:

```
# Blocklist profile: minimal | standard | strict | off
#   minimal  — block only PII/credentials/banking
#   standard — minimal + Protected Business Data (ACDOCA, BKPF, VBAK, EKKO, ...)   [default]
#   strict   — standard + Audit/Security + Communication/Workflow
#   off      — disable the guard entirely (NOT recommended)
# MCP_BLOCKLIST_PROFILE=standard

# Comma-separated table names (or Z-patterns) to ALWAYS block, on top of the profile
# MCP_BLOCKLIST_EXTEND=ZHR_SALARY,ZCUSTOMER_PII

# Comma-separated table names to WHITELIST (audited bypass). Use sparingly.
# MCP_ALLOW_TABLE=ACDOCA
```

Do not set `MCP_BLOCKLIST_PROFILE` unless the user explicitly asks to loosen or tighten the default. `standard` is the safe default.

## Step 5 — Reconnect MCP

Prompt user to reconnect via `/mcp` so the newly installed server starts.

## Step 6 — Connection Test

Test SAP system connection via `GetSession`.

## Step 7 — Persist Connected System Info

Parse the `GetSession` response for System ID (SID), MANDT (client), BNAME (user), and SPRAS (language). Display them for the user to confirm, then **write them into `.sc4sap/config.json` → `systemInfo`** so the HUD second line and `/sc4sap:sap-option status` can render the SID/client/user without needing a live MCP call on every refresh.

Target shape in `config.json`:
```json
{
  "sapVersion": "S4",
  "abapRelease": "758",
  "industry": "cosmetics",
  "systemInfo": {
    "sid": "S4H",
    "client": "100",
    "user": "DEVUSER",
    "language": "EN",
    "capturedAt": "2026-04-15T12:34:56Z"
  }
}
```

Rules:
- Write `systemInfo` as a nested object, not a flat prefix. Merge with existing fields — do not overwrite the full file.
- `capturedAt` is an ISO timestamp so staleness can be detected later.
- If `GetSession` fails, skip this write and tell the user the HUD will fall back to reading SAP_USERNAME/SAP_CLIENT from `sap.env` (SID will be blank until a session succeeds).
- Re-run this step from `/sc4sap:sap-option` or by re-invoking `/sc4sap:setup` whenever the user connects to a different system.

## Step 8 — ADT Access Check

Run `GetInactiveObjects` to confirm ADT access rights.

## Step 9 — Create ABAP Utility Objects

Full procedure: **[`wizard-step-09-abap-objects.md`](wizard-step-09-abap-objects.md)**. Three bundles (9a/9b/9c) installed in `$TMP`.

## Step 10 — Write `.sc4sap/config.json`

Include `sapVersion`, `abapRelease`, and `industry` fields, and preserve the `systemInfo` block written in step 7 (merge, don't overwrite).
- Note: `sapVersion` / `abapRelease` / `industry` are **duplicated** in `sap.env` (step 4) on purpose. `sap.env` is consumed by the MCP server process; `config.json` is consumed by plugin-side components (HUD, PreToolUse hook, agents, SPRO cache, consultant agents reading `industry/*.md`). Keep both in sync when the user changes them via `/sc4sap:sap-option`.
- `systemInfo` is **not** duplicated in `sap.env` — it represents what the system actually reported, not what the user typed, so it only lives in `config.json`.

## Steps 11 & 11b — Optional Extraction (SPRO + Customizations)

Full procedure: **[`wizard-step-11-optional-extraction.md`](wizard-step-11-optional-extraction.md)**. Both prompts are optional. See also [`spro-auto-generation.md`](spro-auto-generation.md) and [`customization-auto-generation.md`](customization-auto-generation.md) for execution details.

## Step 12 — 🔒 Data Extraction Blocklist (PreToolUse Hook, L3, MANDATORY)

Full procedure: **[`wizard-step-12-blocklist-hook.md`](wizard-step-12-blocklist-hook.md)**. Not skippable. Setup cannot complete without this step succeeding.

## Step 13 — Install HUD Status Line

Some Claude Code versions do not render plugin-declared `statusLine` entries unless the same block is present in `~/.claude/settings.json`. Run:

```bash
node "<PLUGIN_ROOT>/scripts/hud/install-statusline.mjs"
```

The installer is idempotent:
- If no `statusLine` exists → writes the sc4sap HUD entry.
- If a sc4sap entry already exists → refreshes it.
- If a **non-sc4sap** `statusLine` exists → leaves it alone and prints a warning; re-run with `--force` only if the user confirms they want to overwrite their custom status line.

After success, tell the user: "Restart Claude Code to see the HUD render below the input box." See `hud-statusline.md` for the full spec.

<SAP_Version_Reference>
When you need to explain ECC vs S/4HANA differences (tables, TCodes, BAPIs, development patterns) during setup or when routing follow-up questions, **read `common/sap-version-reference.md`** and apply the rules there. Do not duplicate the comparison table inline — the file is the single source of truth.
</SAP_Version_Reference>

<ABAP_Release_Reference>
When you need to reason about ABAP syntax availability for a given `ABAP_RELEASE` (e.g., whether inline declarations, RAP, or Open SQL expressions are allowed), **read `common/abap-release-reference.md`** and follow the rules there. Do not duplicate the feature matrix inline.
</ABAP_Release_Reference>
