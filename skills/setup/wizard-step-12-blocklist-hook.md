# Wizard Step 12 — 🔒 PreToolUse Hooks (Blocklist + Tier Readonly Guard, L1)

Referenced by [`wizard-steps.md`](wizard-steps.md). **MANDATORY — not skippable.** Install TWO Claude Code `PreToolUse` hooks:

1. **`block-forbidden-tables.mjs`** — blocks row extraction from sensitive tables (`GetTableContents` / `GetSqlQuery`) before the MCP call.
2. **`tier-readonly-guard.mjs`** — blocks mutations (`Create*` / `Update*` / `Delete*`) + code execution (`RunUnitTest`, `RuntimeRun*WithProfiling`) when the active profile is `QA` or `PRD`. Layer 1 of the two-layer tier defense (MCP server guard = Layer 2).

> **Defense-in-depth model — do not conflate:**
> - **L1 (this step, row-extraction)** = Claude Code PreToolUse hook, config in `.sc4sap/config.json` → `blocklistProfile`. Values: `strict` | `standard` | `minimal` | `custom`. Fires regardless of MCP server.
> - **L1 (this step, tier)** = Claude Code PreToolUse hook, reads `SAP_TIER` from the active profile's `sap.env` every call (stateless).
> - **L2 (MCP server)** = `abap-mcp-adt-powerup` internal guard. For row extraction: `sap.env` → `MCP_BLOCKLIST_PROFILE`. For tier: `@readonly(tier)` decorator set at `ReloadProfile` time. Uncircumventable.
>
> Both hooks fail OPEN on IO/parse errors (the L2 MCP guard still enforces); the L1 hooks exist to give faster, contextual rejection before a wire request is sent.

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

## Step B — Install BOTH hooks (mandatory)

Per decision §4.4, install at the **project level** (`.claude/settings.json`):

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/install-hooks.mjs" --project
```

The installer is idempotent and registers both `block-forbidden-tables.mjs` and `tier-readonly-guard.mjs`. Pre-existing single-hook installs are preserved — the tier guard is appended, not substituted.

On success, report: `"✅ PreToolUse hooks installed (block-forbidden-tables + tier-readonly-guard). Blocklist profile: {profile}"`

## Step C — Verification (smoke tests — BOTH hooks)

### C.1 — block-forbidden-tables

```bash
echo '{"tool_name":"mcp__plugin_sc4sap_sap__GetTableContents","tool_input":{"table_name":"BNKA"}}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/block-forbidden-tables.mjs"
```

Expected: JSON with `"permissionDecision":"deny"` in `hookSpecificOutput`.

### C.2 — tier-readonly-guard

Skip actively testing when the active profile is `DEV` (the guard should return `allow`, which is indistinguishable from the hook being absent at this step). Instead, emit a dry-run diagnostic: write a temporary fake active pointer to a scratch dir pointing at a synthetic `QA` profile, pipe an `UpdateClass` payload, confirm `deny`:

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.sc4sap" "$HOME/.sc4sap/profiles/_SMOKE_QA"
printf '_SMOKE_QA' > "$TMP/.sc4sap/active-profile.txt"
printf 'SAP_TIER=QA\nSAP_URL=http://x\nSAP_CLIENT=100\n' > "$HOME/.sc4sap/profiles/_SMOKE_QA/sap.env"
( cd "$TMP" && echo '{"tool_name":"mcp__plugin_sc4sap_sap__UpdateClass","tool_input":{}}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/hooks/tier-readonly-guard.mjs" )
# Cleanup
rm -rf "$TMP" "$HOME/.sc4sap/profiles/_SMOKE_QA"
```

Expected: `"permissionDecision":"deny"` with a `reason` referencing the QA tier. If the response is `allow`, the hook is not resolving the pointer correctly — halt setup and diagnose.

If either smoke test fails, halt setup and surface the error.

## Step D — Final Confirmation

- Print: blocklist profile, extend file path (exists? y/n), custom file path (for custom mode), and the `.claude/settings.json` hook entries for BOTH hooks.
- Remind the user:
  - The **row-extraction L1 hook** can be re-tuned by re-running `/sc4sap:setup` or editing `.sc4sap/config.json` → `blocklistProfile`.
  - The **tier guard L1 hook** reads `SAP_TIER` from the active profile every call — no setting to tune; changing tier requires profile remove+add via `/sc4sap:sap-option`.
  - The **L2 MCP-server profile** (`MCP_BLOCKLIST_PROFILE` in the profile's `sap.env`) is managed via `/sc4sap:sap-option`.

Setup cannot complete without Step 12 succeeding. If either hook install or smoke test fails (no node, permission error, path resolution bug, etc.), stop and report — do not mark setup as done.
