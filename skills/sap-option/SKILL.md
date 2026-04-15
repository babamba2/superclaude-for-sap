---
name: sc4sap:sap-option
description: View SAP system status snapshot and edit values in `.sc4sap/sap.env` (connection, blocklist) and HUD usage limits in `~/.claude/settings.json` → `env` — single entrypoint for all sc4sap runtime options
level: 2
---

# SC4SAP Option

Single entrypoint to **inspect live SAP state** and **edit the values stored in `.sc4sap/sap.env`** — the dotenv file that holds SAP connection credentials, TLS settings, and the `abap-mcp-adt-powerup` blocklist policy for row-extraction safety.

<Purpose>
`sap.env` is the single source of truth for per-user runtime configuration of the sc4sap MCP server. This skill also replaces the former `/sc4sap:hud` snapshot: before editing, it shows a compact status panel (system ID, client, user, inactive object count, active transport, blocklist profile) so the user can confirm which system they are about to change settings for.

Users should not edit `sap.env` blindly; this skill surfaces the current values (masking secrets), explains each option, lets the user pick what to change, and writes the file back safely with a backup.
</Purpose>

<Use_When>
- User says "sap option", "show sap.env", "change SAP password", "switch SAP client", "change the blocklist profile", "loosen blocklist", "whitelist ACDOCA", "view SAP config", "SAP options".
- User says "change the industry", "change industry", "switch industry", "switch to retail", "switch to cosmetics" — route to the **Industry selection** flow described in `<Industry_Selection>` (updates `SAP_INDUSTRY` in `sap.env` and `industry` in `config.json` atomically).
- User says "hud", "show status", "show system info", "current SAP status", "which system am I connected to" — run the status snapshot (workflow step 3) and stop there unless the user then asks to edit.
- User wants to change blocklist tier (`MCP_BLOCKLIST_PROFILE`) or manage `MCP_ALLOW_TABLE` / `MCP_BLOCKLIST_EXTEND`.
- User is rotating credentials, moving to a new SAP system, or flipping language/client.
- After `/sc4sap:setup` if the user wants to adjust without re-running full setup.
- User says "hud limit", "5h limit", "weekly limit", "extra limit", "usage budget", "configure limit" — route to the **HUD limits** flow (see `<HUD_Limits>`), which edits `~/.claude/settings.json` → `env`, not `sap.env`.
</Use_When>

<Status_Snapshot>
When invoked with `status` / `show` / `hud` (or as the preamble to any edit flow), render this panel. Keep it compact — roughly 10–14 lines — and silence sections that can't be fetched (e.g. MCP disconnected) rather than failing.

Contents (only show rows you could resolve):
- **System**: `<SID>` · client `<MANDT>` · user `<BNAME>` · lang `<SPRAS>`   *(from `GetSession`)*
- **Connection**: `<SAP_URL>` · auth `<SAP_AUTH_TYPE>` · type `<SAP_SYSTEM_TYPE>` · version `<SAP_VERSION>` · ABAP `<ABAP_RELEASE>`
- **Industry**: `<SAP_INDUSTRY or "(not set)">` — drives which `industry/*.md` consultant agents load
- **Inactive objects**: `<count>` (0 = green, >0 = red)   *(from `GetInactiveObjects`)*
- **Active transport (pinned)**: `<TRKORR> — <description>` if present in `config.json` → `activeTransport`, else "-"
- **Blocklist (L4, MCP env)**: profile `<MCP_BLOCKLIST_PROFILE or "standard (default)">` · extend `<n>` entries · allow `<n>` entries
- **Blocklist (L3, PreToolUse hook)**: profile `<config.json blocklistProfile>` · extend/custom file presence
- **sap.env path**: absolute path being edited

If the user's intent is **status-only** (they just said "hud" / "show status"), render the panel and stop. Do not ask follow-up "what to change" questions unless the user continues.
</Status_Snapshot>

<File_Path>
- **Plugin install path**: `${CLAUDE_PLUGIN_ROOT}/.sc4sap/sap.env`
- Typical absolute path on Windows: `C:\Users\<user>\.claude\plugins\cache\sc4sap\sc4sap\<version>\.sc4sap\sap.env`
- If the file does not exist, tell the user to run `/sc4sap:setup` first. Do NOT create it from scratch here — setup handles the initial interactive credential flow.
</File_Path>

