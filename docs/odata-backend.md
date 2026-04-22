# OData RFC Backend (default since 2026-04-22)

Guide for operating the `SAP_RFC_BACKEND=odata` transport in sc4sap. Since 2026-04-22 this is the **default** backend for new profiles — hardened SAP installs increasingly disable `/sap/bc/soap/rfc`, and OData routes through standard Gateway authorization (S_SERVICE) instead of S_RFC.

## What this is

The default RFC transport for the Screen / GUI Status / Text Element operations — alternative to `soap`, `native`, `gateway`, `zrfc`. Instead of hitting `/sap/bc/soap/rfc` (SOAP) or spawning node-rfc locally (native) or routing through a middleware (gateway), the client calls a **custom OData v2 service** (`ZMCP_ADT_SRV`) on SAP that internally dispatches to the existing `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` function modules.

## When to use it

- **Default choice** for fresh installs
- Your IT policy has **disabled `/sap/bc/soap/rfc`** but permits `/sap/opu/odata/` services (very common in hardened SAP Gateway installs)
- You want SAP's standard audit / logging pipeline (`/IWFND/ERROR_LOG`, `/IWFND/TRACES`)
- You do not want to install the NW RFC SDK on developer laptops (same as `gateway` backend, but without running separate middleware infrastructure)

## When NOT to use it

- S/4HANA Cloud Public — SEGW is not available; pick `soap` if reachable
- Your organisation cannot grant `/IWBEP/REG_SERVICE` or SEGW `Register Service` auth to anyone and cannot spare a Basis session — registration is required one-time; in that case fall back to `soap` (if ICF node active) or `zrfc` (one class + one SICF node)

## Architecture

```
  sc4sap MCP client                    SAP (same system)
  ┌──────────────────────┐             ┌──────────────────────────────┐
  │ handlers/*/*         │             │                              │
  │  screen / gui_status │             │  ICF: /sap/opu/odata/sap/... │
  │  text_element        │             │       │                      │
  │          │           │  HTTPS/JSON │       ▼                      │
  │          ▼           │─────────────▶  /IWFND (frontend)           │
  │  src/lib/rfcBackend  │             │       │                      │
  │  src/lib/odataRfc.ts │             │       ▼                      │
  │      │ CSRF          │             │  /IWBEP (backend)            │
  │      │ Basic auth    │             │  DPC_EXT.execute_action      │
  │      │ X-SAP-Client  │             │       │                      │
  │                      │             │       ▼                      │
  │                      │             │  CALL FUNCTION               │
  │                      │             │   ZMCP_ADT_DISPATCH          │
  │                      │             │   ZMCP_ADT_TEXTPOOL          │
  └──────────────────────┘             └──────────────────────────────┘
```

## ABAP components installed by `/sc4sap:setup` Step 9c

| Object | Type | Purpose |
|---|---|---|
| `ZMCP_ADT_DISPATCH` | FM | Existing (Step 9a) — dispatcher for Screen / GUI Status |
| `ZMCP_ADT_TEXTPOOL` | FM | Existing (Step 9a) — text pool read/write |
| `ZMCP_ADT_MDL` | OData Model | SEGW model (namespace, schema) |
| `ZMCP_ADT_SRV` | OData Service | Wraps the FMs as OData FunctionImports |
| `ZCL_ZMCP_ADT_MPC` | Class | SEGW-generated model provider base (do not modify) |
| `ZCL_ZMCP_ADT_MPC_EXT` | Class | Our DEFINE redefinition — declares ComplexTypes + FunctionImports |
| `ZCL_ZMCP_ADT_DPC` | Class | SEGW-generated data provider base (do not modify) |
| `ZCL_ZMCP_ADT_DPC_EXT` | Class | Our EXECUTE_ACTION redefinition — routes to FMs |
| `ZMCP_ADT_FLUSH_CACHE` | Program | Cache flush + diagnostics + emergency registration |

## OData metadata shape

```xml
<EntityContainer Name="ZMCP_ADT_SRV_Entities" m:IsDefaultEntityContainer="true">
  <FunctionImport Name="Dispatch" m:HttpMethod="POST">
    <Parameter Name="IV_ACTION" Type="Edm.String"/>
    <Parameter Name="IV_PARAMS" Type="Edm.String"/>
  </FunctionImport>
  <FunctionImport Name="Textpool" m:HttpMethod="POST">
    <Parameter Name="IV_ACTION" Type="Edm.String"/>
    <Parameter Name="IV_PROGRAM" Type="Edm.String"/>
    <Parameter Name="IV_LANGUAGE" Type="Edm.String"/>
    <Parameter Name="IV_TEXTPOOL_JSON" Type="Edm.String"/>
  </FunctionImport>
</EntityContainer>

<ComplexType Name="DispatchResult">
  <Property Name="EV_RESULT" Type="Edm.String"/>
  <Property Name="EV_SUBRC" Type="Edm.Int32"/>
  <Property Name="EV_MESSAGE" Type="Edm.String"/>
</ComplexType>
<ComplexType Name="TextpoolResult">
  <Property Name="EV_RESULT" Type="Edm.String"/>
  <Property Name="EV_SUBRC" Type="Edm.Int32"/>
  <Property Name="EV_MESSAGE" Type="Edm.String"/>
</ComplexType>
```

