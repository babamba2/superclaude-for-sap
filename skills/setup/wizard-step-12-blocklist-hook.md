# Wizard Step 12 — 🔒 Data Extraction Blocklist (PreToolUse Hook, L3)

Referenced by [`wizard-steps.md`](wizard-steps.md). **MANDATORY — not skippable.** Install the Claude Code `PreToolUse` hook that blocks row extraction from sensitive tables *before* the MCP call is even made.

> **Two-layer model — do not conflate:**
> - **L3 (this step)** = Claude Code PreToolUse hook, config in `.sc4sap/config.json` → `blocklistProfile`. Values: `strict` | `standard` | `minimal` | `custom`. Fires for any Claude Code session regardless of which MCP server is in use.
> - **L4 (step 4, optional)** = MCP server internal guard, config in `sap.env` → `MCP_BLOCKLIST_PROFILE`. Values: `minimal` | `standard` | `strict` | `off`. Applies only to `abap-mcp-adt-powerup`.
>
> They enforce similar intent but are **independent**. Typical setups run L3 on `strict` (the default) and leave L4 on `standard`. A user can change L3 here (or by editing `config.json`); L4 is changed via `/sc4sap:sap-option`.

## Step A — Profile Selection

Ask the user to choose a blocklist scope:

```
🔒 Select a data-extraction blocklist profile (required to complete setup).

  1) strict   — block everything (recommended default)
                PII + credentials + HR + transactional tables (VBAK/BKPF/...)
                + audit logs / workflow

  2) standard — PII + credentials + HR + transactional tables (VBAK/BKPF/ACDOCA/...)
                audit logs / workflow allowed

  3) minimal  — block only PII + credentials + HR + Tax
                general business transaction tables allowed

  4) custom   — ignore built-in list; apply only the tables listed in
                .sc4sap/blocklist-custom.txt

Any profile merges in extra entries from .sc4sap/blocklist-extend.txt if present.
```

- Accept: `strict` / `standard` / `minimal` / `custom` (or 1/2/3/4)
- Write the chosen value to `.sc4sap/config.json` as `blocklistProfile`
- If `custom`: prompt user to create `.sc4sap/blocklist-custom.txt` now (one table name or pattern per line) or after setup; warn that an empty custom list means no enforcement at L3

## Step B — Install the Hook (mandatory)

Run `node scripts/install-hooks.mjs` (defaults to user-level `~/.claude/settings.json`).
- If the user prefers project-level enforcement: `node scripts/install-hooks.mjs --project`
- On success, report: "✅ PreToolUse hook installed. Profile: {profile}"

## Step C — Verification (smoke test)

Pipe a BNKA test payload to the hook script and confirm it returns a `deny` decision. Example (bash):

```bash
echo '{"tool_name":"mcp__plugin_sc4sap_sap__GetTableContents","tool_input":{"table_name":"BNKA"}}' \
  | node scripts/hooks/block-forbidden-tables.mjs
```

Expected: JSON containing `"permissionDecision":"deny"` in `hookSpecificOutput`. If not, halt setup and surface the error. (The hook matches tool names by substring — any name containing `GetTableContents` or `GetSqlQuery` works.)

## Step D — Final Confirmation

- Print profile, extend file path (exists? yes/no), custom file path (for custom mode), and the full settings.json hook entry.
- Remind the user they can change the **L3 hook profile** anytime by re-running `/sc4sap:setup` or editing `.sc4sap/config.json` → `blocklistProfile`.
- For the **L4 MCP-server profile** (`MCP_BLOCKLIST_PROFILE` in `sap.env`), direct them to `/sc4sap:sap-option`.

Setup cannot complete without Step 12 succeeding. If the hook install fails (no node, permission error, etc.), stop and report — do not mark setup as done.
