# Layer 6 — RFC Backend diagnostics (per-backend breakdown)

Referenced by `diagnostic-checks.md`. Resolve `SAP_RFC_BACKEND` from the active profile `sap.env` first (default `odata` when unset), then run **only** the matching sub-section below. Output a one-line banner stating which sub-section was executed.

## 6.soap — SOAP mode (active when `SAP_RFC_BACKEND=soap`)

*6.soap.1 — ICF node hint (print once, always):*
- [ ] Remind user that `/default_host/sap/bc/soap/rfc` ICF node must be active in SICF. No automated probe — SAP does not expose an anonymous GET on this endpoint; a 405 on GET is the positive signal. Users can run:
      `curl -s -o /dev/null -w "%{http_code}" -u $SAP_USERNAME:$SAP_PASSWORD "$SAP_URL/sap/bc/soap/rfc?sap-client=$SAP_CLIENT"` — expect `405`.

The SOAP backend otherwise reuses Layer 3's HTTPS ADT channel — its health is already covered there. Report Layer 6 as `[PASS — SOAP backend relies on Layer 3 HTTPS]`.

## 6.native — Native mode (active when `SAP_RFC_BACKEND=native`)

*6.native.1 — Native RFC module:*
- [ ] `node-rfc` module resolves from `<plugin>/vendor/abap-mcp-adt/node_modules/node-rfc` (optionalDependency installed)
- [ ] `require('node-rfc')` succeeds without throwing (native addon links to libsapnwrfc)

*6.native.2 — NW RFC SDK runtime:*
- [ ] `SAPNWRFC_HOME` env var points to an existing folder, OR `libsapnwrfc.{dll,so,dylib}` is resolvable from the loader path
- [ ] SDK version ≥ 7.50 (read from `<SAPNWRFC_HOME>/lib/sapnwrfc_version` or equivalent; surface version string in output)

*6.native.3 — RFC connection parameters (sap.env completeness):*
- [ ] `SAP_RFC_USER`, `SAP_RFC_PASSWD`, `SAP_RFC_CLIENT` present
- [ ] Either (`SAP_RFC_ASHOST` + `SAP_RFC_SYSNR`) **or** (`SAP_RFC_MSHOST` + `SAP_RFC_SYSID`) present — not both, not neither
- [ ] `SAP_RFC_LANG` present (default `EN` acceptable)
- [ ] If `SAP_RFC_SNC_QOP` set: `SAP_RFC_SNC_MYNAME` and `SAP_RFC_SNC_PARTNERNAME` also set

*6.native.4 — Live RFC probes:*
- [ ] `RFC_PING` via node-rfc Pool returns without error (validates connectivity, credentials, protocol handshake)
- [ ] `ZMCP_ADT_DISPATCH` with a harmless action returns `EV_SUBRC` ≠ fatal — proves `S_RFC` authorization for the dispatcher FM
- [ ] `ZMCP_ADT_TEXTPOOL` `READ` for a known program (`RSPARAM`) returns a non-empty result — proves `S_RFC` authorization for the textpool FM

Report: `Layer 6 (native): 6/6 PASS` or `Layer 6 (native): 3/6 FAIL — native SDK not found`. If any 6.native.1–2 check fails, flag as **BLOCKER**. If only 6.native.4 fails but 6.native.1–3 pass, flag as **authorization issue** (usually `S_RFC` missing `RFC_NAME = ZMCP_ADT_*`).

## 6.gateway — Gateway mode (active when `SAP_RFC_BACKEND=gateway`)

*6.gateway.1 — Gateway env completeness:*
- [ ] `SAP_RFC_GATEWAY_URL` present and parses as a valid `https://host[:port]` URL
- [ ] `SAP_USERNAME` / `SAP_PASSWORD` / `SAP_CLIENT` present (reused as X-SAP-* headers)
- [ ] `SAP_RFC_GATEWAY_TOKEN` present (warn if missing — unauthenticated gateways are discouraged)

*6.gateway.2 — Gateway reachability:*
- [ ] `GET $SAP_RFC_GATEWAY_URL/health` returns HTTP 200 within 10s (TLS handshake + routing + gateway process all validated in one call)
- [ ] Response body is JSON with `status: "ok"` or equivalent. Surface `sdk_version` / `pool_size` if the gateway reports them.

