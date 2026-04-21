# Profile Management (Multi-environment)

Extends `sap-option` with multi-connection support: Dev / QA / Prod across one or more companies share a single Claude Code session. The active profile is stored per project; profile definitions are stored per user.

## When to use

Route here when the user says:
- "switch to KR-QA", "change to PRD", "switch profile", "use the QA system"
- "list profiles", "show profiles", "which profiles do I have"
- "add a new profile", "register another system", "add KR-DEV"
- "remove profile", "delete KR-QA profile"
- "edit KR-DEV", "change the password for KR-DEV"

## Storage layout

```
~/.sc4sap/profiles/<alias>/sap.env        # user-level (shared across repos)
~/.sc4sap/profiles/<alias>/config.json    # user-level
~/.sc4sap/profiles/.trash/<alias>-<ts>/   # soft-deleted, auto-purged after 7 days

<project>/.sc4sap/active-profile.txt      # project-level pointer (alias only)
<project>/.sc4sap/work/<alias>/...        # project artifacts, per-profile
```

`SAP_TIER` enum: `DEV` | `QA` | `PRD`. Non-canonical tiers (SBX, STG, PRE-PRD, TRN) are mapped: SBX→DEV, STG/PRE-PRD→PRD, INT/TRN→QA.

## Switch — interactive flow

1. Read all profile directories under `~/.sc4sap/profiles/` (skip `.trash/`).
2. Read `<project>/.sc4sap/active-profile.txt` to mark the current one.
3. Call `AskUserQuestion`:
   - `question`: "Which profile do you want to switch to?"
   - One option per profile. `label`: alias + ` ● current` if active. `description`: `tier={tier} • host={SAP_URL} • client={SAP_CLIENT} • user={SAP_USERNAME}`.
   - `preview`: rendered connection panel + tools-allowed matrix for that tier (see `<Preview_Panel>` below).
4. On selection:
   - Write the alias to `<project>/.sc4sap/active-profile.txt`.
   - Call `mcp__sap__ReloadProfile` via MCP. Expect `{ ok: true, alias, tier, readonly, host, client }`.
   - Confirm to user: `✔ Switched to <alias> (tier={tier}, readonly={readonly})`.

If the user passes an alias as an argument (`sap-option switch KR-QA`), skip the picker and just perform the switch + reload.

## List

Render a compact table sorted by alias:

```
Alias      Tier   Host                         Current
─────────────────────────────────────────────────────
KR-DEV     DEV    dev.kr.corp:50000            ●
KR-QA      QA     qa.kr.corp:50000             
KR-PRD     PRD    prd.kr.corp:50000  🔒        
US-DEV     DEV    dev.us.corp:50000            
```

Always show the lock icon `🔒` for `tier != DEV`.

## Add — wizard

Multi-step. Use `AskUserQuestion` where the answer is a small enum; otherwise use free-form input via `AskUserQuestion` → "Other" so the user types.

1. **alias** — free text. Validate `^[A-Z0-9_-]+$`. Must not already exist. Suggest convention `{COMPANY}-{TIER}` (e.g. `KR-DEV`, `US-PRD`).
2. **tier** — single-select `DEV` | `QA` | `PRD`. Explain that QA/PRD are automatically read-only.
3. **same-company detection** — if any existing profile shares a prefix (dash-segmented) with the new alias (e.g. `KR-*` when adding `KR-QA`), ask: "Copy industry/modules/naming from KR-DEV?". Default yes. Copied fields: `SAP_INDUSTRY`, `SAP_ACTIVE_MODULES`, `SAP_LANGUAGE`, `SAP_VERSION`, `ABAP_RELEASE`, `MCP_BLOCKLIST_PROFILE`, and the whole `namingConvention` block in `config.json`.
4. **host / client / user** — free-form. Validate:
   - `SAP_URL`: `^https?://`, no trailing slash.
   - `SAP_CLIENT`: exactly 3 digits.
   - `SAP_USERNAME`: non-empty.
5. **password** — free-form, NEVER display. After capture, invoke the bundled node helper to store in OS keychain under service `sc4sap` and account `<alias>/<username>`. Write `SAP_PASSWORD=keychain:sc4sap/<alias>/<username>` in the env file. If keychain is unavailable (headless / Docker), offer plaintext fallback with an explicit warning and write the plaintext value.
6. **description** (optional) — free-form short label, stored as `SAP_DESCRIPTION`.
7. Write files:
   - `~/.sc4sap/profiles/<alias>/sap.env` (0600 if platform supports)
   - `~/.sc4sap/profiles/<alias>/config.json` with `sapVersion`, `industry`, `activeModules`, copied `namingConvention`
8. Offer to switch to the new profile immediately.

## Remove — safety flow

1. Refuse if the alias is the currently active profile. Ask the user to `switch` away first.
2. Show what will be removed: profile directory path, artifacts count (under `<project>/.sc4sap/work/<alias>/`), keychain entry.
3. Ask the user to type the alias verbatim via `AskUserQuestion` → "Other". Compare case-sensitively. Abort on mismatch.
4. Move `~/.sc4sap/profiles/<alias>/` → `~/.sc4sap/profiles/.trash/<alias>-<ISO-timestamp>/`. Do NOT touch per-project artifacts under `work/<alias>/` — they belong to the project and removal is the user's separate decision.
5. Ask whether to delete the keychain entry. Default yes.
6. Report: `✔ Archived to .trash. Permanent purge in 7 days (or via sap-option purge).`

## Edit

Same wizard as `add` but pre-fills current values. Tier is **immutable** via this path — to change tier, the user must `remove` and `add`. This prevents accidentally downgrading a PRD profile to DEV. Password edits re-prompt and rewrite the keychain entry.

## Purge

`sap-option purge` walks `~/.sc4sap/profiles/.trash/` and permanently deletes entries older than 7 days. `--all` deletes everything in `.trash/` with a single confirmation. Orphan keychain entries for purged profiles are also removed.

## Migration of legacy `<project>/.sc4sap/sap.env`

Trigger on first `sap-option` invocation when a legacy `.sc4sap/sap.env` exists AND no `<project>/.sc4sap/active-profile.txt` AND no `~/.sc4sap/profiles/` directory. See `migration.md`.

## Preview_Panel

For `AskUserQuestion` previews during `switch`, render a panel that shows both connection and the allowed-tools matrix:

```
Switch to KR-QA

┌─ Connection ────────────────────────────┐
│ host    qa.kr.corp:50000                │
│ client  200                             │
│ user    QA_TESTER                       │
│ lang    EN                              │
│ tier    QA          🔒  READONLY        │
│ cts     — (readonly tier)               │
└─────────────────────────────────────────┘
┌─ Tools allowed ─────────────────────────┐
│ Create/Update/Delete   ✗  blocked        │
│ CreateTransport        ✗  blocked        │
│ RunUnitTest            ✓                 │
│ RuntimeRun*            ✗  blocked        │
│ Get/Read/Search        ✓                 │
└─────────────────────────────────────────┘
```

## Invariants

- Never display `SAP_PASSWORD` in any form — even in logs, confirmation prompts, or error messages.
- Never modify the Tier field of an existing profile through `edit`.
- Never auto-name a profile `default`. If an alias is not provided, always ask.
- After any mutation to a profile (add / edit / remove), if the mutated profile is the ACTIVE one, call `mcp__sap__ReloadProfile` so the MCP server picks up the change in-session.
- After `switch`, HUD must re-render with the new alias + tier badge (see `../hud.md` / HUD section of SKILL.md).
