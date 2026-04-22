# Step 4bis — RFC backend selection

Referenced by `wizard-steps.md`. Mandatory between Step 4 (SAP connection) and Step 5 (MCP reconnect).

Three MCP operation families (Screen, GUI Status, Text Element) dispatch through RFC-enabled function modules (`ZMCP_ADT_DISPATCH`, `ZMCP_ADT_TEXTPOOL`). Ask the user which transport to use. **One question**:

```
Pick RFC backend for Screen / GUI Status / Text Element ops:
  1) odata   — SAP OData v2 service ZMCP_ADT_SRV via HTTPS (default, SEGW + Gateway reg)
  2) soap    — HTTPS via /sap/bc/soap/rfc (requires ICF node active, often disabled)
  3) native  — Direct TCP via SAP NW RFC SDK (requires paid SDK + build tools)
  4) gateway — Remote RFC Gateway middleware via HTTPS/JSON (central SDK host)
  5) zrfc    — Custom ICF handler /sap/bc/rest/zmcp_rfc via HTTPS
               Best when company blocks /sap/bc/soap/rfc AND OData Gateway is
               hard (typical ECC). Needs neither SDK nor Gateway registration —
               just one class + one SICF node (installed by Step 9d).
               Requires:
                 • ZCL_MCP_RFC_HTTP_HANDLER class + SICF node active (Step 9d)
                 • SAP_RFC_ZRFC_BASE_URL in sap.env
                 • Reuses SAP_USERNAME/PASSWORD/CLIENT as Basic auth
```

Default changed 2026-04-22: OData is now the default because hardened SAP installs increasingly disable the legacy `/sap/bc/soap/rfc` ICF node, while OData Gateway is almost always reachable and routes through standard Gateway authorization (S_SERVICE) instead of S_RFC. Existing profiles that already pinned `SAP_RFC_BACKEND=soap` keep working unchanged.

Full detail on soap/native/gateway/odata is in `docs/user-guide/CLIENT_CONFIGURATION.md`. The condensed option summary above is what you present to the user.

- Accept `odata` / `soap` / `native` / `gateway` / `zrfc` (or 1/2/3/4/5). Default `odata` if the user presses Enter.
- Write the choice to the **active profile's** env (`~/.sc4sap/profiles/<alias>/sap.env`, resolved from `<project>/.sc4sap/active-profile.txt`) as `SAP_RFC_BACKEND=soap|native|gateway|odata|zrfc`. Never write it to `<project>/.sc4sap/sap.env` — that file does not exist in multi-profile mode (decision §4.3 of the setup gap plan).

### ⚠️ Backend-specific preflight — bootstrap order

