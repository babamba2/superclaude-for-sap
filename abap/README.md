# ABAP Function Modules for MCP ADT

This directory contains ABAP source code for the `ZMCP_ADT_UTILS` function group, required by the `mcp-abap-adt` MCP server for Screen, GUI Status, and Text Element operations.

## Function Group: ZMCP_ADT_UTILS

### ZMCP_ADT_DISPATCH
JSON-based dispatcher for Screen (Dynpro) and GUI Status (CUA) operations.

**Interface:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_ACTION | STRING | Import | Action: DYNPRO_INSERT, DYNPRO_READ, DYNPRO_DELETE, CUA_FETCH, CUA_WRITE, CUA_DELETE |
| IV_PARAMS | STRING | Import | JSON string with action-specific parameters |
| EV_SUBRC | I | Export | Return code (0 = success) |
| EV_MESSAGE | STRING | Export | Error/info message |
| EV_RESULT | STRING | Export | JSON string with result data |

**`TABLE_READ` operations headers (ECC / 7.40, 2026-11-16).** `/sc4sap:ops-health-check` reads the job headers and steps (`TBTCO`, `TBTCP`), update request headers (`VBHDR`) and IDoc control records (`EDIDC`). Their delivery class is L / A, so `FORM table_read` lists them by name (`zmcp_adt_dispatch_ecc.abap`); job logs, update data (`VBDATA`, `VBMOD`) and IDoc data stay closed. On a system whose live dispatcher has other branches added, do not replace it: read and back up the live `ZMCP_ADT_DISPATCH`, add `AND lv_tab <> 'TBTCO' AND lv_tab <> 'TBTCP' AND lv_tab <> 'VBHDR' AND lv_tab <> 'EDIDC'` to the name list in front of the `SELECT SINGLE contflag FROM dd02l`, activate.

### ZMCP_ADT_TEXTPOOL
Dedicated text pool (text elements) read/write function.

**Interface:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_ACTION | STRING | Import | Action: READ or WRITE |
| IV_PROGRAM | STRING | Import | ABAP program name |
| IV_LANGUAGE | STRING | Import | Language key (1 char, defaults to logon language) |
| IV_TEXTPOOL_JSON | STRING | Import | JSON array of text pool rows (for WRITE) |
| EV_SUBRC | I | Export | Return code (0 = success) |
| EV_MESSAGE | STRING | Export | Error/info message |
| EV_RESULT | STRING | Export | JSON result (array of rows for READ) |

## Installation

These are automatically created during `/sc4sap:setup` (step after MCP connection check).
The setup uses `CreateFunctionGroup` and `CreateFunctionModule` MCP tools followed by `UpdateFunctionModule` to set the source code.

## Requirements
- `/UI2/CL_JSON` must be available (standard in S/4HANA and ECC 7.40+)
- Both function modules must be **RFC-enabled**
- Package: `$TMP` (local) or transportable Z-package

## ZMCP_SSF_LAYOUT + dispatcher action SSF_LAYOUT (GetSmartFormLayout)

Read-only page / window layout of one SmartForm for the MCP tool `GetSmartFormLayout`. Works on BASIS 7.31 (SOAP RFC backend) and 7.40 (OData backend); the server reaches it through `ZMCP_ADT_DISPATCH`, so no new OData function import is needed.

**Sources:**
- `zmcp_ssf_layout.abap` — FM `ZMCP_SSF_LAYOUT`, one source for 7.31 and 7.40 (no inline declarations, no `/UI2/CL_JSON`, no `ZCL_MCP_JSON`; the JSON is built in the FM). The `SSF_LAYOUT_*` FORMs at the end of the file go into the same function group.
- `zmcp_adt_dispatch_ssf_layout_branch.abap` — two snippets: A for the 7.31 dispatcher (`ZCL_MCP_JSON`), B for the ECC / 7.40 dispatcher (`/UI2/CL_JSON`). Each is one `WHEN 'SSF_LAYOUT'.` line for the `CASE` plus a `FORM ssf_layout` to append.

