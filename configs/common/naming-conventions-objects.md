# ABAP Object-Specific Naming / 오브젝트별 명명 규칙

Per-type naming patterns for ABAP objects. Companion to [naming-conventions.md](naming-conventions.md) — consult the parent for General Rules, Module Codes, Code-Level Naming, Special Prefixes, Validation Rules, and the Recommended Approach.

---

### Classes / 클래스

| Type | Pattern | Example |
|------|---------|---------|
| Global class | `ZCL_{MODULE}_{NAME}` | `ZCL_SD_ORDER_PROCESSOR` |
| Local class | `LCL_{NAME}` | `LCL_ITEM_HANDLER` |
| Persistent class | `ZCP_{MODULE}_{NAME}` | `ZCP_MM_MATERIAL` |
| Exception class | `ZCX_{MODULE}_{NAME}` | `ZCX_SD_ORDER_FAILED` |
| Test class (local) | `LTCL_{NAME}` | `LTCL_ORDER_PROCESSOR` |
| Test class (global) | `ZCL_{MODULE}_{NAME}_TEST` | `ZCL_SD_ORDER_TEST` |

### Interfaces / 인터페이스

| Type | Pattern | Example |
|------|---------|---------|
| Global interface | `ZIF_{MODULE}_{NAME}` | `ZIF_MM_MATERIAL_API` |
| Local interface | `LIF_{NAME}` | `LIF_CALCULABLE` |

### Programs / 프로그램

| Type | Pattern | Example |
|------|---------|---------|
| Executable (report) | `ZR_{MODULE}_{NAME}` or `Z_{MODULE}_{NAME}` | `ZR_SD_ORDER_LIST` |
| Include | `Z{PROGRAM}_TOP` (global data) | `ZR_SD_ORDER_LIST_TOP` |
| Include | `Z{PROGRAM}_F01` (forms) | `ZR_SD_ORDER_LIST_F01` |
| Include | `Z{PROGRAM}_SEL` (selection screen) | `ZR_SD_ORDER_LIST_SEL` |
| Include | `Z{PROGRAM}_CLS` (local classes) | `ZR_SD_ORDER_LIST_CLS` |
| Module pool | `SAPMZ{MODULE}_{NAME}` | `SAPMZSD_ORDER_DIALOG` |
| Subroutine pool | `Z_{MODULE}_{NAME}_SUB` | `Z_SD_ORDER_SUB` |

### Function Groups & Modules / 함수 그룹 및 모듈

**Authoritative pattern (company standard — confirmed 2026-04-19). No underscore between `Z` and the 2-letter module; the tag `FG` / `FM` separates module from purpose.**

| Type | Pattern | Example |
|------|---------|---------|
| Function Group | `Z{MODULE}FG_{PURPOSE}` | `ZMMFG_HISTORY`, `ZFIFG_CLEARING`, `ZSDFG_ORDER` |
| Function Module | `Z{MODULE}FM_{PURPOSE}` | `ZMMFM_GET_HISTORY`, `ZFIFM_POST_CLEAR`, `ZSDFM_ORDER_CREATE` |
| RFC Function Module | `Z{MODULE}FM_RFC_{PURPOSE}` | `ZSDFM_RFC_ORDER_CREATE` |

**Forbidden alternatives (do NOT emit):**
- `Z_{MODULE}_{NAME}` — the leading `Z_MM_...` form is obsolete.
- `ZFG_{MODULE}_...` / `ZFM_{MODULE}_...` — prefix-style tag before module is not the company standard.
- Mixing FM and FG with different module codes (FM and its parent FG share the same module).

When an FM belongs to an existing FG, the FM purpose string should remain short and distinct from the FG purpose — e.g., FG `ZMMFG_HISTORY` + FM `ZMMFM_GET_HISTORY` / `ZMMFM_POST_HISTORY`.

### Data Dictionary / 데이터 사전