<Managed_Keys>
Connection (required):
- `SAP_URL`                — SAP host URL including port (e.g. `https://host:44300`)
- `SAP_CLIENT`             — 3-digit client (e.g. `100`)
- `SAP_AUTH_TYPE`          — `basic` | `xsuaa`
- `SAP_USERNAME`           — SAP user ID
- `SAP_PASSWORD`           — **secret — always mask when displaying**
- `SAP_LANGUAGE`           — `EN`, `DE`, `KO`, ...
- `SAP_SYSTEM_TYPE`        — `onprem` | `cloud` | `legacy`
- `SAP_VERSION`            — `S4` | `ECC`
- `ABAP_RELEASE`           — e.g. `756`, `758`
- `SAP_INDUSTRY`           — one of the 15 keys in `industry/README.md` (`retail` | `fashion` | `cosmetics` | `tire` | `automotive` | `pharmaceutical` | `food-beverage` | `chemical` | `electronics` | `construction` | `steel` | `utilities` | `banking` | `public-sector` | `other`). **Mirrored** to `.sc4sap/config.json` → `industry` whenever changed — both writes must succeed or neither.
- `TLS_REJECT_UNAUTHORIZED` — `0` (accept self-signed, dev only) or unset

Blocklist policy (optional — guard for `GetTableContents` / `GetSqlQuery`):
- `MCP_BLOCKLIST_PROFILE`  — `minimal` | `standard` | `strict` | `off`  (default: `standard`)
- `MCP_BLOCKLIST_EXTEND`   — comma-separated extra table names / patterns (always denied)
- `MCP_ALLOW_TABLE`        — comma-separated whitelist for audited bypass

XSUAA (only when `SAP_AUTH_TYPE=xsuaa`):
- `XSUAA_URL`, `XSUAA_CLIENT_ID`, `XSUAA_CLIENT_SECRET`, `XSUAA_TOKEN_URL`

Do not manage keys that are not in this list — warn the user and skip.
</Managed_Keys>

<Workflow>
See [workflow.md](workflow.md).
</Workflow>

<Industry_Selection>
See [industry-selection.md](industry-selection.md).
</Industry_Selection>

<HUD_Limits>
See [hud-limits.md](hud-limits.md).
</HUD_Limits>

<Validation>
- `SAP_URL`: must match `^https?://[^ ]+` and not end with `/`.
- `SAP_CLIENT`: exactly 3 digits.
- `SAP_AUTH_TYPE`: one of `basic` | `xsuaa`.
- `SAP_LANGUAGE`: 2-letter uppercase.
- `SAP_SYSTEM_TYPE`: one of `onprem` | `cloud` | `legacy`.
- `SAP_VERSION`: one of `S4` | `ECC`.
- `ABAP_RELEASE`: 3-digit numeric (e.g. `750`, `756`).
- `SAP_INDUSTRY`: must be one of the 15 canonical keys listed in `<Managed_Keys>`. Reject unknown values; offer the selection menu from `<Industry_Selection>`. Lowercase, hyphen-separated (e.g., `food-beverage`, not `Food_Beverage`).
- `TLS_REJECT_UNAUTHORIZED`: `0` or unset. Warn that `0` is dev-only.
- `MCP_BLOCKLIST_PROFILE`: one of `minimal` | `standard` | `strict` | `off`. If user chooses `off`, require explicit confirmation ("This disables ALL row-extraction guards. Type `I UNDERSTAND` to proceed.").
- `MCP_BLOCKLIST_EXTEND` / `MCP_ALLOW_TABLE`: comma-separated uppercase table names (`[A-Z0-9_*]+` allowed; `*` is glob). Strip whitespace around commas.
- When adding to `MCP_ALLOW_TABLE`, explicitly warn that each entry is audited to stderr and is a soft bypass of the blocklist — user should remove entries when no longer needed.
- `SAP_PASSWORD`: no validation on content (may contain anything), but refuse empty.
</Validation>

<Security>
- Never print secrets (`SAP_PASSWORD`, `XSUAA_CLIENT_SECRET`) in chat output, diffs, logs, or confirmation prompts. Always mask.
- Never copy `sap.env` to any location outside `.sc4sap/` — no uploads to Notion, no pastes into issues.
- After writing, do not display the final file contents. Only summarize which keys changed.
- The backup `sap.env.bak` contains secrets — mention its existence but do not open/read it back to the user.
</Security>

<Edge_Cases>
- **File missing** → stop, direct to `/sc4sap:setup`. Do not create.
- **File has syntax errors** (lines that are not `KEY=VALUE` or comments) → show the offending lines, ask user to clean manually, abort.
- **User wants to add a key not in `<Managed_Keys>`** → warn, ask to confirm adding as a custom key (append at end with a `# custom` comment). Do not validate content.
- **User wants to remove a required connection key** (e.g. `SAP_URL`) → refuse; required keys can only be changed, not removed.
- **Plugin is launched from `marketplaces/` source tree** (dev mode) rather than `cache/` → still look up `.sc4sap/sap.env` relative to the plugin root; if both exist, prefer the one under the currently-running plugin directory and tell the user which path was edited.
</Edge_Cases>

<Standalone_TUI>
See [standalone-tui.md](standalone-tui.md).
</Standalone_TUI>

<Examples>
See [examples.md](examples.md).
</Examples>