*6.gateway.3 — Live RFC probes (through the gateway):*
- [ ] `POST /rfc/dispatch` with action `PING` (or benign no-op) returns `{subrc: 0}` — proves gateway → SAP RFC works with the forwarded SAP credentials
- [ ] `POST /rfc/textpool` `READ` for `RSPARAM` returns non-empty `result[]` — proves full pipeline including `S_RFC` on ZMCP_ADT_TEXTPOOL

Report: `Layer 6 (gateway): 5/5 PASS` or `Layer 6 (gateway): 2/5 FAIL — gateway unreachable`. If 6.gateway.1 fails, direct user to `/sc4sap:sap-option` to fill the gateway block. If 6.gateway.2 fails, direct them to verify VPN / firewall / DNS / gateway process. If only 6.gateway.3 fails, credentials are being forwarded but SAP-side authorization is wrong.

## 6.odata — OData mode (active when `SAP_RFC_BACKEND=odata` or unset)

*6.odata.1 — Env completeness:*
- [ ] `SAP_RFC_ODATA_SERVICE_URL` present; format `https://<host>:<port>/sap/opu/odata/sap/ZMCP_ADT_SRV` (or equivalent service path)
- [ ] `SAP_USERNAME` / `SAP_PASSWORD` / `SAP_CLIENT` present (reused as Basic auth + sap-client query)

*6.odata.2 — Service availability (`$metadata` probe):*
- [ ] `GET $SAP_RFC_ODATA_SERVICE_URL/$metadata?sap-client=...` returns HTTP 200 with `Content-Type: application/xml`
- [ ] Response body contains `<edmx:Edmx` marker (valid OData v2 metadata XML)
- [ ] Response includes a `ComplexType Name="DispatchResult"` and `FunctionImport Name="Dispatch"` — proves the MPC definition reached the gateway
- [ ] If 404: service not registered — direct user to setup Step 9c + `/IWFND/MAINT_SERVICE` registration guide

*6.odata.3 — CSRF handshake:*
- [ ] `GET /$metadata` with header `X-CSRF-Token: Fetch` returns header `X-CSRF-Token: <non-empty-token>` and one or more `Set-Cookie` values
- [ ] If the server returns `X-CSRF-Token: required` on GET: Gateway is rejecting the basic auth — verify credentials and user's `S_RFC` authorization

*6.odata.4 — Live FunctionImport probes:*
- [ ] `POST /ZMCP_ADT_SRV/Dispatch?IV_ACTION='PING'&IV_PARAMS='%7B%7D'` (with CSRF token + cookie) returns HTTP 200 — proves DPC's EXECUTE_ACTION dispatches correctly
- [ ] `POST /ZMCP_ADT_SRV/Textpool?IV_ACTION='READ'&IV_PROGRAM='RSPARAM'&...` returns `d.Textpool.EV_SUBRC=0` and non-empty `EV_RESULT` — proves full pipeline ABAP side

Report: `Layer 6 (odata): 8/8 PASS` or `Layer 6 (odata): 3/8 FAIL — service not registered`. Common remediation:

| Failure | Action |
|---|---|
| 6.odata.1 env missing | `/sc4sap:sap-option` → set `SAP_RFC_ODATA_SERVICE_URL` |
| 6.odata.2 HTTP 404 | Run `/sc4sap:setup` (which triggers Step 9c) then register in `/IWFND/MAINT_SERVICE` |
| 6.odata.2 HTTP 401 | Basic auth rejected — verify `SAP_USERNAME` / `SAP_PASSWORD` |
| 6.odata.3 no CSRF token | ICF node for `/sap/opu/odata/` inactive — ask Basis to activate |
| 6.odata.4 HTTP 500 | `/IWBEP` backend registration missing (known gotcha) — see `docs/odata-backend.md` Troubleshooting; first try `SE38 → ZMCP_ADT_FLUSH_CACHE` then Basis `/IWBEP/REG_SERVICE` |
| 6.odata.4 subrc≠0 | User lacks `S_RFC` authorization for `ZMCP_ADT_DISPATCH` / `ZMCP_ADT_TEXTPOOL` |
