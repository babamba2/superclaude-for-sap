# Spec — ZSC4SAP_GS08: Flights of one airline

## Approval

Approved by: golden-set harness · 2026-10-12 · keyword: approve

## 1. Purpose

List the flights of one airline (validated and named by the new function module ZSC4SAP_GS08_FM) for a date range in a SALV popup.

## 2. Paradigm and structure

- Paradigm: **Procedural** (see interview.md). Display mode: SALV popup (CL_SALV_TABLE).
- Includes: `ZSC4SAP_GS08T`, `ZSC4SAP_GS08S`, `ZSC4SAP_GS08F`. Main program holds only the header block, `REPORT`, the `INCLUDE` lines and the event blocks.
- Procedural without screen: includes `t` / `s` / `f` only (include-structure.md conditional rule). Event blocks (`AT SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION`) live in the Main body and delegate to FORMs. No `e` include (forbidden for Procedural).

## 3. Selection screen

- `P_CARRID` (airline, OBLIGATORY) and `S_FLDATE` (flight date) in block B01 with frame title `TEXT-b01`. `AT SELECTION-SCREEN` calls `ZSC4SAP_GS08_FM` with `iv_carrid`; on success it shows `TEXT-m03` + airline name, on `not_found` the error `TEXT-m02`, otherwise `TEXT-m04`.

## 4. Processing

- `ZSC4SAP_GS08_FM` signature (inline, function-module-rule.md): `IMPORTING VALUE(iv_carrid) TYPE scarr-carrid`, `EXPORTING VALUE(ev_carrname) TYPE scarr-carrname`, `EXCEPTIONS not_found`. Reads SCARR-CARRNAME by key; raises `not_found` when missing.
- `get_data` joins SFLIGHT and SCARR for `p_carrid` and the date range into `gt_flights`.
- No result → `TEXT-m01` as success message displayed like a warning.

## 5. Output

- `CL_SALV_TABLE` popup (`set_screen_popup`, coordinates from constants); no screen, no GUI status. SALV errors are reported from the caught `CX_SALV_MSG`.

## 6. Text elements and constants

- Every user-visible text is a text symbol (I), a selection text (S) for every PARAMETERS / SELECT-OPTIONS, and the program title (R); written in the primary logon language and in 'E'. No classical list, so no H rows.
- Function codes, screen number, status / title names, message types and numeric thresholds are `CONSTANTS` in the TOP include.

## 7. Naming, release and platform

- § Naming: object names (`ZSC4SAP_GS*`, `ZSC4SAP_GSFG`, `ZSC4SAP_GS08_FM`) are fixed by the Phase 6 golden-set harness — `naming-conventions.md` § Exceptions (harness objects in `$TMP`). Include suffixes follow `include-structure.md` with no underscore (`{PROG}T`, `{PROG}S`, …).
- Package `$TMP` (local object), no transport request.
- Target: the same source must activate on ECC (ABAP 7.40) and S/4HANA. Code is limited to 7.40 syntax.
- SP unknown — classic SQL: `abapSp` is not pinned for the ECC system, so Open SQL is classic (no `@`), per `abap-release-reference.md` § 1a.
- No AUTHORITY-CHECK: SFLIGHT / SCARR are SAP demo data, not restricted data (`clean-code.md` § Security and Data Handling).
