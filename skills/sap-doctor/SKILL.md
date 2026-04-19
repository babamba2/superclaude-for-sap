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

<Response_Prefix>
Every response triggered by this skill MUST begin with `[Model: <main-model> · Dispatched: <sub-summary>]` per [`../../common/model-routing-rule.md`](../../common/model-routing-rule.md) § Response Prefix Convention.
</Response_Prefix>

<Use_When>
- Something isn't working and you're not sure where the problem is
- After initial setup to confirm everything is configured correctly
- After a SAP system change (password reset, IP change, client migration)
- User says "doctor", "diagnose", "check connection", "something's broken", or "is it working"
- MCP tools return errors or are not visible in Claude Code
</Use_When>

<Diagnostic_Checks>
**MANDATORY**: Run the 5-layer diagnostic checklist defined in [`diagnostic-checks.md`](diagnostic-checks.md). It covers Layer 1 (Plugin Health) → Layer 2 (MCP Server) → Layer 3 (SAP System Connection) → Layer 4 (Required ABAP Objects — gated on Layer 2 + 3 PASS) → Layer 5 (Configuration). Report PASS / FAIL / WARN per layer in the order defined there.
</Diagnostic_Checks>

<Output_Format>
```
SC4SAP Doctor Report
====================
Plugin Health       [PASS]  v0.2.2 (cache matches marketplace)
MCP Server          [PASS]  plugin:sc4sap:sap responding, bridge preflight OK
SAP Connection      [PASS]  SID=S4H · Client=100 · User=PAEK
Required Objects    [WARN]  9a: 3/3 · 9b: 7/7 (ZCL_S4SAP_CM_ALV inactive)
Configuration       [PASS]

Issues Found: 0 errors, 1 warning

Fix: Activate ZCL_S4SAP_CM_ALV, or re-run /sc4sap:setup wizard step 9b
```

Second example — connectivity failure gating Layer 4:

```
SC4SAP Doctor Report
====================
Plugin Health       [PASS]  v0.2.2
MCP Server          [FAIL]  plugin:sc4sap:sap not responding
SAP Connection      [SKIP]  Cannot test without MCP server
Required Objects    [SKIP]  SAP connection not ready
Configuration       [WARN]  No .sc4sap/config.json found

Issues Found: 1 error, 1 warning

Fix: Run /sc4sap:mcp-setup to install and register plugin:sc4sap:sap
```
</Output_Format>

<Remediation_Routing>
- Plugin version drift (cache ≠ marketplace) -> run `/reload-plugins`, then restart Claude Code
- MCP server missing -> `/sc4sap:mcp-setup`
- SAP connection error -> display connection troubleshooting from `/sc4sap:mcp-setup` Troubleshooting section
- Missing ZMCP_ADT_UTILS / ZMCP_ADT_DISPATCH / ZMCP_ADT_TEXTPOOL -> re-run `/sc4sap:setup` (wizard step 9a)
- Missing ZIF_S4SAP_CM / ZCX_S4SAP_EXCP / ZCL_S4SAP_CM_* -> re-run `/sc4sap:setup` (wizard step 9b)
- Any 9a/9b object inactive -> activate via ADT, or re-run the matching wizard step to reinstall source and activate
- Missing config -> run `/sc4sap:setup` wizard
- Authorization errors -> display required authorization objects (S_DEVELOP, S_TRANSPRT)
- All pass -> "SC4SAP is healthy. System: {SID} Client: {client} User: {user}"
</Remediation_Routing>

Task: {{ARGUMENTS}}
