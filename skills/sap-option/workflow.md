# Workflow

1. **Locate** `.sc4sap/sap.env`. If missing, stop and direct the user to `/sc4sap:setup`.

2. **Parse** existing values with a simple `KEY=VALUE` reader. Preserve:
   - comment lines (`#`)
   - blank lines
   - unmanaged keys (pass through untouched on write)

3. **Render the status snapshot** (see `<Status_Snapshot>` in SKILL.md) — pull `GetSession` and `GetInactiveObjects` via the MCP server, merge with file values, show the compact panel. If the user's intent is status-only (`status` / `show` / `hud`), STOP here.

4. **Display full editor table** of managed key values. **MASK secrets**:
   - `SAP_PASSWORD`, `XSUAA_CLIENT_SECRET` → show `***` with length in parens (e.g. `*** (11 chars)`)
   - Never echo plaintext secrets, even if the user asks.
   - Commented-out keys (e.g. `# MCP_BLOCKLIST_PROFILE=standard`) → show as *(commented, default: standard)*.

5. **Ask** the user which key(s) to change. Accept:
   - A single key name
   - Multiple keys
   - "all" — walk each managed key one by one
   - "blocklist" — step through only the `MCP_BLOCKLIST_*` / `MCP_ALLOW_TABLE` group
   - "connection" — step through `SAP_*` credentials only
   - "industry" — shortcut into industry-selection.md flow
   - "status" / "hud" — return to the status snapshot only (re-render step 3)

6. **For each key to change:**
   - Show the current value (masked if secret).
   - Show allowed values / format (see `<Managed_Keys>` + `<Validation>` in SKILL.md).
   - Ask for the new value. Accept `-` or empty input to leave unchanged; accept `unset` / `remove` / `comment` to comment the line out with `# ` prefix.
   - Validate per `<Validation>`. If invalid, reject and re-prompt.

7. **Preview diff** — show a Before/After block of only the lines that will change. Mask secret values in both columns.

8. **Confirm** — ask `Apply changes? (y/N)`. On `n`, abort without writing.

9. **Backup + write** — copy existing `sap.env` to `sap.env.bak` (overwrite previous backup), then write the new content atomically (write to `sap.env.tmp` then rename).

10. **Advise reconnection** — remind the user to run `/mcp` → reconnect `plugin:sc4sap:sap` for changes to take effect. Changes to `sap.env` are not hot-reloaded.

11. **Report** — list the keys changed, indicate backup path, and state "Please reconnect MCP (`/mcp`) to apply."
