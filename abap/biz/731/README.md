# ZMCP_BIZ — manual install on ECC BASIS 7.31

ADT cannot write source on 7.31, so these objects go in by hand (SE11 / SE24 / SE37).
Prerequisite: class `ZCL_MCP_JSON` (7.31 helper, `abap/zcl_mcp_json_731.clas.abap`) is installed.

The interface and the handler classes are the same source as on 7.40 / S/4.
Only `zcl_mcp_biz_exec.clas.abap` (JSON through `ZCL_MCP_JSON`) and the
function module body (no inline declaration) differ.

## Order

1. **SE11 table `ZMCP_BIZ_LOG`**: fields in `zmcp_biz_log.tabl.md`. Activate.
2. **SE24 interface `ZIF_MCP_BIZ_ACTION`**: Source-based editor (Goto > Source Code Based), paste `zif_mcp_biz_action.intf.abap`. Activate.
2a. **SE24 system-family reads** (before the handlers, Final, activate each): interface `ZIF_MCP_BIZ_SYS` (`zif_mcp_biz_sys.intf.abap`), class `ZCL_MCP_BIZ_SYS_ECC` (`zcl_mcp_biz_sys_ecc.clas.abap`), then factory `ZCL_MCP_BIZ_SYS` (`zcl_mcp_biz_sys.clas.abap`). Never install `ZCL_MCP_BIZ_SYS_S4` here (S/4HANA only, `../s4/`).
3. **SE24 handler classes, one per module** (output: also `ZCL_MCP_BIZ_OUT`, `zcl_mcp_biz_out.clas.abap`) (Final, activate each): `ZCL_MCP_BIZ_MM` (`zcl_mcp_biz_mm.clas.abap`, includes the PO customer include fields, see `../CBO-EXTENSION-GUIDE.md`), `ZCL_MCP_BIZ_PP`, `ZCL_MCP_BIZ_SD`, `ZCL_MCP_BIZ_FI`, `ZCL_MCP_BIZ_CO`.
   The older split classes (`ZCL_MCP_BIZ_MM_PUR`, `_PO_CBO`, `_PP_ORD`, `_SD_BASE`, `_SD_SO`, `_SD_DLV`, `_SD_BIL`, `_PRE_SD`) were deleted on 2026-11-10 (merged into ZCL_MCP_BIZ_MM / _PP / _SD / _PRECHECK): do not install them.
4. **SE24 class `ZCL_MCP_BIZ_PRECHECK`** (before step 5): paste `zcl_mcp_biz_precheck.clas.abap` (SD facts included: `run_sd`). Final. Activate. Mode PRECHECK (read only) needs the TVARVC selection option `ZMCP_BIZ_PRECHECK_TABLES` (STVARV: type S, sign I, option EQ, low = table name) listing the tables its exists queries may ask about.
5. **SE24 class `ZCL_MCP_BIZ_EXEC`**: paste `zcl_mcp_biz_exec.clas.abap`. Final. Activate.
6. **SE37 function group `ZMCP_BIZ`**, then function module `ZMCP_BIZ_EXECUTE`:
   - Attributes: **Remote-Enabled Module**.
   - Import (all *Pass Value*, type `STRING`): `IV_ACTION`, `IV_MODE`, `IV_PARAMS` (optional), `IV_TOKEN` (optional), `IV_IDEM_KEY` (optional).
   - Export (all *Pass Value*): `EV_SUBRC` TYPE `I`, `EV_MESSAGE` TYPE `STRING`, `EV_RESULT` TYPE `STRING`, `EV_TOKEN` TYPE `STRING`.
   - Source: paste only the body of `zmcp_biz_execute.func.abap` (from `DATA lx_root` to the line before `ENDFUNCTION`).
7. Activate all, assign everything to one transport request.

## Smoke test in SE37 (read only)

- `IV_MODE = LIST` → `EV_SUBRC = 0`, `EV_RESULT` lists 12 actions.
- `IV_MODE = QUERY`, `IV_ACTION = MM.PO.GET_DETAIL`, `IV_PARAMS = {"ebeln":"<a PO number>"}` → PO header and items.
- `IV_MODE = QUERY`, `IV_ACTION = MM.PO.LIST_OPEN`, `IV_PARAMS = {"date_basis":"overdue_until_today","include_unreleased":"false","max_rows":"20"}`.

## 7.31 note

`BAPI_PO_RESET_RELEASE` has no `NO_COMMIT` on this release and commits by itself.
The preview of `MM.PO.RESET_RELEASE` reports `irreversible = true`.