## Client-side env variables

Edit via `/sc4sap:sap-option`:

```bash
SAP_RFC_BACKEND=odata
SAP_RFC_ODATA_SERVICE_URL=https://sap.company.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV
SAP_RFC_ODATA_CSRF_TTL_SEC=600

# SAP_USERNAME, SAP_PASSWORD, SAP_CLIENT, SAP_LANGUAGE are reused from existing config.
```

## CSRF handshake

Automatically handled by `src/lib/odataRfc.ts`:

1. First call: `GET {url}/$metadata` with header `X-CSRF-Token: Fetch`
2. Response includes `X-CSRF-Token: <token>` + `Set-Cookie: SAP_SESSIONID_*`
3. Subsequent `POST /Dispatch` or `POST /Textpool` includes `X-CSRF-Token: <token>` + `Cookie: <session>`
4. Token cached for `SAP_RFC_ODATA_CSRF_TTL_SEC` seconds (default 600, min 60)
5. On `HTTP 403` with `X-CSRF-Token: Required` → refresh token + retry once

## Service registration — the non-trivial step

**This is the operational friction point.** ABAP classes + program are easy to install via MCP. The service must also be:

1. **Registered in `/IWBEP` (backend catalog)** — links MPC/DPC classes to service name
2. **Activated in `/IWFND/MAINT_SERVICE` (frontend)** — binds service name to ICF URL path
3. **Linked to a System Alias** — usually `LOCAL` with `RFC Destination = NONE` for embedded mode
4. **ICF node active** — `/sap/opu/odata/sap/ZMCP_ADT_SRV` under SICF

Both step 1 and the full "Register Service" flow in SEGW require authorization objects (`/IWBEP/SB`, `/IWBEP/REG_SERVICE` TCode) that developer roles typically lack. This is by SAP design — it's considered a Basis configuration task.

### Basis Team Request Template

Copy to email / ticket for your Basis team:

```
Subject: sc4sap — Register OData service ZMCP_ADT_SRV on <SID> (5-min task)

Hello,

Our development team uses the sc4sap plugin (SuperClaude for SAP) with the
OData RFC backend. Please register the following custom OData v2 service
on system <SID>, client <CLIENT>:

Service name:                ZMCP_ADT_SRV
Model name:                  ZMCP_ADT_MDL
Version:                     0001
Namespace:                   (blank)
External name:               ZMCP_ADT_SRV
Model Provider Class:        ZCL_ZMCP_ADT_MPC_EXT
Data Provider Class:         ZCL_ZMCP_ADT_DPC_EXT
Package:                     $TMP  (or your local workbench package)

Steps:
  1. TCode /IWBEP/REG_SERVICE → Register → enter the values above → Save
  2. TCode /IWFND/MAINT_SERVICE → Add Service
     - System Alias: LOCAL
     - External Service Name: ZMCP_ADT_SRV
     - Get Services → select ZMCP_ADT_SRV → Add Selected Services
     - Package: $TMP  (or local)
  3. SICF → /default_host/sap/opu/odata/sap/ZMCP_ADT_SRV → Activate Service
  4. TCode /IWFND/CACHE_CLEANUP → Clean Up Model Cache → Execute

Technical background:
  - The MPC/DPC classes wrap existing RFC function modules
    ZMCP_ADT_DISPATCH and ZMCP_ADT_TEXTPOOL (created by /sc4sap:setup
    Step 9a, used by SOAP RFC today)
  - No schema changes, no table access, no authorization impact beyond
    S_RFC for the existing FMs
  - Service is read-heavy (Screen/GUI/Text Element CRUD from the
    developer's IDE), low traffic (~10 calls/day/developer)

Verification after registration:
  curl -sSu <user>:<pass> \
    "https://<host>:<port>/sap/opu/odata/sap/ZMCP_ADT_SRV/\$metadata?sap-client=<client>"
  → HTTP 200 with <edmx:Edmx> XML

Thanks!
```

## Troubleshooting

### HTTP 500 "unknown internal server error" on POST FunctionImport

The generic OData v2 error wrapping masks the real exception. Steps to diagnose:

