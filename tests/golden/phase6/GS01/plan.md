# Plan — ZSC4SAP_GS01

**Paradigm**: OOP · **Display**: Full CL_GUI_ALV_GRID (Docking Container) · **alvFramework**: `none` · **Package**: `$TMP` · **Transport**: none

## Objects

| Object | Type | Notes |
|---|---|---|
| `ZSC4SAP_GS01` | PROG/P | Main program (header block, REPORT, INCLUDE lines, event blocks only) |
| `ZSC4SAP_GS01T` | PROG/I | TOP — types, constants, `ok_code`, selection helpers |
| `ZSC4SAP_GS01S` | PROG/I | Selection screen |
| `ZSC4SAP_GS01C` | PROG/I | DEFERRED + GO_DATA / GO_ALV, `LCL_DATA` (selection + occupancy, owns MO_ALV), `LCL_ALV` (screen 0100, docking + grid) |
| `ZSC4SAP_GS01CT` | PROG/I | `LCL_TEST` — unit tests for `LCL_DATA->CALCULATE_OCCUPANCY` |
| `ZSC4SAP_GS01E` | PROG/I | `LCL_EVENT_ALV` — grid double-click |
| `ZSC4SAP_GS01O` | PROG/I | PBO modules |
| `ZSC4SAP_GS01I` | PROG/I | PAI modules |
| `ZSC4SAP_GS01` 0100 | DYNP | Flow logic: PBO `status_0100`, `alv_0100`; PAI `user_command_0100`; OKCODE field NAME = `OK_CODE` |
| `ZSC4SAP_GS01` STATUS_0100 | CUAD | Functions BACK (F3), EXIT (Shift+F3), CANC (F12), REFRESH (F5 + toolbar); title TITLE_0100 |

## Include list

| Include | Role |
|---|---|
| `ZSC4SAP_GS01T` | TOP — types, constants, `ok_code`, selection helpers |
| `ZSC4SAP_GS01S` | Selection screen |
| `ZSC4SAP_GS01C` | `LCL_DATA` + `LCL_ALV` |
| `ZSC4SAP_GS01CT` | `LCL_TEST` |
| `ZSC4SAP_GS01E` | `LCL_EVENT_ALV` |
| `ZSC4SAP_GS01O` | PBO modules |
| `ZSC4SAP_GS01I` | PAI modules |

## Text elements (primary logon language + 'E')

| Type | Key | Primary | E |
|---|---|---|---|
| R | (program) | Flight occupancy list | Flight occupancy list |
| I | B01 | Selection | Selection |
| I | F01 | Occupancy % | Occupancy % |
| I | M01 | No flights found for the selection | No flights found for the selection |
| I | M02 | ALV grid could not be displayed | ALV grid could not be displayed |
| I | M03 | Occupancy of flight | Occupancy of flight |
| S | S_CARRID | Airline | Airline |
| S | S_FLDATE | Flight date | Flight date |

## Activation plan

Create includes → upload main → one `ActivateObjects` for main + every include → text pools → screen / GUI status (Create → Update → Get) → `GetInactiveObjects` = 0 → `RunUnitTest` (container `PROG`, `LCL_TEST`) = all green.

## Execution Sizing

- programs_count: 1
- includes_count: 7
- total_mcp_writes: 16
- text_elements_count: 8
- ddic_objects_count: 0
- split_recommendation: single
