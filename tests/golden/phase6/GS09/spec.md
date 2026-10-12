# Spec — ZSC4SAP_GS09: Flights and airlines (tabstrip)

## Approval

Approved by: golden-set harness · 2026-10-12 · keyword: approve

## 1. Purpose

Show the SFLIGHT flights (with free seats) and the SCARR airlines of an airline / date selection on one screen with two tabs: "Flights" and "Airlines".

## 2. Paradigm and structure

- Paradigm: **OOP** (see interview.md). Display: tabstrip screen 0200 with subscreens 0210 / 0220, each hosting a `CL_GUI_ALV_GRID` in a custom control. Profile `alvFramework` = **`none`** — no framework base class, no `MESSAGE-ID` (text symbols).
- Includes (house OOP skeleton, `include-structure.md`): `ZSC4SAP_GS09T`, `ZSC4SAP_GS09S`, `ZSC4SAP_GS09C`, `ZSC4SAP_GS09CT`, `ZSC4SAP_GS09O`, `ZSC4SAP_GS09I`. No `e` (no grid events), no `f`, no `a`.
- `ZSC4SAP_GS09C`: `DEFERRED` lines, `DATA go_data` / `go_alv`, then `LCL_DATA` (owns `MO_ALV`, READ-ONLY) and `LCL_ALV`.
- Bootstrap in INITIALIZATION: `go_data = NEW #( ).` / `go_alv ?= go_data->mo_alv.` / `go_data->initialization( ).`

## 3. Selection screen

- `S_CARRID` and `S_FLDATE` in block B01 (`TEXT-b01`). `LCL_DATA->INITIALIZATION` defaults `S_FLDATE` to the current calendar year.

## 4. Processing

- `LCL_DATA->GET_DATA` selects SFLIGHT (explicit field list) and fills SEATSFREE via `CALCULATE_FREE_SEATS` (= SEATSMAX − SEATSOCC, 0 when overbooked); selects SCARR (CARRID, CARRNAME, CURRCODE, URL) for the airline range.
- No flights → `TEXT-m01` as success message displayed like a warning; no screen call.

## 5. Output — tabstrip screen 0200 (common/screen-tabstrip.md)

- TOP: `CONTROLS ts_main TYPE TABSTRIP.`, tab fcodes `gc_tab_0200-tab1` / `-tab2` (`TAB1` / `TAB2`), state `gs_ts_main` (pressed tab, default TAB1; subscreen number).
- Screen 0200 (normal): `STRIP_CTRL` `TS_MAIN`, subscreen area `TS_SCA` inside it, tab PUSH rows `TS_MAIN_TAB1` "Flights" (`PUSH_FCODE` TAB1) and `TS_MAIN_TAB2` "Airlines" (TAB2), both `REF_FIELD` = `TS_SCA`, application paging (`PUSH_FTYPE` blank).
- Flow logic 0200: PBO `status_0200`, `tab_set_0200`, `CALL SUBSCREEN ts_sca INCLUDING sy-repid gs_ts_main-subscreen.`; PAI `CALL SUBSCREEN ts_sca.`, `user_command_0200`.
- Subscreens 0210 (flights) / 0220 (airlines): `TYPE I`, custom control `CC_0210` / `CC_0220`, PBO `alv_0210` / `alv_0220` → `LCL_ALV->SET_ALV_0210` / `_0220`; PAI empty.
- Field catalogs per alv-rules.md: `LCL_ALV->GET_FIELDCAT` (SALV factory + `get_lvc_fieldcatalog` on a copy of the output table), `REFINE_FCAT` by screen and `CASE fieldname` (SEATSFREE coltext `TEXT-f01`, `do_sum`).

## 6. GUI status and OK_CODE

- OK_CODE (house style): `DATA ok_code TYPE sy-ucomm` in TOP, OKCODE field NAME = `OK_CODE` on 0200; `LCL_ALV->USER_COMMAND_0200` copies and clears `ok_code`, then TAB1 / TAB2 switch the pressed tab, BACK / EXIT / CANC leave, REFRESH refreshes both grids.
- GUI status `STATUS_0200`: BACK (F3), EXIT (Shift+F3), CANC (F12), REFRESH (F5, toolbar). Title `TITLE_0200`.

## 7. Text elements, constants and tests

- Text symbols (I), selection texts (S) for both SELECT-OPTIONS, program title (R), in the primary logon language and 'E'. Tab captions are dynpro element texts.
- Function / tab codes, screen numbers, container names, status / title names, message types and range sign / option are `CONSTANTS` in TOP.
- `ZSC4SAP_GS09CT`: `LCL_TEST` (`RISK LEVEL HARMLESS DURATION SHORT`) tests `CALCULATE_FREE_SEATS` (normal, overbooked). `RunUnitTest` (container `PROG`) after activation — expected all green.

## 8. Naming, release and platform

- § Naming: `ZSC4SAP_GS*` names are fixed by the golden-set harness — `naming-conventions.md` § Exceptions. Include suffixes without underscore.
- Package `$TMP`, no transport request. ECC (ABAP 7.40) and S/4HANA, 7.40 syntax.
- SP unknown — classic SQL (`abap-release-reference.md` § 1a).
- No AUTHORITY-CHECK: SFLIGHT / SCARR are SAP demo data, not restricted data (`clean-code.md` § Security and Data Handling).
