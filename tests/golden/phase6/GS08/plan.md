# Plan — ZSC4SAP_GS08

**Paradigm**: Procedural · **Display**: SALV popup (CL_SALV_TABLE) · **Package**: `$TMP` · **Transport**: none

## Objects

| Object | Type | Notes |
|---|---|---|
| `ZSC4SAP_GS08` | PROG/P | Main program (header, REPORT, INCLUDE lines, event blocks only) |
| `ZSC4SAP_GS08T` | PROG/I | TOP — types, constants, global result table |
| `ZSC4SAP_GS08S` | PROG/I | Selection screen (P_CARRID, S_FLDATE) |
| `ZSC4SAP_GS08F` | PROG/I | FORMs: check_carrier (calls ZSC4SAP_GS08_FM), get_data, display_data |
| `ZSC4SAP_GSFG` | FUGR | Function group (new) |
| `ZSC4SAP_GS08_FM` | FUNC | `IMPORTING VALUE(iv_carrid) TYPE scarr-carrid`, `EXPORTING VALUE(ev_carrname) TYPE scarr-carrname`, `EXCEPTIONS not_found` — inline signature per function-module-rule.md |

## Include list

| Include | Role |
|---|---|
| `ZSC4SAP_GS08T` | TOP — types, constants, global result table |
| `ZSC4SAP_GS08S` | Selection screen (P_CARRID, S_FLDATE) |
| `ZSC4SAP_GS08F` | FORMs: check_carrier (calls ZSC4SAP_GS08_FM), get_data, display_data |

## Text elements (primary logon language + 'E')

| Type | Key | Primary | E |
|---|---|---|---|
| R | (program) | Flights of one airline | Flights of one airline |
| I | B01 | Selection | Selection |
| I | M01 | No flights found for the selection | No flights found for the selection |
| I | M02 | Airline does not exist | Airline does not exist |
| I | M03 | Airline: | Airline: |
| I | M04 | Airline check failed | Airline check failed |
| S | P_CARRID | Airline | Airline |
| S | S_FLDATE | Flight date | Flight date |

## Activation plan

Create includes → upload main → one `ActivateObjects` for main + every include → text pools → screen / GUI status (Create → Update → Get) → `GetInactiveObjects` = 0.

## Execution Sizing

- programs_count: 1
- includes_count: 3
- total_mcp_writes: 10
- text_elements_count: 8
- ddic_objects_count: 0
- split_recommendation: single
