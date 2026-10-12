# Plan — ZSC4SAP_GS05

**Paradigm**: Procedural · **Display**: SALV popup (CL_SALV_TABLE) · **Package**: `$TMP` · **Transport**: none

## Objects

| Object | Type | Notes |
|---|---|---|
| `ZSC4SAP_GS05` | PROG/P | Main program (header, REPORT, INCLUDE lines, event blocks only) |
| `ZSC4SAP_GS05T` | PROG/I | TOP — types, constants, global result table |
| `ZSC4SAP_GS05S` | PROG/I | Selection screen |
| `ZSC4SAP_GS05F` | PROG/I | FORMs: check_carriers, get_data, display_data |

## Include list

| Include | Role |
|---|---|
| `ZSC4SAP_GS05T` | TOP — types, constants, global result table |
| `ZSC4SAP_GS05S` | Selection screen |
| `ZSC4SAP_GS05F` | FORMs: check_carriers, get_data, display_data |

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
