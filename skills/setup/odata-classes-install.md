# Step 9c — OData backend classes install (conditional)

Referenced by `wizard-steps.md` Step 9c. **Run ONLY when `SAP_RFC_BACKEND=odata`.**

Skip this entirely if backend is `soap`, `native`, or `gateway`.

## Prerequisite — SEGW project shell (user-side, 5 minutes)

The SEGW project must be created via SAPGUI — SEGW is not ADT-MCP-controllable. Tell the user:

> **SAPGUI → SEGW → Create Project**
> - **Project**: `ZMCP_ADT`
> - **Type**: `Service with SAP Annotations`
> - **Package**: `$TMP`
>
> SEGW auto-generates 4 classes:
> - `ZCL_ZMCP_ADT_MPC` (base, do not modify)
> - `ZCL_ZMCP_ADT_MPC_EXT` (extension, sc4sap injects code here)
> - `ZCL_ZMCP_ADT_DPC` (base, do not modify)
> - `ZCL_ZMCP_ADT_DPC_EXT` (extension, sc4sap injects code here)
>
> Confirm "SEGW 프로젝트 생성 완료" back to sc4sap before proceeding.

## Automated by sc4sap (MCP)

1. **Check existence** — `SearchObject(ZCL_ZMCP_ADT_MPC, CLAS)`. If absent, halt and re-prompt user for SEGW project creation.
2. **Inject MPC_EXT source** — `UpdateClass ZCL_ZMCP_ADT_MPC_EXT` with the source of `abap/zcl_zmcp_adt_mpc_ext.clas.abap` verbatim (already `INHERITING FROM zcl_zmcp_adt_mpc` with `METHODS define REDEFINITION`). It defines every function import the MCP server calls: `Dispatch`, `Textpool`, `DdicTabl` / `DdicTtyp` / `DdicDtel` / `DdicDoma` / `DdicActivate`, `DdicBadi`, the `Ddic*Read` actions and `WlTcodeUsage` / `WlJobUsage`. Activate.
3. **Inject DPC_EXT source** — `UpdateClass ZCL_ZMCP_ADT_DPC_EXT` with the source of `abap/zcl_zmcp_adt_dpc_ext.clas.abap` verbatim (routes each action to its `ZMCP_*` FM). Activate. An FM that is not installed on this system (e.g. the ECC-only DDIC FMs on S/4HANA) only fails when that action is called — the class still compiles.
   - The older `abap/zcl_zmcp_adt_mpc.clas.abap` / `_dpc.clas.abap` carry only `Dispatch` / `Textpool`; do not use them for the `_EXT` classes — without the `Ddic*` actions every ECC DDIC write and read fails.
4. **Install cache / diagnostics program** — `CreateProgram` + `UpdateProgram` for `ZMCP_ADT_FLUSH_CACHE` with source from `abap/zmcp_adt_flush_cache.abap`. Activate. This program supports three modes:
   - `P_FLUSH` — flush OData model / service-alias / proxy caches
   - `P_DIAG` — instantiate `ZCL_ZMCP_ADT_DPC_EXT` directly and call `execute_action` (bypasses Gateway, proves ABAP logic)
   - `P_REG` — programmatically INSERT backend service rows into `/IWBEP/I_MGW_SRH`, `/I_MGW_OHD`, `/I_MGW_SRG` (emergency escape hatch when Basis isn't available)

## Manual follow-up (cannot be automated via MCP)

Print the registration guide — two mandatory paths, one or the other:

### Path A — Basis cooperation (recommended, production-grade)

Send the Basis team the template in `docs/odata-backend.md` → "Basis Team Request". They run `/IWBEP/REG_SERVICE` + `/IWFND/MAINT_SERVICE` on the user's behalf (~5 minutes total).

### Path B — Self-service via SEGW (requires `/IWBEP/SB` auth)

In SEGW, with project `ZMCP_ADT` open:

1. **Generate Runtime Objects** (F6) → accept proposed class names → Local Object (`$TMP`)
2. **Activate** (Ctrl+F3) — whole project
3. **Register Service** (toolbar globe icon) → System Alias `LOCAL` → Package `$TMP` → OK
4. **`/IWFND/MAINT_SERVICE`** → Add Service → System Alias `LOCAL` → Get Services → `ZMCP_ADT_SRV` → Add Selected Services → Package `$TMP`
5. **SICF** → `/default_host/sap/opu/odata/sap/ZMCP_ADT_SRV` → right-click → Activate Service (if not already active)

### Path C — Emergency escape hatch

If neither A nor B is possible (user lacks both Basis contact and `/IWBEP/SB` auth), run:

> **SE38 → `ZMCP_ADT_FLUSH_CACHE` → F8 with `P_REG = X`**

This is a **partial** workaround — it writes the minimum SRH/OHD/SRG rows but may leave some related tables under-populated (descriptions, SHM cache flags). Full Basis registration remains preferred because it populates all related tables and respects transport discipline.

## Verification — `/sc4sap:sap-doctor` Layer 6.odata

After the user confirms service is registered, verify end-to-end:

1. Client config complete (`SAP_RFC_ODATA_SERVICE_URL` set)
2. Metadata endpoint reachable (GET `$metadata` → 200 with XML)
3. CSRF handshake works (GET `$metadata` with `X-CSRF-Token: Fetch` → response header has non-empty token)
4. FunctionImport dispatch works (POST `/Textpool` with RSPARAM → response includes `{subrc: 0, result: [...]}` non-empty)

If 4 fails with HTTP 500 "unknown internal server error":
- Run `ZMCP_ADT_FLUSH_CACHE` (all checkboxes) — covers most cache drift cases
- If still failing, the `/IWBEP` registration is partial — follow Basis path A

## Troubleshooting

Full table of symptoms and fixes: `docs/odata-backend.md` → "Troubleshooting".

Most common:

| Symptom | Root cause | Fix |
|---|---|---|
| 500 on FunctionImport POST | `/IWFND/MAINT_SERVICE` has the service but `/IWBEP` backend rows are empty | Path A (Basis) or Path C (`P_REG = X`) |
| 404 on `$metadata` | ICF node inactive or service not registered | SICF activate + `/IWFND/MAINT_SERVICE` Add Service |
| 403 "CSRF Token Required" on every POST | Client bug (sc4sap handles this automatically) or reverse proxy stripping cookies | Check `odataRfc.ts` behaviour; verify proxy doesn't strip `SAP_SESSIONID_*` |
| 401 Unauthorized | Basic auth wrong | Verify `SAP_USERNAME` + `SAP_PASSWORD` in `sap.env` |
