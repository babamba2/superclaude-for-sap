# RFC backend managed keys

Referenced by `SKILL.md` from `<Managed_Keys>` and `<Validation>`. Per-backend env fields for `SAP_RFC_BACKEND = odata | soap`.

## Backend selector

- `SAP_RFC_BACKEND` — `odata` (default) | `soap`
  - `odata` — SAP OData v2 service `ZMCP_ADT_SRV` (pure HTTPS; ABAP side needs `ZCL_ZMCP_ADT_MPC`/`_DPC` installed by setup Step 9c and the service registered in `/IWFND/MAINT_SERVICE`)
  - `soap` — HTTPS via `/sap/bc/soap/rfc` (reuses `SAP_URL` + `SAP_USERNAME` + `SAP_PASSWORD`; no extra fields needed)
- `native`, `gateway` and `zrfc` were removed in MCP 4.10.0. The MCP server refuses to start with them.

## OData block (only when `SAP_RFC_BACKEND=odata`)

- `SAP_RFC_ODATA_SERVICE_URL` — e.g. `https://sap.company.com:44300/sap/opu/odata/sap/ZMCP_ADT_SRV` (required)
- `SAP_RFC_ODATA_CSRF_TTL_SEC` — CSRF token cache TTL in seconds, default `600` (min 60)

> When `SAP_RFC_BACKEND=odata`, the existing `SAP_USERNAME` / `SAP_PASSWORD` are reused as Basic auth against the OData service URL, and `SAP_CLIENT` is appended as `?sap-client=<n>` on every request. No extra credential block is needed. The client performs an automatic CSRF handshake on first call (GET `$metadata` with `X-CSRF-Token: Fetch`), caches the token for `SAP_RFC_ODATA_CSRF_TTL_SEC` seconds, and refreshes on HTTP 403.

## Validation rules (applied by sap-option workflow)

- `SAP_RFC_BACKEND`: one of `odata` | `soap`. On switching:
  - → `odata`: warn `SAP_RFC_ODATA_SERVICE_URL` must be set, MPC/DPC classes must be installed (setup Step 9c), and the service must be registered in `/IWFND/MAINT_SERVICE`
  - → `soap`: warn the ICF node `/sap/bc/soap/rfc` must be active in SICF
  - Always suggest running `/sc4sap:sap-doctor` afterwards to exercise Layer 6.
- Profile still has `native` / `gateway` / `zrfc` (or `SAP_CONNECTION_TYPE=rfc`): tell the user these were removed in MCP 4.10.0, offer `odata` / `soap`, and comment out the leftover `SAP_RFC_*` keys of the removed backend and `SAP_CONNECTION_TYPE`.
- `SAP_RFC_ODATA_SERVICE_URL`: must match `^https?://[^ ]+` and not end with `/` (trailing slashes stripped automatically at call time; reject on input for cleanliness).
- `SAP_RFC_ODATA_CSRF_TTL_SEC`: integer ≥ 60. Values below 60 silently clamp to 60 on the client; reject non-numeric input.
