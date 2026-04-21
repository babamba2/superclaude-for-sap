# Legacy Single-Profile Migration

When a project still has `<cwd>/.sc4sap/sap.env` but no `active-profile.txt` and no user-level profiles, the plugin is in the legacy state. A SessionStart banner reminds the user; `sap-option` also drives the migration when invoked.

## Trigger

Run the migration flow when ANY of the following are true:

1. `scripts/legacy-migration-banner.mjs` reported the state (user saw the SessionStart message).
2. User says "migrate sap.env", "migrate to multi-profile", "upgrade my sap config".
3. On any `sap-option` invocation, call `node $PLUGIN_ROOT/scripts/sap-profile-cli.mjs detect-legacy`; if the JSON has `needsMigration: true`, offer the migration flow before anything else.

## Flow

Before writing anything, render an explanation panel:

```
⚙  sc4sap upgrade detected — multi-profile connection support is active.

Legacy .sc4sap/sap.env found. This wizard moves your current connection
into a named profile so you can later add QA / PRD / other companies.

Nothing is deleted:
  • original .sc4sap/sap.env → .sc4sap/sap.env.legacy (rollback)
  • password moves to OS keychain (if available)
  • activeTransport + systemInfo in config.json are preserved

You can add more profiles later with `sap-option add`.
```

Then ask the user two questions via `AskUserQuestion`:

### Q1 — alias

- `question`: "What alias should this connection use? (example: KR-DEV, KR-PRD)"
- Offer 2–4 suggestions derived from what the legacy env reveals. Rules:
  - If `SAP_SYSTEM_TYPE=onprem` and `SAP_INDUSTRY` set, suggest `{COUNTRY?}-DEV` — ask country if not inferable.
  - Always include an "Other" slot for free-form input.
- Reject invalid characters (`^[A-Z0-9_-]+$`). If the user supplies lowercase, upcase silently.
- **Never auto-name `default`.** The user must pick something meaningful because multinational customers may have several.

### Q2 — tier

- `question`: "Which tier is this connection?"
- Options: `DEV` (writable), `QA` (read + unit tests), `PRD` (strict read-only). Explain the matrix briefly in the description fields.

## Execute

Invoke the CLI with the captured values on stdin:

```bash
echo '{"alias":"KR-DEV","tier":"DEV"}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/sap-profile-cli.mjs" migrate
```

Expected JSON response:

```json
{
  "ok": true,
  "alias": "KR-DEV",
  "tier": "DEV",
  "profileDir": "~/.sc4sap/profiles/KR-DEV",
  "archived": "<cwd>/.sc4sap/sap.env.legacy",
  "passwordStored": "keychain" | "plaintext-fallback" | "none"
}
```

- `passwordStored: "keychain"` — password is in the OS keychain; `SAP_PASSWORD` in the profile env is a `keychain:` reference.
- `passwordStored: "plaintext-fallback"` — keychain was unavailable (headless / missing `@napi-rs/keyring`). The password is plaintext in the profile env. **Tell the user explicitly** and suggest re-running once `@napi-rs/keyring` is installable.
- `passwordStored: "none"` — the legacy env had no `SAP_PASSWORD`.

## After migration

1. Call `mcp__sap__ReloadProfile` so the MCP server picks up the new env without a session restart.
2. Confirm success to the user:
   ```
   ✔ Migrated → KR-DEV (tier=DEV)
      profile: ~/.sc4sap/profiles/KR-DEV/
      backup:  <cwd>/.sc4sap/sap.env.legacy
   ```
3. Remind the user how to add more profiles:
   ```
   ℹ  Add another company or tier with:  /sc4sap:sap-option → Add profile
       (e.g., KR-QA, KR-PRD, US-DEV)
   ```

## Rollback

If the user regrets the migration before adding other profiles:

```bash
mv .sc4sap/sap.env.legacy .sc4sap/sap.env
rm .sc4sap/active-profile.txt
rm -rf ~/.sc4sap/profiles/<alias>
# If password was stored in keychain:
echo '{"service":"sc4sap","account":"<alias>/<user>"}' \
  | node "$CLAUDE_PLUGIN_ROOT/scripts/sap-profile-cli.mjs" keychain-delete
```

This restores the pre-upgrade state exactly. Don't perform this automatically — only describe when user asks.

## Edge cases

- **Legacy `sap.env` + profiles already exist** — `detect-legacy` returns `needsMigration: false`. Do NOT offer migration; instead tell the user they can either `sap-option switch` to an existing profile or manually `rm .sc4sap/sap.env` if it's truly stale.
- **User runs migration twice** — the CLI refuses with `profile already exists: <alias>` (exit 4). Tell the user to either pick a different alias or remove the existing profile first.
- **Legacy `sap.env` has no `SAP_PASSWORD`** — normal; pass the migration through with `passwordStored: "none"`. Tell the user to add the password via `sap-option edit` afterwards.
- **`config.json` present** — the CLI copies it into the new profile directory. The project-local `.sc4sap/config.json` is left untouched (some project-specific state like `activeTransport` may still be referenced by other skills).
