---
name: sc4sap:mcp-setup
description: Guide to install and configure the abap-mcp-adt-powerup MCP server for SAP ADT connectivity
level: 2
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

2. **Configure SAP connection**
   Create `.sc4sap/sap.env` in the plugin directory with your SAP credentials:
   ```env
   SAP_URL=https://your-sap-host:44300
   SAP_CLIENT=100
   SAP_AUTH_TYPE=basic
   SAP_USERNAME=your-user
   SAP_PASSWORD=your-password
   SAP_LANGUAGE=EN
   SAP_SYSTEM_TYPE=onprem
   TLS_REJECT_UNAUTHORIZED=0

   # --- Blocklist policy (optional) ---
   # Controls the row-extraction guard in mcp-abap-adt. Defaults to `standard`.
   #   minimal  — block only PII/credentials/banking
   #   standard — minimal + Protected Business Data (ACDOCA, BKPF, VBAK, EKKO, ...)  [default]
   #   strict   — standard + Audit/Security + Communication/Workflow
   #   off      — disable the guard entirely (NOT recommended)
   # MCP_BLOCKLIST_PROFILE=standard
   # MCP_BLOCKLIST_EXTEND=ZHR_SALARY,ZCUSTOMER_PII
   # MCP_ALLOW_TABLE=ACDOCA
   ```
   - `SAP_URL`: SAP system URL with HTTPS and ICM port (typically 44300 for HTTPS)
   - `SAP_CLIENT`: SAP client number (3 digits, e.g., "100")
   - `SAP_AUTH_TYPE`: `basic` for username/password, `xsuaa` for JWT (OAuth2)
   - `SAP_USERNAME` / `SAP_PASSWORD`: SAP credentials with developer access
   - `SAP_LANGUAGE`: Logon language (EN, DE, etc.)
   - `SAP_SYSTEM_TYPE`: `onprem` for on-premise S/4HANA, `cloud` for BTP
   - `TLS_REJECT_UNAUTHORIZED`: Set to `0` for self-signed certificates (dev only)
   - `MCP_BLOCKLIST_PROFILE` *(optional)*: `minimal` | `standard` | `strict` | `off` — risk tier for row-extraction guard. Leave unset for the safe default (`standard`).
   - `MCP_BLOCKLIST_EXTEND` *(optional)*: comma-separated extra names/patterns (always denied). Use for site-specific Z-tables containing sensitive data.
   - `MCP_ALLOW_TABLE` *(optional)*: comma-separated whitelist for an audited one-off bypass. Logged to stderr. Remove when not actively needed.

   The bridge reads this file automatically on startup. Environment variables take precedence over file values.

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
- **401 Unauthorized**: Check `SAP_USERNAME` / `SAP_PASSWORD` in `.sc4sap/sap.env`; confirm the user is not locked (SU01).
- **Connection refused**: Verify `SAP_URL` host and ICM HTTPS port; check VPN if required.
- **ADT service not found**: Activate `/sap/bc/adt` in transaction SICF and ensure ICF is running.
- **SSL certificate errors**: Add the SAP system certificate to Node.js trust store (recommended), or temporarily set `TLS_REJECT_UNAUTHORIZED=0` in `sap.env` (dev only — never in prod).
- **No tools visible in Claude Code**: Reconnect the MCP server via `/mcp` after editing `sap.env`. `sap.env` changes are NOT hot-reloaded. Check MCP server stderr logs under `%LOCALAPPDATA%\claude-cli-nodejs\Cache\<cwd-slug>\mcp-logs-plugin-sc4sap-sap\`.
- **Blocklist refusal on a legitimate table**: Run `/sc4sap:sap-option` to adjust `MCP_BLOCKLIST_PROFILE` or add the table to `MCP_ALLOW_TABLE` (audited bypass).
- **`vendor/abap-mcp-adt` not built**: Re-run `node scripts/build-mcp-server.mjs` (or `--update` to refresh).
</Troubleshooting>

<Security_Notes>
- Never commit `.sc4sap/sap.env` (the dotenv file with SAP credentials) to version control. It is git-ignored by default.
- Use process-level environment variables to override `sap.env` values in CI/CD, so secrets never touch disk.
- Prefer a read-only SAP user for analysis-only workflows.
- `TLS_REJECT_UNAUTHORIZED=0` is **dev-only** — never set in production. Install the SAP system certificate into Node.js trust store instead.
- The MCP server communicates only with the SAP host in `SAP_URL`. No outbound calls to third parties.
- Row-extraction on sensitive tables is gated by the blocklist policy above (`MCP_BLOCKLIST_PROFILE`, `MCP_BLOCKLIST_EXTEND`, `MCP_ALLOW_TABLE`). See `common/data-extraction-policy.md`.
</Security_Notes>

Task: {{ARGUMENTS}}
