# Layer 6 — RFC Backend diagnostics (per-backend breakdown)

Referenced by `diagnostic-checks.md`. Resolve `SAP_RFC_BACKEND` from the active profile `sap.env` first (default `odata` when unset), then run **only** the matching sub-section below. Output a one-line banner stating which sub-section was executed.

## 6.0 — Removed backends (always, before the sub-sections)

- [ ] `SAP_RFC_BACKEND` is not `native`, `gateway` or `zrfc`, and `SAP_CONNECTION_TYPE` is not `rfc`. Otherwise report **BLOCKER** "removed in MCP 4.10.0, set `SAP_RFC_BACKEND=odata` or `soap` and remove `SAP_CONNECTION_TYPE`" — the MCP server refuses to start with these values. Fix via `/sc4sap:sap-option` → "rfc", then restart Claude Code. Skip the sub-sections below.

## 6.soap — SOAP mode (active when `SAP_RFC_BACKEND=soap`)

*6.soap.1 — ICF node hint (print once, always):*
- [ ] Remind user that `/default_host/sap/bc/soap/rfc` ICF node must be active in SICF. No automated probe — SAP does not expose an anonymous GET on this endpoint; a 405 on GET is the positive signal. Users can run:
      `curl -s -o /dev/null -w "%{http_code}" -u $SAP_USERNAME:$SAP_PASSWORD "$SAP_URL/sap/bc/soap/rfc?sap-client=$SAP_CLIENT"` — expect `405`.

The SOAP backend otherwise reuses Layer 3's HTTPS ADT channel — its health is already covered there. Report Layer 6 as `[PASS — SOAP backend relies on Layer 3 HTTPS]`.

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
