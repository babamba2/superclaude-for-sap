# Naming Conventions

Shared naming rules for sc4sap ABAP programs and related objects.

## Main Program

- Pattern: `Z{MODULE}{TYPE}{NN}`
- Example: `ZFIR00010` — FI Report #00010 / `ZSDR23070` — SD Report #23070

## TYPE letter table (company standard — confirmed 2026-04-17)

| TYPE | Meaning | ABAP object kind | Example |
|------|---------|------------------|---------|
| `R`  | Report / Main Program | PROG (executable)      | `ZFIR00010` |
| `S`  | Structure             | STRU (TABL/STRU)       | `ZFIS00010` |
| `T`  | Transparent Table     | TABL                   | `ZFIT00010` |
| `Y`  | Table Type            | TTYP                   | `ZFIY00010` |
| `E`  | Data Element          | DTEL                   | `ZFIE00010` |
| `D`  | Domain                | DOMA                   | `ZFID00010` |
| `V`  | DDIC View (classic)   | VIEW (maintenance/projection/help) | `ZFIV00010` |

Sequence `{NN}` is 5-digit zero-padded (`00010`, `00020`, …). The MODULE prefix is the 2-letter functional module (`FI`, `SD`, `MM`, `PP`, `PM`, `QM`, `WM`, `TM`, `TR`, `CO`, `HCM`, `BW`, `PS`, `AR`).

### Sequence-number safety (MANDATORY before picking `{NN}`)

- **Must not collide with an existing SAP object.** Before proposing or creating any `Z{MODULE}{TYPE}{NN}`, verify via MCP (`SearchObject` / `GetObjectInfo` / `GetObjectsByType`) that the candidate name does NOT already exist in the target system. Never assume an unused number.
- **Convention: last-used seq + 10.** Discover the highest existing `{NN}` for the same `{MODULE}{TYPE}` pair and propose `last + 10` (e.g., if `ZFIR00020` exists, next new report is `ZFIR00030`). The `+10` step reserves gaps for related/inserted objects.
- **Sibling objects in one unit-of-work share the same `{NN}`.** When a feature spawns several DDIC artifacts (TABL + STRU + TTYP + the report that uses them), reuse the same number across them (`ZFIR00030` + `ZFIT00030` + `ZFIS00030` + `ZFIY00030`) instead of advancing per sub-object.
- **If the proposed name is taken**, advance by another `+10` and re-verify until a free slot is found. Record the chosen seq in the program's `interview.md` / `spec.md`.

## CDS Views (SAP VDM-aligned, Z-namespace)

CDS objects do NOT follow the numbered `Z{MODULE}{TYPE}{NN}` pattern. Use SAP Virtual Data Model semantic prefixes, in Z-namespace, per-module:

| Role | Pattern | Example | Notes |
|------|---------|---------|-------|
| Basic / Interface View | `ZI_{MODULE}_{Name}`  | `ZI_FI_ClearingItem`  | Reusable VDM layer — 1:1 or light joins, no business logic gating |
| Root View (RAP)        | `ZR_{MODULE}_{Name}`  | `ZR_FI_Clearing`      | Root entity of a Behavior Definition / Business Object |
| Consumption View       | `ZC_{MODULE}_{Name}`  | `ZC_FI_Clearing`      | UI/OData-facing; annotations for Fiori Elements / RAP service |
| Metadata Extension     | `{TargetView}_EXT`    | `ZC_FI_Clearing_EXT`  | Separates UI annotations from the view definition |
| Projection View (RAP)  | `ZP_{MODULE}_{Name}`  | `ZP_FI_Clearing`      | Intermediate projection layer when separating read/write |

Sub-types to verify at first use (ask user before defaulting):
- Analytical / Cube / Dimension / Query views (CDS for Analytics) — SAP convention uses suffixes like `_CDS_Q`, `_CDS_C`, `_CDS_D`; company policy TBD.
- Custom Entity (unmanaged CDS with class implementation) — confirm if `ZI_` or a dedicated prefix applies.

## Includes

- Suffixes appended to the main program name: `t` / `s` / `c` / `a` / `o` / `i` / `e` / `f` / `_tst`
- Role mapping: see `include-structure.md`

## Function Groups & Function Modules (company standard — confirmed 2026-04-19)

**No underscore between `Z` and the 2-letter module.** The fixed tag `FG` / `FM` separates module code from purpose.

| Object | Pattern | Example |
|---|---|---|
| Function Group | `Z{MODULE}FG_{PURPOSE}` | `ZMMFG_HISTORY`, `ZFIFG_CLEARING`, `ZSDFG_ORDER` |
| Function Module | `Z{MODULE}FM_{PURPOSE}` | `ZMMFM_GET_HISTORY`, `ZFIFM_POST_CLEAR`, `ZSDFM_ORDER_CREATE` |
| RFC Function Module | `Z{MODULE}FM_RFC_{PURPOSE}` | `ZSDFM_RFC_ORDER_CREATE` |

Forbidden: `Z_{MODULE}_{NAME}` (e.g., `Z_MM_MATERIAL_READ`) and `ZFG_{MODULE}_...` prefix-style tag are obsolete — do not emit.

An FM and its parent FG share the same module code. Keep each side's `{PURPOSE}` short and distinct — e.g., FG `ZMMFG_HISTORY` hosts FMs `ZMMFM_GET_HISTORY`, `ZMMFM_POST_HISTORY`.

## Global Classes & Interfaces

| Object | Pattern | Example |
|---|---|---|
| Global Class | `ZCL_{MODULE}_{PURPOSE}` | `ZCL_MM_HISTORY`, `ZCL_FI_CLEARING` |
| Global Interface | `ZIF_{MODULE}_{PURPOSE}` | `ZIF_MM_HISTORY`, `ZIF_FI_CLEARING` |
| Global Exception | `ZCX_{MODULE}_{PURPOSE}` | `ZCX_MM_HISTORY_FAILED` |
| Global Test Class | `ZCL_{MODULE}_{PURPOSE}_TEST` | `ZCL_MM_HISTORY_TEST` |

Per-type pattern details for other object types (tables, structures, data elements, domains, programs, DDIC views, search helps, RAP/OData artifacts, IDoc, enhancements, packages) live in [`../configs/common/naming-conventions-objects.md`](../configs/common/naming-conventions-objects.md).

## Local Classes

- `LCL_DATA` — data extraction
- `LCL_ALV` — screen / ALV / display
- `LCL_EVENT` — ALV event handler
- `LCL_TEST_*` — FOR TESTING classes in `{PROG}_tst`

## Global References

Declared in TOP include (`{PROG}t`):
- `GO_DATA`, `GO_ALV`, `GO_EVENT`

## Screens

- 4-digit numeric: `0100`, `0200`, ...

## GUI Status

- `STATUS_{SCREEN}` or purpose-based name (e.g. `MAIN_0100`)

## Procedural ALV FORMs

- Must end with `_{screen_no}` — see `procedural-form-naming.md`
