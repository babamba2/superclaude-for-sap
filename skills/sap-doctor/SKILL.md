---
name: sc4sap:sap-doctor
description: Diagnose SC4SAP plugin health, MCP server connectivity, and SAP system connection (renamed from `doctor` to avoid conflict with Claude Code's built-in `/doctor`)
level: 2
---

# SC4SAP Doctor

Diagnoses the full SC4SAP stack: plugin installation, MCP server status, and live SAP system connectivity. Reports findings with actionable fixes for each issue found.

<Purpose>
sc4sap:sap-doctor runs a structured health check across three layers: the SC4SAP plugin itself, the mcp-abap-adt MCP server registration, and the live SAP system connection. It surfaces problems with clear remediation steps so you can get back to development quickly.
</Purpose>

<Use_When>
- Something isn't working and you're not sure where the problem is
- After initial setup to confirm everything is configured correctly
- After a SAP system change (password reset, IP change, client migration)
- User says "doctor", "diagnose", "check connection", "something's broken", or "is it working"
- MCP tools return errors or are not visible in Claude Code
</Use_When>

<Diagnostic_Checks>
Run all checks in order. Report PASS / FAIL / WARN for each.

**Layer 1 - Plugin Health**
- [ ] SC4SAP plugin directory exists and is readable
- [ ] `package.json` version is current
- [ ] Skill files present (16 skills in `skills/` directory)
- [ ] Config file exists at `.sc4sap/config.json`

**Layer 2 - MCP Server**
- [ ] `plugin:sc4sap:sap` appears in Claude Code MCP server list
- [ ] MCP server process is running (check via tool availability)
- [ ] At least one MCP tool (`GetSession`) responds without error
- [ ] **Vendor launcher exists** at `<cache>/vendor/abap-mcp-adt/dist/server/launcher.js`
      (missing launcher = MCP shows green but tool calls fail)
- [ ] **No plugin version drift**: cache `.claude-plugin/plugin.json` version matches
      marketplace `.claude-plugin/plugin.json` version. If mismatch, advise user to run
      `/reload-plugins` or restart Claude Code. The bridge also prints a warning to
      stderr on every MCP start when drift is detected.
- [ ] Bridge preflight passes: `node "<plugin>/bridge/mcp-server.cjs" --check` exits 0
      and prints the SAP connection config banner (this is the same preflight the
      MCP runtime uses)

**Layer 3 - SAP System Connection**
- [ ] `GetSession` returns valid system data (system ID, client, user)
- [ ] `GetInactiveObjects` responds (tests developer authorization)
- [ ] `ListTransports` responds (tests transport authorization S_TRANSPRT)
- [ ] `SearchObject` with a simple query responds (tests object repository access)
- [ ] `GetTableContents` on `T000` responds (tests table access)

**Layer 4 - Configuration**
- [ ] SAP host URL is reachable (HTTPS port)
- [ ] Configured client matches `GetSession` response
- [ ] Configured username matches `GetSession` response
</Diagnostic_Checks>

<Output_Format>
```
SC4SAP Doctor Report
====================
Plugin Health     [PASS]
MCP Server        [FAIL] mcp-abap-adt not found in MCP server list
SAP Connection    [SKIP] Cannot test without MCP server
Configuration     [WARN] No .sc4sap/config.json found

Issues Found: 1 error, 1 warning

Fix: Run /sc4sap:mcp-setup to install and register mcp-abap-adt
```
</Output_Format>

<Remediation_Routing>
- MCP server missing -> `/sc4sap:mcp-setup`
- SAP connection error -> display connection troubleshooting from `/sc4sap:mcp-setup` Troubleshooting section
- Missing config -> run `/sc4sap:setup` wizard
- Authorization errors -> display required authorization objects (S_DEVELOP, S_TRANSPRT)
- All pass -> "SC4SAP is healthy. System: {SID} Client: {client} User: {user}"
</Remediation_Routing>

Task: {{ARGUMENTS}}
