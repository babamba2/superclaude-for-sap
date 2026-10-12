# Plan — ZSC4SAP_GS06

**Paradigm**: Procedural · **Display**: SALV popup (CL_SALV_TABLE) · **Package**: `$TMP` · **Transport**: none

## Objects

| Object | Type | Notes |
|---|---|---|
| `ZSC4SAP_GS06` | PROG/P | Main program (header, REPORT, INCLUDE lines, event blocks only) |
| `ZSC4SAP_GS06T` | PROG/I | TOP — types, constants, global result table |
| `ZSC4SAP_GS06S` | PROG/I | Selection screen |
| `ZSC4SAP_GS06F` | PROG/I | FORMs: check_carriers, get_data, display_data |

## Include list

| Include | Role |
|---|---|
| `ZSC4SAP_GS06T` | TOP — types, constants, global result table |
| `ZSC4SAP_GS06S` | Selection screen |
| `ZSC4SAP_GS06F` | FORMs: check_carriers, get_data, display_data |

Main must contain one `INCLUDE` line per include above (procedural-sample/main-program.abap).

## Text elements (primary logon language + 'E')

| Type | Key | Primary | E |
|---|---|---|---|
| R | (program) | Flight list (SALV popup) | Flight list (SALV popup) |
| I | B01 | Selection | Selection |
| I | M01 | No flights found for the selection | No flights found for the selection |
| I | M02 | No airline matches the selection | No airline matches the selection |
| S | S_CARRID | Airline | Airline |
| S | S_FLDATE | Flight date | Flight date |

## Activation plan

Create includes → upload main → one `ActivateObjects` for main + every include → text pools → screen / GUI status (Create → Update → Get) → `GetInactiveObjects` = 0.

## Execution Sizing

- programs_count: 1
- includes_count: 3
- total_mcp_writes: 7
- text_elements_count: 6
- ddic_objects_count: 0
- split_recommendation: single
