# Spec — ZSC4SAP_GS03: Flight occupancy list

## Approval

Approved by: golden-set harness · 2026-10-12 · keyword: approve

## 1. Purpose

List SFLIGHT flights with seat occupancy in percent for an airline / date selection, as a full-screen ALV grid. Double-clicking a row shows the flight's occupancy in the status bar.

## 2. Paradigm and structure

- Paradigm: **OOP** (see interview.md). Display mode: Full CL_GUI_ALV_GRID (Docking Container). Profile `alvFramework` = **`none`** — plain `CL_GUI_DOCKING_CONTAINER` + `CL_GUI_ALV_GRID`, no framework base class, no `MESSAGE-ID` (no message class configured → text symbols).
- Includes (house OOP skeleton, `include-structure.md`): `ZSC4SAP_GS03T`, `ZSC4SAP_GS03S`, `ZSC4SAP_GS03C`, `ZSC4SAP_GS03CT`, `ZSC4SAP_GS03E`, `ZSC4SAP_GS03O`, `ZSC4SAP_GS03I`. Main program holds only the header block, `REPORT`, the `INCLUDE` lines and the event blocks. No `f` (no FORMs) and no `a` (`LCL_ALV` lives in `c`).
- `ZSC4SAP_GS03C`: `CLASS lcl_data DEFINITION DEFERRED` / `CLASS lcl_alv DEFINITION DEFERRED`, `DATA go_data` / `go_alv`, then `LCL_DATA` (owns `MO_ALV`, READ-ONLY) and `LCL_ALV`.
- Bootstrap in INITIALIZATION: `go_data = NEW #( ).` / `go_alv ?= go_data->mo_alv.` / `go_data->initialization( ).`
- `ZSC4SAP_GS03E`: `LCL_EVENT_ALV` handles `DOUBLE_CLICK` of the grid and delegates to `go_alv->show_flight_0100( )`. Because E follows C, `LCL_ALV` creates the receiver by name (`CREATE OBJECT mo_event TYPE (gc_event_class)`), per `oop-pattern.md` § Event Wiring.

## 3. Selection screen

- `S_CARRID` (airline, SELECT-OPTIONS FOR sflight-carrid via TOP helper `gv_sel_carrid`) and `S_FLDATE` (flight date) in block B01 with frame title `TEXT-b01`.
- `LCL_DATA->INITIALIZATION` defaults `S_FLDATE` to the current calendar year (I / BT, 01.01.–31.12.).

## 4. Processing

- `LCL_DATA->GET_DATA` selects CARRID, CONNID, FLDATE, PRICE, CURRENCY, PLANETYPE, SEATSMAX, SEATSOCC from SFLIGHT for the ranges (explicit field list, typed result table with explicit key) and fills OCCUPANCY via `CALCULATE_OCCUPANCY` (= SEATSOCC × 100 / SEATSMAX; 0 when SEATSMAX is 0).
- No result → success message `TEXT-m01` displayed like a warning; no screen call.

## 5. Output

- Full-screen `CL_GUI_ALV_GRID` on screen 0100. Field catalog per alv-rules.md: `LCL_ALV->GET_FIELDCAT` builds it from the SALV factory and converts it with `cl_salv_controller_metadata=>get_lvc_fieldcatalog`; `REFINE_FCAT` changes columns only in a `CASE fieldname` block (OCCUPANCY coltext = `TEXT-f01`; SEATSMAX / SEATSOCC `do_sum`). Layout: zebra, optimized widths.
- Double-click → status message `TEXT-m03` followed by airline, connection, date and occupancy.

## 6. Screen 0100 and GUI status

- Screen 0100 hosts the grid in a `CL_GUI_DOCKING_CONTAINER` (no custom control). PBO: `status_0100`, `alv_0100`; PAI: `user_command_0100` — each module calls the `LCL_ALV` method of the same name (`set_alv_0100` for `alv_0100`).
- OK_CODE pattern (ok-code-pattern.md, house style): `DATA ok_code TYPE sy-ucomm` in TOP, screen OKCODE field NAME = `OK_CODE`; `LCL_ALV->USER_COMMAND_0100` copies `ok_code` to a local, clears it and branches on the local against `gc_fcode_*` constants.
- GUI status `STATUS_0100`: BACK (F3), EXIT (Shift+F3), CANC (F12) leave the screen; REFRESH (F5, toolbar) refreshes the grid. Title `TITLE_0100`.

## 7. Text elements, constants and tests

- Every user-visible text is a text symbol (I), a selection text (S) for every SELECT-OPTIONS, and the program title (R); written in the primary logon language and in 'E'. No classical list, so no H rows.
- Function codes, screen number, status / title names, message types, range sign / option, the event class name and numeric thresholds are `CONSTANTS` in the TOP include.
- `ZSC4SAP_GS03CT`: `LCL_TEST` (`FOR TESTING RISK LEVEL HARMLESS DURATION SHORT`) tests `CALCULATE_OCCUPANCY` (normal ratio, zero capacity). Run after activation with `RunUnitTest` (container `PROG`) — expected all green.

## 8. Naming, release and platform

- § Naming: object names (`ZSC4SAP_GS*`) are fixed by the Phase 6 golden-set harness — `naming-conventions.md` § Exceptions (harness objects in `$TMP`). Include suffixes follow `include-structure.md` with no underscore (`{PROG}T` … `{PROG}CT`).
- Package `$TMP` (local object), no transport request.
- Target: the same source must activate on ECC (ABAP 7.40) and S/4HANA. Code is limited to 7.40 syntax.
- SP unknown — classic SQL: `abapSp` is not pinned for the ECC system, so Open SQL is classic (no `@`), per `abap-release-reference.md` § 1a.
- Local classes are not `FINAL` (allowed, not required — `clean-code-oop.md`).
- No AUTHORITY-CHECK: SFLIGHT / SCARR are SAP demo data, not restricted data (`clean-code.md` § Security and Data Handling).
