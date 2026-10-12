# Plan — ZSC4SAP_GS07

**Paradigm**: Procedural · **Display**: Full CL_GUI_ALV_GRID (Docking Container) · **Package**: `$TMP` · **Transport**: none

## Objects

| Object | Type | Notes |
|---|---|---|
| `ZSC4SAP_GS07` | PROG/P | Main program (header, REPORT, INCLUDE lines, event blocks only) |
| `ZSC4SAP_GS07T` | PROG/I | TOP — types, constants, `ok_code`, grid references |
| `ZSC4SAP_GS07S` | PROG/I | Selection screen |
| `ZSC4SAP_GS07O` | PROG/I | PBO modules (one-line PERFORM) |
| `ZSC4SAP_GS07I` | PROG/I | PAI modules (one-line PERFORM) |
| `ZSC4SAP_GS07F` | PROG/I | FORMs incl. ALV FORMs (_0100) and convert_fcat_data_grid |
| `ZSC4SAP_GS07` 0100 | DYNP | Flow logic: PBO `status_0100`, `display_alv_0100`; PAI `user_command_0100`; OKCODE field NAME = `OK_CODE` |
| `ZSC4SAP_GS07` STATUS_0100 | CUAD | Functions BACK (F3), EXIT (Shift+F3), CANC (F12), REFRESH (F5 + toolbar); title TITLE_0100 |

## Include list

| Include | Role |
|---|---|
| `ZSC4SAP_GS07T` | TOP — types, constants, `ok_code`, grid references |
| `ZSC4SAP_GS07S` | Selection screen |
| `ZSC4SAP_GS07O` | PBO modules (one-line PERFORM) |
| `ZSC4SAP_GS07I` | PAI modules (one-line PERFORM) |
| `ZSC4SAP_GS07F` | FORMs incl. ALV FORMs (_0100) and convert_fcat_data_grid |

## Text elements (primary logon language + 'E')

| Type | Key | Primary | E |
|---|---|---|---|
| R | (program) | Flight list (ALV grid) | Flight list (ALV grid) |
| I | B01 | Selection | Selection |
| I | M01 | No flights found for the selection | No flights found for the selection |
| I | M02 | No airline matches the selection | No airline matches the selection |
| I | M03 | ALV grid could not be displayed | ALV grid could not be displayed |
| S | S_CARRID | Airline | Airline |
| S | S_FLDATE | Flight date | Flight date |

## Activation plan

Create includes → upload main → one `ActivateObjects` for main + every include → text pools → screen / GUI status (Create → Update → Get) → `GetInactiveObjects` = 0.

## Execution Sizing

- programs_count: 1
- includes_count: 5
- total_mcp_writes: 13
- text_elements_count: 7
- ddic_objects_count: 0
- split_recommendation: single