| Type | Pattern | Example |
|------|---------|---------|
| Transparent Table | `ZT{MODULE}_{NAME}` or `Z{MODULE}T_{NAME}` | `ZTSD_ORDER_LOG`, `ZSDT_ORDER_LOG` |
| Structure | `ZS_{MODULE}_{NAME}` or `ZSS_{MODULE}_{NAME}` | `ZS_SD_ORDER_HEADER` |
| Table Type | `ZTT_{MODULE}_{NAME}` | `ZTT_SD_ORDER_ITEMS` |
| Data Element | `ZDE_{NAME}` or `Z{MODULE}_DE_{NAME}` | `ZDE_ORDER_NUMBER`, `ZSD_DE_ORDER_NO` |
| Domain | `ZDO_{NAME}` or `Z{MODULE}_DO_{NAME}` | `ZDO_ORDER_STATUS` |
| Search Help | `ZSH_{MODULE}_{NAME}` | `ZSH_SD_ORDER` |
| Lock Object | `EZ_{MODULE}_{NAME}` | `EZ_SD_ORDER` (system prefix `E` for locks) |
| View | `ZV_{MODULE}_{NAME}` | `ZV_SD_ORDER_HDR` |
| CDS View | `Z_I_{ENTITY}` (interface), `Z_C_{ENTITY}` (consumption) | `Z_I_SALESORDER`, `Z_C_SALESORDER_UI` |
| CDS Behavior | `Z_BP_{ENTITY}` | `Z_BP_SALESORDER` |
| Table Function | `ZTF_{NAME}` | `ZTF_SALES_AGG` |

### UI / Dynpro

| Type | Pattern | Example |
|------|---------|---------|
| Dynpro Screen | 4-digit number (0100-9999); `0100` for main | `0100`, `0200`, `9000` |
| GUI Status | Uppercase identifier | `STATUS_0100`, `MAIN_STATUS` |
| GUI Title | Uppercase identifier | `TITLE_0100` |
| Selection Screen | Part of program | `AT SELECTION-SCREEN` |

### OData / RAP (S/4HANA) / OData 및 RAP

| Type | Pattern | Example |
|------|---------|---------|
| Service Definition | `Z_SD_{ENTITY}` or `Z_API_{ENTITY}` | `Z_SD_SALESORDER` |
| Service Binding | `Z_SB_{ENTITY}_{PROTOCOL}` | `Z_SB_SALESORDER_UI`, `Z_SB_SALESORDER_V2` |
| Behavior Definition | `Z_BP_{ENTITY}` | `Z_BP_SALESORDER` |
| Behavior Implementation | `ZCL_BP_{ENTITY}` | `ZCL_BP_SALESORDER` |
| Projection View | `Z_P_{ENTITY}` | `Z_P_SALESORDER` |

### Enhancements / 향상

| Type | Pattern | Example |
|------|---------|---------|
| Enhancement Implementation | `Z_{MODULE}_{BADI_NAME}_IMPL` | `Z_SD_BADI_SALES_IMPL` |
| Enhancement Spot | `Z_ENH_{MODULE}_{NAME}` | `Z_ENH_SD_PRICING` |
| CMOD Project | `Z{MODULE}_{NAME}` | `ZSD_ORDER` |
| Include (CMOD user exit) | `ZX{SAP_EXIT_INCLUDE}` | `ZXVVAU01` (for EXIT_SAPMV45A_*) |
| VOFM Routine | 3-digit (600-999 for custom) | `901`, `905` (application form routines) |

### Configuration / 설정

| Type | Pattern | Example |
|------|---------|---------|
| Package (Local) | `$TMP` | For local/temporary objects |
| Package (Custom) | `Z{MODULE}_{NAME}` | `ZSD_ORDER_MGMT` |
| Transport Request | Generated by SAP | `ABCK900123` |
| Number Range Object | `Z_{MODULE}_{NAME}` | `Z_SD_ORDER_NR` |

### IDoc / ALE

| Type | Pattern | Example |
|------|---------|---------|
| IDoc Type (Basic) | `Z{MODULE}_{NAME}` | `ZSD_ORDER_OUT` |
| Segment | `Z1{MODULE}_{NAME}` (S-type segment prefix `Z1`) | `Z1SD_HEADER`, `Z1SD_ITEM` |
| Message Type | `Z{MODULE}_{NAME}` | `ZSD_ORDER_NOTIF` |
| Process Code | `Z{MODULE}{NAME}` (4 chars max suggested) | `ZSDO1` |
