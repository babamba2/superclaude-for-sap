# Plan — ZSC4SAP_GS09

**Paradigm**: OOP · **Display**: tabstrip 0200 + subscreens 0210 / 0220 (CL_GUI_ALV_GRID in custom controls) · **alvFramework**: `none` · **Package**: `$TMP` · **Transport**: none

## Objects

| Object | Type | Notes |
|---|---|---|
| `ZSC4SAP_GS09` | PROG/P | Main program (header block, REPORT, INCLUDE lines, event blocks only) |
| `ZSC4SAP_GS09T` | PROG/I | TOP — types, constants, `CONTROLS ts_main TYPE TABSTRIP`, `gs_ts_main`, `ok_code` |
| `ZSC4SAP_GS09S` | PROG/I | Selection screen |
| `ZSC4SAP_GS09C` | PROG/I | `LCL_DATA` + `LCL_ALV` |
| `ZSC4SAP_GS09CT` | PROG/I | `LCL_TEST` |
| `ZSC4SAP_GS09O` | PROG/I | PBO modules `status_0200`, `tab_set_0200`, `alv_0210`, `alv_0220` |
| `ZSC4SAP_GS09I` | PROG/I | PAI module `user_command_0200` |
| `ZSC4SAP_GS09` 0210 | DYNP | Subscreen (TYPE I): custom control `CC_0210`; PBO `alv_0210` |
| `ZSC4SAP_GS09` 0220 | DYNP | Subscreen (TYPE I): custom control `CC_0220`; PBO `alv_0220` |
| `ZSC4SAP_GS09` 0200 | DYNP | Tabstrip `TS_MAIN`, area `TS_SCA`, tabs TAB1 / TAB2 (`REF_FIELD` TS_SCA); PBO `status_0200`, `tab_set_0200`, `CALL SUBSCREEN ts_sca INCLUDING …`; PAI `CALL SUBSCREEN ts_sca`, `user_command_0200`; OKCODE NAME = `OK_CODE` |
| `ZSC4SAP_GS09` STATUS_0200 | CUAD | BACK, EXIT, CANC, REFRESH; title TITLE_0200 |

## Text elements (primary logon language + 'E')

| Type | Key | Text |
|---|---|---|
| R | (program) | Flights and airlines (tabstrip) |
| I | B01 | Selection |
| I | F01 | Free seats |
| I | M01 | No flights found for the selection |
| I | M02 | ALV grid could not be displayed |
| S | S_CARRID | Airline |
| S | S_FLDATE | Flight date |

## Activation plan

Includes → main → `ActivateObjects` (modules must be active before screens) → text pools → subscreens 0210, 0220 → tabstrip 0200 → GUI status → `GetInactiveObjects` = 0 → `RunUnitTest` (container `PROG`, `LCL_TEST`) = all green.

## Execution Sizing

- programs_count: 1
- includes_count: 6
- total_mcp_writes: 18
- text_elements_count: 7
- ddic_objects_count: 0
- split_recommendation: single