`soap` / `native` / `gateway` preflights run **in full** at this step (no backend objects installed on SAP yet, but these three don't need any).

`odata` / `zrfc` preflights have a **chicken-and-egg**: their probes target `ZCL_ZMCP_ADT_*` (odata) / `ZCL_MCP_RFC_HTTP_HANDLER` (zrfc) + service/SICF nodes that are installed by **Step 9c/9d — which come AFTER Step 4bis**. On first-time setup those objects don't exist yet, so a 404 is expected, not a bug.

Each backend section below has a "Bootstrap order note" block explaining:
- **First-time setup**: record choice, skip active probe, emit deferred-verification banner, continue to Step 5. Real verification happens after Step 9c/9d via `/sc4sap:sap-doctor`.
- **Re-run / reconfiguration**: full probe; failures are genuine.

If the user is re-running setup after 9c/9d have already installed the backend objects, treat all probe failures as fatal.

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

## If the user chose `native`

Collect these additional fields one at a time and append to the **active profile's** `sap.env` (`~/.sc4sap/profiles/<alias>/sap.env`):

```
# --- Native RFC (only when SAP_RFC_BACKEND=native) ---
SAP_RFC_ASHOST=       # App server host (or omit if using message server)
SAP_RFC_SYSNR=        # System number (e.g., 00)
SAP_RFC_CLIENT=       # Client (usually same as SAP_CLIENT)
SAP_RFC_USER=         # Recommended: dedicated user with S_RFC auth only
SAP_RFC_PASSWD=       # (use a non-display vault if possible)
SAP_RFC_LANG=EN       # Default EN

# Optional — load balancing (use INSTEAD of ASHOST/SYSNR)
# SAP_RFC_MSHOST=
# SAP_RFC_SYSID=
# SAP_RFC_GROUP=PUBLIC
# SAP_RFC_MSSERV=

# Optional — SNC (recommended for production)
# SAP_RFC_SNC_QOP=8
# SAP_RFC_SNC_MYNAME=
# SAP_RFC_SNC_PARTNERNAME=
# SAP_RFC_SNC_LIB=
```

Then run the native preflight before Step 5:

1. Verify `SAPNWRFC_HOME` env var is set **or** `libsapnwrfc` is resolvable from the system loader path. If missing: halt and direct the user to download the SAP NW RFC SDK (SAP Support Portal → SAP Development Tools → SAP NetWeaver RFC SDK 7.50) and set `SAPNWRFC_HOME` to the extracted folder.
2. Trigger an install check — `cd <PLUGIN_ROOT>/vendor/abap-mcp-adt && npm rebuild node-rfc` — and surface the output. On failure (missing build tools, SDK not found, node version mismatch) stop and show the remediation.
3. Verify RFC auth — after the MCP server restarts in Step 5, `/sc4sap:sap-doctor` Layer 6 will run `RFC_PING` + a `ZMCP_ADT_DISPATCH` dry-call. If the user is doing setup offline, tell them to run `/sc4sap:sap-doctor` as soon as connectivity is available.
4. Warn: do NOT put the same ADT user and RFC user credentials in both blocks unless intentional — best practice is a separate RFC user with `S_RFC` (`RFC_NAME = ZMCP_ADT_DISPATCH, ZMCP_ADT_TEXTPOOL, RFC_PING, SYSTEM`) + minimal `S_DEVELOP` for TEXTPOOL INSERT.

## If the user chose `gateway`

Collect the gateway fields one at a time and append to the **active profile's** `sap.env` (`~/.sc4sap/profiles/<alias>/sap.env`):

```
# --- Gateway RFC (only when SAP_RFC_BACKEND=gateway) ---
SAP_RFC_GATEWAY_URL=          # e.g., https://rfc-gw.company.com:8443  (required)
SAP_RFC_GATEWAY_TOKEN=        # Bearer token issued by the gateway ACL (recommended)
SAP_RFC_GATEWAY_TLS_VERIFY=1  # Set to 0 only for self-signed dev gateways
```

Then run the gateway preflight before Step 5:

1. Health probe — `curl -sS -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $SAP_RFC_GATEWAY_TOKEN" "$SAP_RFC_GATEWAY_URL/health"` must return `200`. On `404` / `405` / timeouts, halt and direct the user to verify the gateway URL / firewall / DNS.
2. Smoke test of the dispatch endpoint — a harmless `POST /rfc/dispatch` with `{"action":"PING","params":{}}` and the user's X-SAP-* headers. The gateway must reply with JSON `{subrc,...}`. Non-JSON / 5xx means the gateway mis-implements the contract — halt and link the user to the middleware spec.
3. Tell the user: their `SAP_USERNAME` / `SAP_PASSWORD` / `SAP_CLIENT` / `SAP_LANGUAGE` (already captured earlier in Step 4) will be forwarded to the gateway as `X-SAP-User` / `X-SAP-Password` / `X-SAP-Client` / `X-SAP-Language` headers on every call — the gateway uses them to open a per-developer RFC session so SAP's audit log identifies the real user, not a shared service account. No separate RFC user is needed on this host.

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

## If the user chose `zrfc`

Collect the ZRFC field and append to the **active profile's** `sap.env` (`~/.sc4sap/profiles/<alias>/sap.env`):

```
# --- ZRFC (only when SAP_RFC_BACKEND=zrfc) ---
SAP_RFC_ZRFC_BASE_URL=        # e.g. https://sap.company.com:44300/sap/bc/rest/zmcp_rfc  (required)
SAP_RFC_ZRFC_CSRF_TTL_SEC=600 # CSRF token cache TTL seconds, default 600, min 60
```

### ⚠️ Bootstrap order note (first-time vs re-run)

The ZRFC preflight below **requires `ZCL_MCP_RFC_HTTP_HANDLER` + SICF node to already exist on SAP**. These are installed by **Step 9d** — which happens AFTER Step 4bis in the wizard. So:

- **First-time setup (fresh system)**: Step 9d objects do NOT exist yet. The CSRF probe at 4bis WILL return 404. **That is expected** — record the choice, skip the active probe, emit a deferred-verification banner, and continue to Step 5. The `/sc4sap:sap-doctor` check (run after Step 9d completes) performs the real verification.
- **Re-run / reconfiguration (Step 9d already done previously)**: Run the full probe below — failures are genuine.

The preflight procedure itself detects the scenario: if step 1 fails with "handler class missing" or step 2 returns 404 AND this is a fresh setup, treat as deferred (not a fatal error). If step 2 returns 401 or non-empty 5xx, that IS a genuine bug regardless of setup phase.

### ZRFC preflight procedure

1. Verify `ZCL_MCP_RFC_HTTP_HANDLER` class exists on the SAP backend (installed by Step 9d). **Fresh setup**: class absent → emit `"ZRFC backend not yet installed — will verify after Step 9d via /sc4sap:sap-doctor"` and skip the remaining probe steps. **Re-run**: class absent → halt, tell user to run Step 9d.
2. CSRF fetch probe:
   ```bash
   curl -sSu $SAP_USERNAME:$SAP_PASSWORD -H "X-CSRF-Token: Fetch" \
     -o /dev/null -w "status=%{http_code} token=%header{x-csrf-token}\n" \
     "$SAP_RFC_ZRFC_BASE_URL/dispatch?sap-client=$SAP_CLIENT"
   ```
   Must return `status=200` and a non-empty token. `404` on fresh setup → deferred. `404` on re-run → SICF node `/sap/bc/rest/zmcp_rfc` is not active; tell user to activate it in transaction `SICF` (right-click → Activate Service). `401` means Basic auth failed (genuine error regardless of phase).
3. Tell the user: `SAP_USERNAME` / `SAP_PASSWORD` / `SAP_CLIENT` (from Step 4) are reused as Basic auth — no separate RFC user needed. The client handles CSRF handshake automatically (double-submit cookie, TTL cache).
4. **Security note** — the handler uses a hardcoded deny list (e.g. `SXPG_CALL_SYSTEM`, `RFC_ABAP_INSTALL_AND_RUN`) on the `/call` endpoint. The two MCP endpoints `/dispatch` and `/textpool` map to fixed FMs and are not affected. To extend the deny list: edit `ZCL_MCP_RFC_HTTP_HANDLER->class_constructor` and re-transport (source-level control, not table-maintained).
