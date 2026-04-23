# sap-doctor Diagnostic Checks

Detailed diagnostic checklist for `sc4sap:sap-doctor`. Referenced from `SKILL.md` → `<Diagnostic_Checks>`.

Run all checks in order. Report PASS / FAIL / WARN for each.

**Layer 1 - Plugin Health**
- [ ] SC4SAP plugin directory exists and is readable
- [ ] Read **plugin version** from `<plugin>/.claude-plugin/plugin.json` → `version`; display as `SC4SAP plugin vX.Y.Z`
- [ ] Compare cache vs marketplace `plugin.json` versions. If mismatch, surface the drift and advise `/reload-plugins` + Claude Code restart (same signal Layer 2 emits — keep both so Layer 1 catches it even when MCP is offline)
- [ ] Skill files present in `skills/` directory (expected skill list from marketplace `plugin.json` manifest)
- [ ] Config file exists at `.sc4sap/config.json` with `sapVersion`, `abapRelease`, `industry` keys

**Layer 2 - MCP Server**
- [ ] `plugin:sc4sap:sap` appears in Claude Code MCP server list
- [ ] MCP server process is running (check via tool availability)
- [ ] At least one MCP tool (`GetSession`) responds without error
- [ ] **Vendor launcher exists** at `<cache>/vendor/abap-mcp-adt/dist/server/launcher.js`
      (missing launcher = MCP shows green but tool calls fail)
- [ ] **Vendor pin matches expected SHA**: run `node "<plugin>/scripts/build-mcp-server.mjs" --check`
      and interpret its exit code:
      - **exit 0** + stdout "pinned to <SHA> ✓" → PASS
      - **exit 0** + stderr "pin cannot be verified" (`.git` stripped during packaging) → WARN — note that vendor cryptographic verification is unavailable for this cache install; suggest `/sc4sap:setup mcp` after the next sc4sap update to replace cache vendor with a verifiable clone
      - **exit 1** → FAIL — vendor not installed; advise `node scripts/build-mcp-server.mjs`
      - **exit 2** → FAIL — pin drift (current HEAD ≠ pinned SHA); advise `node scripts/build-mcp-server.mjs --update`
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

**Layer 4 - Required ABAP Objects (server-side)**

> **Gate — strict dependency**: Run this layer ONLY when **Layer 2 (MCP Server) AND Layer 3 (SAP System Connection)** both end in PASS. If either is FAIL, mark Layer 4 as **[SKIP — SAP connection not ready]** and do **not** issue any `SearchObject` / `GetInactiveObjects` call. Rationale: every check here depends on a live MCP + SAP session; an MCP or connectivity failure makes every object appear "missing" and would mislead the user toward re-installing objects that actually exist. Fix connectivity first (Layer 2/3 remediation), then re-run.

These objects are installed by `/sc4sap:setup` wizard steps 9a and 9b. Missing them breaks MCP Screen/GUI/TextPool ops (9a) or prevents generated programs from compiling (9b).

*9a — MCP ADT utilities (required for Screen/GUI Status/Text Element ops):*
- [ ] `SearchObject(ZMCP_ADT_UTILS, FUGR)` — function group exists
- [ ] `SearchObject(ZMCP_ADT_DISPATCH, FUNC)` — dispatcher function module exists and is RFC-enabled
- [ ] `SearchObject(ZMCP_ADT_TEXTPOOL, FUNC)` — text pool function module exists and is RFC-enabled

*9b — ALV OOP reuse handlers (consumed by `/sc4sap:create-program` generated code):*
- [ ] `SearchObject(ZIF_S4SAP_CM, INTF)` — interface exists
- [ ] `SearchObject(ZCX_S4SAP_EXCP, CLAS)` — exception class exists
- [ ] `SearchObject(ZCL_S4SAP_CM_OALV, CLAS)` — ALV Grid wrapper exists
- [ ] `SearchObject(ZCL_S4SAP_CM_OTREE, CLAS)` — ALV Tree wrapper exists
- [ ] `SearchObject(ZCL_S4SAP_CM_ALV_EVENT, CLAS)` — Grid event handler exists
- [ ] `SearchObject(ZCL_S4SAP_CM_TREE_EVENT, CLAS)` — Tree event handler exists
- [ ] `SearchObject(ZCL_S4SAP_CM_ALV, CLAS)` — main container manager exists
- [ ] `GetInactiveObjects` returns 0 entries for any of the above (every object must be active — created-but-inactive counts as FAIL)

Report counts at the layer level: `9a: 3/3 installed`, `9b: 7/7 installed, 7/7 active`. If any 9b object exists but is inactive, flag as a WARN with the specific object names.

**Layer 5 - Configuration**
- [ ] SAP host URL is reachable (HTTPS port)
- [ ] Configured client matches `GetSession` response
- [ ] Configured username matches `GetSession` response

**Layer 6 - RFC Backend (conditional — branches on `SAP_RFC_BACKEND`)**

Per-backend check lists for `soap` / `native` / `gateway` / `odata` live in **[`diagnostic-checks-rfc.md`](diagnostic-checks-rfc.md)**. Resolve `SAP_RFC_BACKEND` from `sap.env` first (default `soap`), then execute the matching sub-section from that file. Output a one-line banner stating which sub-section was executed.
