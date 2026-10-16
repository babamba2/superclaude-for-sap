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
| IV_PART | STRING | Import | `FORM`, `STYLE`, `GRAPHIC` or `STDTEXT` |
| IV_FORMNAME | TDSFNAME | Import (optional) | SmartForm name (`FORM`) |
| IV_NAME | STRING | Import (optional) | Style, graphic or text name |
| IV_OBJECT / IV_ID / IV_BTYPE | STRING | Import (optional) | Graphic key (defaults `GRAPHICS` / `BMAP` / `BCOL`) or text key (`TEXT` / `ST`) |
| IV_LANGUAGE | SPRAS | Import (optional) | Include text language; empty → logon language |
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
