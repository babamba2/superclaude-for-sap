# Spec — ZSC4SAP_GS06: Flight list (SALV popup)

## Approval

Approved by: golden-set harness · 2026-10-12 · keyword: approve

## 1. Purpose

List SFLIGHT flights with the airline name (SCARR) for an airline / date selection in a SALV popup.

## 2. Paradigm and structure

- Paradigm: **Procedural** (see interview.md). Display mode: SALV popup (CL_SALV_TABLE).
- Includes: `ZSC4SAP_GS06T`, `ZSC4SAP_GS06S`, `ZSC4SAP_GS06F`. Main program holds only the header block, `REPORT`, the `INCLUDE` lines and the event blocks.
- Procedural without screen: includes `t` / `s` / `f` only (include-structure.md conditional rule). Event blocks (`AT SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION`) live in the Main body and delegate to FORMs. No `e` include (forbidden for Procedural).

## 3. Selection screen

- `S_CARRID` (airline) and `S_FLDATE` (flight date) in block B01 with frame title `TEXT-b01`. `AT SELECTION-SCREEN` validates the airline range against SCARR (`TEXT-m02` as error message).

## 4. Processing

- `get_data` joins SFLIGHT and SCARR (explicit field list) into the typed global result table `gt_flights` (explicit key). Ranges are passed with `USING`.
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