1. **Check `$metadata` returns 200** — if not, service not ICF-active. Run SICF on `/sap/opu/odata/sap/ZMCP_ADT_SRV`.
2. **Check service document `GET /` returns 200** — confirms service catalog wiring OK.
3. **Check `/IWFND/MAINT_SERVICE` → Backend Service** section — if **empty**, `/IWBEP` registration is missing. Use Basis template above.
4. **Run `ZMCP_ADT_FLUSH_CACHE`** in SE38:
   - `P_FLUSH = X` → model cache clear
   - `P_REG = X` → programmatic `/IWBEP` row insert (emergency only)
   - `P_DIAG = X` → DPC_EXT direct invocation test
   - If `P_DIAG` shows `[OK]` → ABAP code is fine, issue is in Gateway framework dispatch (cache or registration)
5. **Ask Basis to check `/IWFND/ERROR_LOG`** with the transaction ID from the HTTP response body (`innererror.transactionid`). This shows the actual ABAP exception chain.
6. **Delete + Re-add service** in `/IWFND/MAINT_SERVICE` — useful after `/IWBEP` rows change.

### HTTP 404 "Invalid Function Import Parameter"

Request URL is missing a required parameter. Check that all 2 (Dispatch) or 4 (Textpool) input params are present with OData string-literal formatting (`IV_ACTION='READ'` — note the single quotes). The sc4sap client does this automatically.

### HTTP 403 "CSRF Token Required"

Client's cached token expired. `odataRfc.ts` auto-retries once with a fresh token. If it persists, check `SAP_RFC_ODATA_CSRF_TTL_SEC` is reasonable (default 600s) and that cookies are being forwarded — some reverse proxies strip `SAP_SESSIONID_*` cookies.

### HTTP 401 Unauthorized

Basic auth failed. Verify `SAP_USERNAME` + `SAP_PASSWORD` in sap.env. Note: OData reuses the HTTPS ADT credentials — same ones sc4sap already uses for `GetClass` / `SearchObject`.

### SSL handshake error in Gateway Client (SAPGUI)

```
SSSLERR_PEER_CERT_UNTRUSTED (-102)
Peer's X.509 certificate (chain) validation failed
missing certificate of USERTrust RSA Certification Authority
```

This is SAPSSLA.pse (SAP client-side trust store) missing a root CA. Affects Gateway Client **inside SAPGUI** — irrelevant for Node.js clients (which use OS-level trust store or `NODE_TLS_REJECT_UNAUTHORIZED=0`).

Basis fix: `STRUST` → `SSL Client (Anonymous)` → Import the missing CA cert chain (AAA Certificate Services + USERTrust RSA CA).

### Gateway registration partial — only /IWFND populated, /IWBEP empty

Symptom: Service catalog shows ZMCP_ADT_SRV, but Backend Service detail tab is empty. Calls return HTTP 500 generically.

Cause: `/IWFND/MAINT_SERVICE` "Add Service" only populates the frontend catalog. Backend `/IWBEP` rows are populated by `/IWBEP/REG_SERVICE` (TCode) or SEGW "Register Service" button. Without them, the runtime can't find MPC/DPC classes to instantiate.

Remediation priority:
1. **Basis runs `/IWBEP/REG_SERVICE`** (ideal)
2. **SEGW project → Register Service button** (if dev has `/IWBEP/SB` auth)
3. **`ZMCP_ADT_FLUSH_CACHE` with `P_REG = X`** (emergency, partial — may still leave some tables under-populated)

### Repeated HTTPS 404 on outbound LOCAL_HTTPS destination

SAP's outbound HTTPS destination to itself fails. Not related to our inbound OData calls (which use HTTP or HTTPS depending on your config). But if Basis restores this too, it makes Gateway Client UI testing work.

## Relationship to other backends

| Backend | Transport | ABAP-side setup | Enterprise fit |
|---|---|---|---|
| `soap` | HTTPS `/sap/bc/soap/rfc` | Just ensure ICF node active | Default — works until Basis disables ICF |
| `native` | Binary RFC (node-rfc) | None (but SDK on each laptop) | Power users, individual devs |
| `gateway` | HTTPS JSON middleware | None (gateway has SDK) | Mature enterprises with HTTPS middleware infra |
| `odata` | HTTPS OData v2 FunctionImport | **SEGW + Basis registration** | Hardened Gateway-only environments |

If your organisation has BOTH SOAP blocked AND is unwilling to install `node-rfc` on laptops AND doesn't want to run a middleware server — then OData is your only HTTPS path, and the one-time Basis registration is unavoidable.

## Links

- [sc4sap plugin repo](https://github.com/babamba2/superclaude-for-sap)
- [abap-mcp-adt-powerup (MCP server)](https://github.com/babamba2/abap-mcp-adt-powerup) — contains `src/lib/odataRfc.ts`
- SAP Note 1797736 — Gateway error log analysis
- `/sc4sap:sap-doctor` → Layer 6.odata — automated checks
- `/sc4sap:sap-option` → "rfc" group — edit the OData env vars
