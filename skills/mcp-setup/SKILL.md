---
name: sc4sap:mcp-setup
description: Guide to install and configure the abap-mcp-adt-powerup MCP server for SAP ADT connectivity
level: 2
model: haiku
---

# SC4SAP MCP Setup

Guides you through installing and configuring the `abap-mcp-adt-powerup` MCP server, which provides Claude Code with direct connectivity to your SAP system via ABAP Development Tools (ADT) REST APIs. The server exposes 150+ tools covering CRUD for ABAP objects (class, program, CDS, FM, table, etc.) plus runtime, transport, and data-preview operations.


<Purpose>
`abap-mcp-adt-powerup` is the bridge between Claude Code and your SAP system. Without it, no SC4SAP skills can read or write ABAP objects. This skill walks you through cloning, configuring, and registering the server so all MCP tools become available.
</Purpose>

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Source>
MCP server repository: https://github.com/babamba2/abap-mcp-adt-powerup.git
Installed at: `${CLAUDE_PLUGIN_ROOT}/vendor/abap-mcp-adt/` (internal directory name kept short for path-length safety on Windows).
</Source>

<Prerequisites>
- Node.js 18+ installed
- Access to a SAP system with ADT service enabled (transaction SICF, service `/sap/bc/adt` active)
- SAP user with developer authorizations (S_DEVELOP, S_TRANSPRT)
- Claude Code with MCP support
</Prerequisites>

<Installation_Steps>
1. **Automatic installation (recommended)**
   The MCP server is automatically installed into the plugin's `vendor/abap-mcp-adt/` directory during setup:
   ```bash
   /sc4sap:setup          # full setup wizard (includes MCP install)
   /sc4sap:setup mcp      # MCP install only
   ```
   Or via npm:
   ```bash
   npm run build          # runs tsc + installs abap-mcp-adt into vendor/
   ```
   This clones the repo, runs `npm install`, and builds it. The plugin's `.mcp.json` is pre-configured to launch `bridge/mcp-server.cjs`, which delegates to the vendor-installed server.

