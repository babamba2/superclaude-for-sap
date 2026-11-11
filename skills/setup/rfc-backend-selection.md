# Step 4bis — RFC backend selection

Referenced by `wizard-steps.md`. Mandatory between Step 4 (SAP connection) and Step 5 (MCP reconnect).

Three MCP operation families (Screen, GUI Status, Text Element) dispatch through RFC-enabled function modules (`ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL`). Ask the user which transport to use. **One question**:

```
Pick RFC backend for Screen / GUI Status / Text Element ops:
  1) odata   — SAP OData v2 service ZMCP_ADT_SRV via HTTPS (default, SEGW + Gateway reg)
  2) soap    — HTTPS via /sap/bc/soap/rfc (requires ICF node active, often disabled)
```

Default changed 2026-04-22: OData is now the default because hardened SAP installs increasingly disable the legacy `/sap/bc/soap/rfc` ICF node, while OData Gateway is almost always reachable and routes through standard Gateway authorization (S_SERVICE) instead of S_RFC. Existing profiles that already pinned `SAP_RFC_BACKEND=soap` keep working unchanged.

Full detail on odata / soap is in `docs/user-guide/CLIENT_CONFIGURATION.md` of the `abap-mcp-adt-powerup` repository. The condensed option summary above is what you present to the user.

- Accept `odata` / `soap` (or 1/2). Default `odata` if the user presses Enter.
- `native`, `gateway` and `zrfc` were removed in MCP 4.10.0 (the server refuses to start with them). A re-run on a profile that still has one: tell the user, then ask this question again and overwrite the value.
- Write the choice to the **active profile's** env (`~/.sc4sap/profiles/<alias>/sap.env`, resolved from `<project>/.sc4sap/active-profile.txt`) as `SAP_RFC_BACKEND=odata|soap`. Never write it to `<project>/.sc4sap/sap.env` — that file does not exist in multi-profile mode (decision §4.3 of the setup gap plan).

### ⚠️ Backend-specific preflight — bootstrap order

The `soap` preflight runs **in full** at this step (it needs no backend objects on SAP).

The `odata` preflight has a **chicken-and-egg**: its probe targets `ZCL_ZMCP_ADT_*` + the service registration, installed by **Step 9c — which comes AFTER Step 4bis**. On first-time setup those objects don't exist yet, so a 404 is expected, not a bug.

The odata section below has a "Bootstrap order note" block explaining:
- **First-time setup**: record choice, skip active probe, emit deferred-verification banner, continue to Step 5. Real verification happens after Step 9c via `/sc4sap:sap-doctor`.
- **Re-run / reconfiguration**: full probe; failures are genuine.

If the user is re-running setup after 9c has already installed the backend objects, treat all probe failures as fatal.

## If the user chose `soap`

Run this preflight before Step 5:

1. Tell the user to confirm ICF node `/default_host/sap/bc/soap/rfc` is **active** in SICF (transaction `SICF` → Hierarchy Type `SERVICE` → Execute → navigate to `default_host` → `sap` → `bc` → `soap` → `rfc` → if grey, right-click → Activate Service).
2. Smoke test after `SAP_URL` is set:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -u $SAP_USERNAME:$SAP_PASSWORD \
     "$SAP_URL/sap/bc/soap/rfc?sap-client=$SAP_CLIENT"
   ```
   Expect `405` (POST-only endpoint, 405 on GET proves the node is active). `404` means the ICF node is inactive — halt and instruct the user to activate it.
3. No further env additions; continue to Step 5.

## If the user chose `odata`

Collect the OData fields one at a time and append to the **active profile's** `sap.env` (`~/.sc4sap/profiles/<alias>/sap.env`):

```
# --- OData RFC (only when SAP_RFC_BACKEND=odata) ---
SAP_RFC_ODATA_SERVICE_URL=    # e.g. https://sap.company.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV  (required)
SAP_RFC_ODATA_CSRF_TTL_SEC=600  # CSRF token cache TTL in seconds, min 60
```

### ⚠️ Bootstrap order note (first-time vs re-run)

The OData preflight below **requires `ZCL_ZMCP_ADT_MPC_EXT` / `ZCL_ZMCP_ADT_DPC_EXT` + service registration to already exist on SAP**. These are installed by **Step 9c** — which happens AFTER Step 4bis in the wizard. So:

- **First-time setup (fresh system)**: Step 9c backend objects do NOT exist yet. The metadata probe at 4bis WILL return 404. **That is expected** — record the choice, skip the active probe, emit a deferred-verification banner, and continue to Step 5. The `/sc4sap:sap-doctor` Layer 6.odata check (run after Step 9c completes) performs the real verification.
- **Re-run / reconfiguration (Step 9c already done previously)**: Run the full probe below — failures are genuine.

The preflight procedure itself detects the scenario: if step 1 fails with "classes missing" or step 2 returns 404 AND this is a fresh setup, treat as deferred (not a fatal error). If step 2 returns 200 but step 4 shows a 500, that IS a genuine bug (registration issue).

### OData preflight procedure

1. Verify `ZCL_ZMCP_ADT_MPC_EXT` + `ZCL_ZMCP_ADT_DPC_EXT` exist on the SAP backend (installed by `odata-classes-install.md` — Step 9c). **Fresh setup**: classes absent → emit `"OData backend not yet installed — will verify after Step 9c via /sc4sap:sap-doctor"` and skip the remaining probe steps. **Re-run**: classes absent → halt, tell user to run Step 9c.
2. Metadata probe:
   ```bash
   curl -sSu $SAP_USERNAME:$SAP_PASSWORD \
     "$SAP_RFC_ODATA_SERVICE_URL/\$metadata?sap-client=$SAP_CLIENT"
   ```
   Must return HTTP 200 with XML containing `ComplexType Name="DispatchResult"` and `FunctionImport Name="Dispatch"`. If 404 on fresh setup → deferred. If 404 on re-run → halt, point to Step 9c + `docs/odata-backend.md` registration path.
3. Tell the user: their `SAP_USERNAME` / `SAP_PASSWORD` are reused as Basic auth, `SAP_CLIENT` is appended as `?sap-client=<n>`. The client handles CSRF handshake automatically (GET `$metadata` with `X-CSRF-Token: Fetch` → cache token + cookie → use on POSTs).
4. **IMPORTANT** — if the metadata probe returns 200 but POST FunctionImport calls return 500 "unknown internal server error", the backend `/IWBEP` service registration is missing. Run `/sc4sap:sap-doctor` Layer 6.odata for diagnosis, then follow the "Basis Team Request" template in `docs/odata-backend.md` — normal `/IWFND/MAINT_SERVICE` "Add Service" does not always populate the backend `/IWBEP` tables in all SAP releases; the standard fix is `/IWBEP/REG_SERVICE` which typically requires Basis authorization.
