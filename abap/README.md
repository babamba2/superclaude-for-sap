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
2. Create FM `ZMCP_SSF_CONTENT` in function group `ZMCP_ADT_UTILS` — **not** remote-enabled — with the source of `zmcp_ssf_content.abap`; activate.
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