2. **Configure SAP connection (multi-profile)**
   Connection settings live in a per-system profile, not in a hand-written file:
   - `~/.sc4sap/profiles/<alias>/sap.env` — MCP-server env (`SAP_URL`, `SAP_CLIENT`, `SAP_AUTH_TYPE`, `SAP_USERNAME`, `SAP_LANGUAGE`, `SAP_SYSTEM_TYPE` = `s4hana` | `cloud` | `ecc`, `SAP_TIER`, blocklist keys). The password is stored in the OS keychain and referenced as `SAP_PASSWORD=keychain:sc4sap/<alias>/<user>`.
   - `<project>/.sc4sap/active-profile.txt` — alias of the active profile.

   Create a profile with `/sc4sap:setup` (wizard Step 4) or `/sc4sap:sap-option add`; edit it with `/sc4sap:sap-option`. Do not hand-write `sap.env`. Key reference and validation rules: `../sap-option/SKILL.md` → `<Managed_Keys>` / `<Validation>`. Blocklist keys (`MCP_BLOCKLIST_PROFILE` = `minimal` | `standard` (default) | `strict` | `off`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`) are documented in `../sap-option/SKILL.md` → `<Managed_Keys>` (policy: `../../common/data-extraction-policy.md`).

   The bridge resolves the active profile on startup. Process environment variables take precedence over file values.

3. **Verify the connection**
   After restarting Claude Code (or reconnecting MCP via `/mcp`), run:
   ```
   /sc4sap:sap-doctor
   ```
   Or manually test by calling `GetSession` — it should return your SAP system ID, client, and username.

4. **Update the MCP server**
   To update to the latest version:
   ```bash
   node scripts/build-mcp-server.mjs --update
   ```
</Installation_Steps>

<Troubleshooting>
- **401 Unauthorized**: Check `SAP_USERNAME` / the keychain password of the active profile (`/sc4sap:sap-option`); confirm the user is not locked (SU01).
- **Connection refused**: Verify `SAP_URL` host and ICM HTTPS port; check VPN if required.
- **ADT service not found**: Activate `/sap/bc/adt` in transaction SICF and ensure ICF is running.
- **SSL certificate errors**: Add the SAP system certificate to Node.js trust store (recommended), or temporarily set `TLS_REJECT_UNAUTHORIZED=0` in the profile `sap.env` (dev only — never in prod).
- **No tools visible in Claude Code**: Reconnect the MCP server via `/mcp` after editing `sap.env`. `sap.env` changes are NOT hot-reloaded. Check MCP server stderr logs under `%LOCALAPPDATA%\claude-cli-nodejs\Cache\<cwd-slug>\mcp-logs-plugin-sc4sap-sap\`.
- **Blocklist refusal on a legitimate table**: Run `/sc4sap:sap-option` to adjust `MCP_BLOCKLIST_PROFILE` or add the table to `MCP_ALLOW_TABLE` (audited bypass).
- **`vendor/abap-mcp-adt` not built**: Re-run `node scripts/build-mcp-server.mjs` (or `--update` to refresh).
</Troubleshooting>

<Security_Notes>
- Never commit a `sap.env` (profile or legacy `.sc4sap/sap.env`) to version control. Profiles live under `~/.sc4sap/profiles/`, outside the repository.
- Use process-level environment variables to override `sap.env` values in CI/CD, so secrets never touch disk.
- Prefer a read-only SAP user for analysis-only workflows.
- `TLS_REJECT_UNAUTHORIZED=0` is **dev-only** — never set in production. Install the SAP system certificate into Node.js trust store instead.
- The MCP server communicates only with the SAP host in `SAP_URL`. No outbound calls to third parties.
- Row-extraction on sensitive tables is gated by the blocklist policy above (`MCP_BLOCKLIST_PROFILE`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`). See `common/data-extraction-policy.md`.
</Security_Notes>

<Health_Check>
When `ARGUMENTS` is `check` / `verify` / `status` (case-insensitive), run the vendor pin health check inline and report — do not print the full installation guide.

**Execution**:
1. Resolve plugin root (from `CLAUDE_PLUGIN_ROOT` env; fallback to cache path `~/.claude/plugins/cache/sc4sap/sc4sap/<version>/`).
2. Run: `node "<plugin>/scripts/build-mcp-server.mjs" --check`
3. Read the script's exit code and stdout/stderr.
4. Format the result for the user:

| Exit | Meaning | User message (follow conversation language) |
|---|---|---|
| **0** + `pinned to <SHA> ✓` on stdout | OK — vendor matches expected pin | ✅ abap-mcp-adt vendor verified · pinned to `<SHA>` (truncate to first 12 chars) |
| **0** + `pin cannot be verified` on stderr | WARN — launcher OK, `.git` stripped (packaged cache install) | ⚠️ Vendor launcher present, but pin cannot be verified (packaged cache lacks `.git`). Expected pin: `<SHA>`. To force a verifiable reinstall: `node scripts/build-mcp-server.mjs --update`. |
| **1** | FAIL — vendor missing | ❌ abap-mcp-adt not installed. Run: `node scripts/build-mcp-server.mjs` (or `/sc4sap:setup mcp`). |
| **2** | FAIL — pin drift | ❌ abap-mcp-adt vendor drift detected (current HEAD ≠ pinned SHA). Run: `node scripts/build-mcp-server.mjs --update`. |

**Output format** (single block):
```
MCP Vendor Health Check
=======================
Status:  <OK|WARN|FAIL>
Pin:     <expected SHA>
Current: <current HEAD or "unverified" or "not installed">
Action:  <user message from table above>
```

STOP after printing — do not fall through to the full installation guide.
</Health_Check>

Task: {{ARGUMENTS}}