**Interface of ZMCP_SSF_LAYOUT:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_FORMNAME | TDSFNAME | Import | SmartForm name |
| IV_LANGUAGE | SPRAS | Import (optional) | Form language; empty → master language of the form |
| EV_SUBRC | SYSUBRC | Export | 0 = ok, 4 = form not found, 8 = other error |
| EV_MESSAGE | STRING | Export | Error / info message |
| EV_RESULT | STRING | Export | JSON: variants → pages → windows, coordinates raw with their units |

It reads `STXFADM` and the Form Builder object model (`CL_SSF_FB_SMART_FORM->LOAD` in display mode, page tree nodes, the window node's output attributes). Text contents, program lines, global data and the form interface are never returned.

**Install (per system, each step needs a transport and the user's OK):**
1. Create FM `ZMCP_SSF_LAYOUT` in function group `ZMCP_ADT_UTILS` — **not** remote-enabled — with the source of `zmcp_ssf_layout.abap`; activate. Where ADT source writes fail (some 7.31 systems), create it in SE37.
2. On 7.31, check in SE24 that `CL_SSF_FB_NODE` (`OBJ`, `OUTATTR`, `SUCC`), `CL_SSF_FB_PAGE` (`NEXTPAGE`, `PAGEORTN`, `PRINTMODE`), `CL_SSF_FB_WINDOW` (`WTYPE`, `WLEVEL`) and `CL_SSF_FB_OUTATTR` (`WLEFT` … `U_WHEIGHT`, `WFRAME`, `WSHADING`, `WEMPTY`) have these public attributes.
3. Read and back up the **live** `ZMCP_ADT_DISPATCH` (the repo copies can be older), then add the snippet that matches the release: A (7.31) or B (7.40). Activate.
4. Test with `GetSmartFormLayout` on a known form and on a name that does not exist (expect "not found").

Until step 3 is done the tool answers with an install hint (`Unknown action: SSF_LAYOUT`).

## ZMCP_SSF_CONTENT + dispatcher action SSF_CONTENT (GetSmartFormContent)

Read-only content of one SmartForm for the MCP tool `GetSmartFormContent` and the skill `/sc4sap:smartform-preview`: the whole form as Form Builder XML, its SmartStyles as CSS, SE78 graphics as BMP and SO10 include texts. Works on BASIS 7.31 (SOAP RFC backend) and 7.40 (OData backend) through `ZMCP_ADT_DISPATCH`.

**Sources:**
- `zmcp_ssf_content.abap` — FM `ZMCP_SSF_CONTENT`, one source for 7.31 and 7.40 (JSON built in the FM). Uses `FORM ssf_layout_str` of `ZMCP_SSF_LAYOUT`, so install that FM first, in the same function group.
- `zmcp_adt_dispatch_ssf_content_branch.abap` — snippet A (7.31 dispatcher) and B (ECC / 7.40 dispatcher): one `WHEN 'SSF_CONTENT'.` line plus a `FORM ssf_content` to append.

**Interface of ZMCP_SSF_CONTENT:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_PART | STRING | Import | `FORM`, `STYLE`, `GRAPHIC`, `STDTEXT` or `FONTS` (device type and printer fonts for a comma list of families in IV_NAME, device in IV_OBJECT) |
| IV_FORMNAME | TDSFNAME | Import (optional) | SmartForm name (`FORM`) |
| IV_NAME | STRING | Import (optional) | Style, graphic or text name |
| IV_OBJECT / IV_ID / IV_BTYPE | STRING | Import (optional) | Graphic key (defaults `GRAPHICS` / `BMAP` / `BCOL`) or text key (`TEXT` / `ST`) |
| IV_LANGUAGE | SPRAS | Import (optional) | `STDTEXT`: text language; `FORM`: texts of the XML in that language (`SET LOCALE LANGUAGE` around the export — the MCP asks for the form's master language when texts are missing in the logon language, as SAP prints them); empty → logon language |
| EV_SUBRC | SYSUBRC | Export | 0 = ok, 4 = not found, 8 = other error |
| EV_MESSAGE | STRING | Export | Error / info message |
| EV_RESULT | STRING | Export | JSON; XML, CSS and BMP in base64 |

`FORM` uses `FB_CONVERT_FORM_TO_XML` (active version, the same XML as SMARTFORMS > Utilities > Download), `STYLE` `SSF_CONVERT_STYLE_TO_CSS`, `GRAPHIC` `SAPSCRIPT_GET_GRAPHIC_BDS` + `SAPSCRIPT_CONVERT_BITMAP` with the size from `STXBITMAPS`, `STDTEXT` `READ_TEXT`. `CL_SSF_XSF_UTILITIES=>GET_BDS_GRAPHIC_AS_BMP` / `GET_SMART_STYLE_AS_CSS` are deliberately not used: they write the cache tables `SSFXSFBMP` / `SSFXSFCSS`. Program lines of the form are never returned by the MCP tool.

**Install (per system, each step needs a transport and the user's OK):**
1. `ZMCP_SSF_LAYOUT` installed (section above).
2. Create FM `ZMCP_SSF_CONTENT` in function group `ZMCP_ADT_UTILS` — **not** remote-enabled — with the source of `zmcp_ssf_content.abap`; activate. It needs `FORM ssf_layout_str` (`ZMCP_SSF_LAYOUT`) and, for part `FONTS`, `FORM ssf_choose_device` (`ZMCP_SSF_RENDER`) in the **same** function group. When `ZMCP_ADT_UTILS` sits in a transportable package, put `ZMCP_SSF_LAYOUT` and `ZMCP_SSF_CONTENT` into the function group of `ZMCP_SSF_RENDER` instead (local `$TMP` group on a test system); the dispatcher's `CALL FUNCTION` does not depend on the group.
3. Read and back up the **live** `ZMCP_ADT_DISPATCH`, add snippet A (7.31) or B (7.40), activate.
4. Test with `GetSmartFormContent` (`summary: true`) on a form with a logo.

Until step 3 is done the tool answers with an install hint (`Unknown action: SSF_CONTENT`).

## ZMCP_SSF_RENDER + dispatcher action SSF_RENDER (RenderSmartForm)

The output of a SmartForm exactly as SAP prints it, for given interface values, without printing: the form's generated function module runs with `CONTROL_PARAMETERS-GETOTF = 'X'` / `NO_DIALOG = 'X'`, the OTF comes back and is converted to PDF. Nothing is printed, spooled or sent, and the FM itself never writes — but the form's own program lines run as in a real print and may read the database, so pass invented sample values only. ECC / BASIS 7.40 only (`/UI2/CL_JSON`).

**Sources:**
- `zmcp_ssf_render.abap` — FM `ZMCP_SSF_RENDER`.
- `zmcp_adt_dispatch_ssf_render_branch.abap` — one `WHEN 'SSF_RENDER'.` line plus a `FORM ssf_render` to append to the ECC / 7.40 dispatcher.

**Interface of ZMCP_SSF_RENDER:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_FORMNAME | TDSFNAME | Import | SmartForm name |
| IV_PARAMS | STRING | Import (optional) | JSON array, one entry per interface parameter: `[{"name":"IS_HEADER","json":"{...}"}]` — internal values, a TABLES parameter or table type as an array; parameters not listed are passed initial |
| IV_LANGUAGE | SPRAS | Import (optional) | Output language |
| IV_DEVICE | RSPOPNAME | Import (optional) | Output device (its device type sets fonts and widths); default: the user's default device, else a SAPWIN / PDF device |
| IV_FAMILIES | STRING | Import (optional) | Comma list of the form's font families: without IV_DEVICE, the device type with printer fonts for most of them is chosen (TFO03) |
| EV_SUBRC | SYSUBRC | Export | 0 = ok, 4 = form not found, 8 = other error |
| EV_MESSAGE | STRING | Export | Error / info message |
| EV_RESULT | STRING | Export | JSON `{"form","fm","pages","otf","pdf"}`, OTF and PDF in base64 |

**Install (per system, each step needs a transport and the user's OK):**
1. Create FM `ZMCP_SSF_RENDER` in function group `ZMCP_ADT_UTILS` — **not** remote-enabled — with the source of `zmcp_ssf_render.abap`; activate.
2. Read and back up the **live** `ZMCP_ADT_DISPATCH`, add the branch, activate.
3. Test with `RenderSmartForm` on a form without program lines that read the database.

Until step 2 is done the tool answers with an install hint (`Unknown action: SSF_RENDER`).

**Guarded variant (S/4 and other systems where the helper goes to `$TMP`):** `zmcp_ssf_render_s4.abap` (same FM name, interface and result) + `zmcp_adt_dispatch_ssf_render_branch_s4.abap`. FM in its own function group `ZMCP_SSFR` in package `$TMP`, not remote-enabled. Added guards: development-type clients only (T000 C / D / E; unreadable T000 refused); form names `[A-Z0-9_]` only (dispatcher: at most 30 characters); allowed forms are SAP-delivered SmartForms of the example package `SMART`, the SAP forms named in the FM's `lc_sap_extra`, and own test forms `ZSC4SAP_*` in `$TMP` — any other customer form is refused; the forms of `lc_sap_extra` (today `LB_BIL_INVOICE`) are real business forms whose program lines, text and address nodes read the database by the passed keys, so for them every filled document / partner / address key (component names in `lc_key_re` of FORM `ssf_key_guard`: `BIL_NUMBER`, `VBELN*`, `OBJKY`, `ADDR_NO`, `PAYER`, `*IBAN`, …) must start with `ZZ`, and `IS_BIL_INVOICE-HD_GEN-BIL_NUMBER` and `IS_NAST-OBJKY` must be given as `ZZ…` — SD numbers are numeric, so such keys never reach a real document (refused otherwise; the plugin's `sampleOf` in `scripts/smartform/preview-workbench.mjs` emits `ZZ…` for these names); `params` at most 200 000 characters; the `ARCHIVE_*` / `MAIL_*` standard parameters are always passed initial; Known write: `SSF_FUNCTION_MODULE_NAME` generates the form's function module when it is missing or stale, as a real print does; the generator commits the new `/1BCDWB/` function group frame itself, so the helper COMMITs right after the call (nothing else is in that LUW yet) — a rollback there left one orphan frame per render and regenerated each time. After that, `ROLLBACK WORK` on every path undoes the form code's uncommitted changes.

## ZMCP_SSF_UPLOAD + dispatcher action SSF_UPLOAD_XML (CreateSmartForm)

Creates (or, when asked, replaces) a Z/Y SmartForm from Form Builder XML — the format of SMARTFORMS > Utilities > Download and of `GetSmartFormContent`'s form XML — the way the SMARTFORMS upload does it: the XML is parsed with iXML and loaded with `CL_SSF_FB_SMART_FORM->XML_UPLOAD`, checked, and stored active (the function module is generated, also for a replaced form) when the check finds no error; otherwise it is stored inactive and the check messages are returned. **Writes to the repository — DEV systems only.** ECC / BASIS 7.40 only (`/UI2/CL_JSON`, `CL_ABAP_GZIP`).

The OData `Dispatch` function import carries its parameters in the URL, so the MCP sends the XML raw-deflate compressed and base64-encoded in parts of 5000 characters; the dispatcher keeps parts 1..n-1 in `INDX` (area `ZM`, id `SSFUP<upload id><part>`) and joins them on the last part.

**Sources:**
- `zmcp_ssf_upload.abap` — FM `ZMCP_SSF_UPLOAD`.
- `zmcp_adt_dispatch_ssf_upload_branch.abap` — one `WHEN 'SSF_UPLOAD_XML'.` line plus a `FORM ssf_upload_xml` for the ECC / 7.40 dispatcher.

**Interface of ZMCP_SSF_UPLOAD:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_FORMNAME | TDSFNAME | Import | Target form, Z* or Y* |
| IV_XML | STRING | Import | The XML in base64 |
| IV_DEVCLASS | DEVCLASS | Import (default `$TMP`) | Package; another than a local one needs IV_TRANSPORT |
| IV_TRANSPORT | TRKORR | Import (optional) | Request the form is recorded in (no dialog) |
| IV_OVERWRITE | CHAR1 | Import (optional) | `X` = replace an existing form; without it an existing form is refused |
| IV_ACTIVATE | CHAR1 | Import (default `X`) | Check and store active; space = store inactive without a check |
| IV_GZIP | CHAR1 | Import (optional) | `X` = IV_XML is raw-deflate compressed before base64 |
| EV_SUBRC | SYSUBRC | Export | 0 = stored (`active` false + `errors` when the check failed), 4 = refused, 8 = error |
| EV_MESSAGE | STRING | Export | Error / info message |
| EV_RESULT | STRING | Export | JSON `{"form","language","mode","active","fm","errors":[{"class","msg","fieldname"}],"warnings":[...]}` |

## ZMCP_SSF_DELETE + dispatcher action SSF_DELETE_FORM (DeleteSmartForm)

Deletes a Z/Y SmartForm of a **local** package (`$TMP`, `$…`) with its generated function module and TADIR entry — for forms created by `CreateSmartForm` and thrown away. A transportable form is refused (its deletion belongs on a transport: use SMARTFORMS). Without `confirm` nothing is deleted and the result says what would be. **Writes — DEV systems only.**

**Sources:** `zmcp_ssf_delete.abap` (FM `ZMCP_SSF_DELETE`: IV_FORMNAME, IV_CONFIRM → EV_SUBRC / EV_MESSAGE / EV_RESULT `{"form","package","fm","deleted"}`), `zmcp_adt_dispatch_ssf_delete_branch.abap`.

**Install (per DEV system, each step needs a transport and the user's OK):**
1. Create FMs `ZMCP_SSF_UPLOAD` and `ZMCP_SSF_DELETE` in function group `ZMCP_ADT_UTILS` — **not** remote-enabled — with the sources above; activate.
2. Read and back up the **live** `ZMCP_ADT_DISPATCH`, add both branches, activate.
3. Test: `CreateSmartForm` with the XML of an existing form under a new Z name in `$TMP`, `RenderSmartForm` both and compare, then `DeleteSmartForm` the copy.

Until step 2 is done the tools answer with an install hint (`Unknown action: SSF_UPLOAD_XML` / `SSF_DELETE_FORM`).

## ZMCP_FP_CONTENT + dispatcher actions FP_CONTENT / FP_RENDER (GetAdobeFormContent, RenderAdobeForm)

Read-only access to an Adobe form (SFP) for previews and checks — ADT has only a generic object-properties URI for form objects (`/sap/bc/adt/vit/wb/object_type/sfpf5f/object_name/<FORM>`), no content endpoint, so the content comes through the standard form API. BASIS 7.40 or later (`/UI2/CL_JSON`). Runs only in a development-type client (`T000-CCCATEGORY` C, D or E; production, test and SAP reference clients, and a client T000 cannot tell, are refused). Form names: letters, digits, `_` and `/`, at most 30 characters. `FORM`, `LAYOUT`, `INTERFACE`, `CHECK` and `RENDER_XDP` write nothing.

**Sources:** `zmcp_fp_content.abap` (FM `ZMCP_FP_CONTENT`), `zmcp_adt_dispatch_fp_content_branch.abap` (`WHEN 'FP_CONTENT'.` and `WHEN 'FP_RENDER'.` lines plus `FORM fp_call`; `FP_CONTENT` refuses the part `RENDER`).

**Interface of ZMCP_FP_CONTENT:**
| Parameter | Type | Direction | Description |
|-----------|------|-----------|-------------|
| IV_PART | STRING | Import | `FORM` (whole form XML, `CL_FP_HELPER=>CONVERT_FORM_TO_XSTRING`, + header), `LAYOUT` (XDP / XFA template, `IF_FP_LAYOUT->GET_LAYOUT_DATA`), `INTERFACE` (interface XML, `CONVERT_INTERFACE_TO_XSTRING`), `CHECK` (SAP's own form check `CL_FP_WB_FORM=>CHECK` — what SFP's Check shows — on the inactive version if there is one, else the active one; display mode, nothing saved, activated or corrected; MCP: `GetAdobeFormContent` with `include_check`), `RENDER` (PDF from ADS), `RENDER_XDP` (an XDP template + XML data straight into ADS via `CL_FP_ADS_UTIL=>RENDER_PDF` — no form object, no form code, no spool, nothing stored; labels `ZF_CINE_TICKET`, `ZFORM_FDP_SCRATCH`, `ZSC4SAP_*`; MCP `RenderAdobeXdp`) |
| IV_NAME | FPNAME | Import | Form name; for `INTERFACE` the interface name |
| IV_LANGUAGE | SPRAS | Import (optional) | Texts / output language; empty → logon language |
| IV_PARAMS | STRING | Import (optional) | `RENDER`: JSON array `[{"name":"IS_HEADER","json":"{...}"}]`, internal values; parameters not listed are passed initial. An extra entry `{"name":"$GETXML","json":"true"}` also returns `"xml"`: the data XML the form hands ADS (`SFPOUTPUTPARAMS-GETXML` → `FPFORMOUTPUT-XML`, base64, ≤ 2 000 000 bytes, else `"xmlError"`) — MCP `RenderAdobeForm` `get_xml` |
| EV_SUBRC | SYSUBRC | Export | 0 = ok, 4 = not found, 8 = other error |
| EV_MESSAGE | STRING | Export | Error / info message |
| EV_RESULT | STRING | Export | JSON; XML, XDP and PDF in base64 |

`RENDER` calls the generated function module (`FP_FUNCTION_MODULE_NAME`) between `FP_JOB_OPEN` (`GETPDF = 'X'`, `NODIALOG = 'X'`, no preview) and `FP_JOB_CLOSE`; the PDF comes back to the caller. The form's own context coding runs as in a real print and may read the database — pass invented values only. `RENDER` is limited to an allow-list of SAP example forms of package `SFPT`, by exact name, held in the FM (`FP_EXAMPLE_01`, `FP_TEST_00` … `FP_TEST_PAGE_BREAK`, 18 names; Z / Y / namespace forms are refused with a clear message), active forms only, `IV_PARAMS` at most 200 000 characters; output parameters set explicitly (no device, no new / immediate spool request, archiving mode print only). Writes: `FP_FUNCTION_MODULE_NAME` generates the form's function module (`FP_FORM_GENERATE`: `/1BCDWB/…`, `FPCONTEXTI`) when it is missing or older than the form — as any print does — and is COMMITted right after that call, before any form code runs (a later rollback would orphan the generated function group frame); and `RENDER` runs the form's own initialization code, which may change data — that is why it is allow-listed — a `ROLLBACK WORK` after `FP_JOB_CLOSE` undoes everything not committed (an explicit `COMMIT WORK` in the form's code cannot be undone, hence the example-forms limit). A form with a SmartForm-type interface (every migrated form) has a generated function module with the SmartForm signature that opens its own job: `RENDER` then skips `FP_JOB_OPEN` / `FP_JOB_CLOSE`, passes `CONTROL_PARAMETERS` (`NO_DIALOG`, `GETOTF` → PDF, no preview), `OUTPUT_OPTIONS` (no device, no new / immediate spool request, archiving mode print only) and `USER_SETTINGS = space`, never `ARCHIVE_*` / `MAIL_*`, and unpacks the PDF from `JOB_OUTPUT_INFO-OTFDATA` (where the generated `%MOVE_PDF` puts it); no data XML on that path. Needs a working ADS connection (`FPCONNECT`).

**Install (DEV system only, the user's OK per step):**
1. Create function group `ZMCP_FP` in package `$TMP` (local, no transport) and FM `ZMCP_FP_CONTENT` in it — **not** remote-enabled — with the source of `zmcp_fp_content.abap`; activate.
2. Read and back up the **live** `ZMCP_ADT_DISPATCH`, add the branch (a workbench request — the dispatcher's package is transportable), activate.
3. Test: `FORM`, `LAYOUT`, `INTERFACE` on the SAP example `FP_TEST_00`; a name that does not exist (expect subrc 4); `RENDER` on `FP_TEST_00`, then check in SP01 that no spool request was added; `RENDER` on a customer form name (expect the example-forms refusal).

Until step 2 is done the dispatcher answers `Unknown action: FP_CONTENT` / `FP_RENDER`.

## ZMCP_FP_MIGRATE + dispatcher action FP_MIGRATE (CreateAdobeFormFromSmartForm) — DEV write

**Sources:** `zmcp_fp_migrate.abap` (FM `ZMCP_FP_MIGRATE`, function group `ZMCP_FP`, not remote-enabled), `zmcp_adt_dispatch_fp_migrate_branch.abap` (`WHEN 'FP_MIGRATE'.` plus `FORM fp_migrate_call`).

Runs the steps of `CL_SSF_MIGRATION=>MIGRATE` with SAP's own classes for a SAP-delivered SmartForm (TADIR R3TR SSFO, source system SAP, not a text module) into NEW objects `ZSC4SAP_AFM_*` (form and interface) in package `$TMP`, and activates them. Differences to `MIGRATE`, because the dispatcher has no SAP GUI: the package `$TMP` is passed (no package dialog), an existing target name is refused (no delete + recreate), the migration log (object SMARTFORM / XFAMIGRATION) is read back instead of displayed, the form type *migrated* is set through the public XML path of SFP's form upload (`CL_FP_HELPER=>CONVERT_FORM_TO_XSTRING` → TYPE element → `CONVERT_XSTRING_TO_FORM` on the new empty form, checked with `GET_FORM_TYPE` before anything is saved) because `CL_FP_FORM->SET_FORM_TYPE` is protected — and SAP's loops (`CL_FP_LOOP`) refuse forms of any other type, where SAP's migration of a 4.6C table leaves two sibling context nodes with one name (the loop's work-area field and the table's cell folder — "Node name X is not unique", the form does not activate), the non-DATA node is renamed `<NAME>_<n>` before the form is saved and listed under `renamed` (a node with children, or a bound path without a DATA twin, stops the run before the form is saved), the layout gets a new layout id, hashes and ADS cache info as a Designer save gives it (`CL_FP_HELPER=>SET_NEW_LAYOUT_ID` / `SET_NEW_LAYOUT_HASH` / `SET_NEW_CACHE_INFO` — MIGRATE leaves the placeholder `0$0$0$0$v1.0$?`, so all migrated forms would share one ADS template cache slot and print each other's layouts; returned as `cacheInfo`), include texts whose language field is `CONTROL_PARAMETERS-LANGU` (a SmartForm interface parameter the Adobe context does not have) get no language — they print in the output language, as meant — and, only with the optional `sender_country` (T005 key, dispatcher param), address nodes without a sender country get it (both listed under `adjusted`; other `CONTROL_PARAMETERS-` / `OUTPUT_OPTIONS-` / `SFSY-` fields stay as they are and SAP's check names them), and the form description ends with the marker ` [sc4sap]` — `RENDER` of `ZMCP_FP_CONTENT` prints a `ZSC4SAP_AFM_*` form only with it, in `$TMP` and of type migrated (plus the one SFP-migrated comparison form `ZSC4SAP_AFM_GUI01`: `$TMP`, migrated, no marker). For every `ZSC4SAP_AFM_*` render the same impossible-key rule as `SSF_RENDER` applies: filled document / partner / address keys (`BIL_NUMBER`, `VBELN*`, `OBJKY`, `ADDR_NO`, `PAYER`, `*IBAN`, …) must start with `ZZ`, and `IS_BIL_INVOICE-HD_GEN-BIL_NUMBER` / `IS_NAST-OBJKY` must be `ZZ…` when the interface has those parameters — a migrated business form reads the database by them. Development-type clients only (T000 C / D / E). Preset `FULL`: every `SSFMEXPROPERTIES` option except `ALTERNATIVE_TRUE` and `TEXT_PLACEHOLDER`.

**Interface of ZMCP_FP_MIGRATE:** `IV_SOURCE`, `IV_FORM`, `IV_INTERFACE`, `IV_PRESET` (STRING, import), optional `IV_SENDER_COUNTRY` (LAND1) and `IV_CORRECTION` (STRING); `EV_SUBRC`, `EV_MESSAGE`, `EV_RESULT` (export). Result `{"source","form","interface","options","raised","error","saved","left","active","activation","renamed","adjusted","cacheInfo","correction","log":[{"type","text"}]}`. When SAP's migration raises after the interface was saved, `left` lists it; this FM never deletes.

**Layout correction (`IV_CORRECTION`, dispatcher param `correction`, MCP `correction_file`):**
- What it is: a JSON op list `{"strict","ops":[...]}` (the flat form the MCP tool makes from a spec v1 file). It is applied to the migrated XDP before the new layout id / hash / cache info and before the save.
- How it edits: only through the iXML DOM, only in the `<template>` packet.
- Targets:
  - a name path starting at the root subform's own name; `name[n]` is 0-based, and unnamed subforms are transparent
  - or the id of a `<proto>` child, optionally with a path below it
  - or an `xliff:id`
- Ops: `layout`, `geometry`, `margin`, `font`, `para`, `xhtml` (allow-listed CSS on the n-th paragraph of the rich text), `picture` (`format` → `<format><picture>`, `display` → `<ui><picture>`), `border` (edge 0–3), `presence` (needs `basis`), `datePicture` (the only script edit: the field's initialize scripts must hold exactly one `$.format.picture = DateFmt(<n>, $.locale)`; that `DateFmt` call becomes the string literal of a `date{…}` picture; otherwise refused), `bind` (a subform or field: `match` `dataRef` with a `$record` ref — names, `[0]` or `[*]` only — or `none`; needs `basis`; binds below the target outside the new ref's `[*]` prefix are warned).
- Model ops (gap G5 a, no layout target, need `basis`):
  - `contextDeactivate` `{node}`: one program-lines node, by its path of node names from the context root (`CONTEXT/MAIN/…`), gets state inactive — as Form Builder's "deactivate". Read-back: still-active program lines that take one of its outputs as input are warned.
  - `initSumByKey` `{source, target, key[1–5], sum[1–5]}`: appends a fixed `COLLECT` loop to the interface initialization (source = a parameter or global table, target = a global standard table with the standard key and a flat line, DDIC line types; key and sum fields of the same type and length in both; keys not numeric, sums I / INT8 / P / F / DECFLOAT; only checked names go into the code). The interface check must not report new errors, else the change is undone and the op refused.
  - They run on the new interface (before it is saved) and the new context (before the form is saved); their results are in the same `correction` report.
- Checks: every value against allow-lists or as a measurement (mm / pt / cm / in).
- When the op list is checked: before anything is saved.
- Result: `correction` lists every op as applied / not_found / ambiguous / refused, with counts, `partial`, and font substitution warnings.
- Strict: if any op is not applied, the form is not saved.

**Install (DEV only):** create the FM in `ZMCP_FP` ($TMP) with the source, activate; add the `FP_MIGRATE` branch and the FORM to the live dispatcher (read and back it up first); activate.
