# Spec — ZSC4SAP_GS07: Flight list (ALV grid)

## Approval

Approved by: golden-set harness · 2026-10-12 · keyword: approve

## 1. Purpose

List SFLIGHT flights with the airline name (SCARR) for an airline / date selection in a full-screen ALV grid on screen 0100.

## 2. Paradigm and structure

- Paradigm: **Procedural** (see interview.md). Display mode: Full CL_GUI_ALV_GRID (Docking Container).
- Includes: `ZSC4SAP_GS07T`, `ZSC4SAP_GS07S`, `ZSC4SAP_GS07O`, `ZSC4SAP_GS07I`, `ZSC4SAP_GS07F`. Main program holds only the header block, `REPORT`, the `INCLUDE` lines and the event blocks.
- Procedural with screen + ALV: includes `t` / `s` / `o` / `i` / `f`. No `c` / `a` (no local class in the spec → no `c` / `a`, per include-structure.md); ALV logic lives in `_0100` FORMs plus the utility `convert_fcat_data_grid` in `f`. No `e` include. Event blocks in Main. PBO/PAI modules are one-line PERFORMs.

## 3. Selection screen

- `S_CARRID` (airline) and `S_FLDATE` (flight date) in block B01 with frame title `TEXT-b01`. `AT SELECTION-SCREEN` validates the airline range against SCARR (`TEXT-m02` as error message).

## 4. Processing

- `get_data` joins SFLIGHT and SCARR (explicit field list) into the typed global result table `gt_flights` (explicit key). Ranges are passed with `USING`.
- No result → `TEXT-m01` as success message displayed like a warning.

## 5. Output

- Full-screen `CL_GUI_ALV_GRID` in a `CL_GUI_DOCKING_CONTAINER` on screen 0100. Field catalog per alv-rules.md: `convert_fcat_data_grid` (SALV factory + `get_lvc_fieldcatalog`), per-column changes in `modify_fcat_0100` via `CASE fieldname` (SEATSMAX / SEATSOCC `do_sum`). Layout: zebra, optimized widths.

## 6. Screen 0100 and GUI status

- Screen 0100 hosts the grid in a `CL_GUI_DOCKING_CONTAINER` (no custom control). PBO: `status_0100`, `display_alv_0100`; PAI: `user_command_0100`.
- OK_CODE pattern (ok-code-pattern.md, house style): `DATA ok_code TYPE sy-ucomm` in TOP, screen OKCODE field NAME = `OK_CODE`, the user-command FORM copies `ok_code` to a local, clears it and branches on the local against `gc_fcode_*` constants.
- GUI status `STATUS_0100`: BACK (F3), EXIT (Shift+F3), CANC (F12) leave the screen; REFRESH (F5, toolbar) refreshes the grid. Title `TITLE_0100`.

## 7. Text elements and constants

- Every user-visible text is a text symbol (I), a selection text (S) for every PARAMETERS / SELECT-OPTIONS, and the program title (R); written in the primary logon language and in 'E'. No classical list, so no H rows.
- Function codes, screen number, status / title names, message types and numeric thresholds are `CONSTANTS` in the TOP include.

## 8. Naming, release and platform

- § Naming: object names (`ZSC4SAP_GS*`, `ZSC4SAP_GSFG`, `ZSC4SAP_GS08_FM`) are fixed by the Phase 6 golden-set harness — `naming-conventions.md` § Exceptions (harness objects in `$TMP`). Include suffixes follow `include-structure.md` with no underscore (`{PROG}T`, `{PROG}S`, …).
- Package `$TMP` (local object), no transport request.
- Target: the same source must activate on ECC (ABAP 7.40) and S/4HANA. Code is limited to 7.40 syntax.
- SP unknown — classic SQL: `abapSp` is not pinned for the ECC system, so Open SQL is classic (no `@`), per `abap-release-reference.md` § 1a.
- No AUTHORITY-CHECK: SFLIGHT / SCARR are SAP demo data, not restricted data (`clean-code.md` § Security and Data Handling).
