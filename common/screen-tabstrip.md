# Tabstrip Screens

How sc4sap programs build a classical tabstrip screen (one normal screen with a tabstrip control, one subscreen per tab). Companion to [`alv-rules.md`](alv-rules.md) (ALV inside the subscreens) and [`ok-code-pattern.md`](ok-code-pattern.md) (tab function codes arrive in the OK_CODE variable). Applies to OOP and Procedural programs.

## Program side (ABAP)

TOP include:

```abap
CONSTANTS: BEGIN OF gc_tab_0200,          " one fcode per tab
             tab1 TYPE sy-ucomm VALUE 'TAB1',
             tab2 TYPE sy-ucomm VALUE 'TAB2',
           END OF gc_tab_0200.
CONTROLS ts_main TYPE TABSTRIP.           " name = STRIP_CTRL element name
DATA: BEGIN OF gs_ts_main,
        pressed_tab TYPE sy-ucomm VALUE gc_tab_0200-tab1,
        subscreen   TYPE sy-dynnr,
      END OF gs_ts_main.
```

- **PBO** of the tabstrip screen sets `ts_main-activetab = gs_ts_main-pressed_tab` and maps the pressed tab to its subscreen number (`gs_ts_main-subscreen`). Hosts the subscreen with `CALL SUBSCREEN <area> INCLUDING sy-repid gs_ts_main-subscreen.`
- **PAI** of the tabstrip screen runs `CALL SUBSCREEN <area>.` (so each subscreen's PAI executes), then dispatches on the OK_CODE variable: a tab fcode sets `gs_ts_main-pressed_tab`; BACK / EXIT / CANC leave.
- OOP: the modules stay thin and call screen-suffixed `LCL_ALV` methods (`tab_set_0200( )`, `user_command_0200( )`, `set_alv_0210( )` per subscreen). Procedural: FORMs with the same suffixes.
- The SE51 tabstrip wizard names (`TABSTRIP_ACTIVE_TAB_SET` / `_GET` modules, `G_TABSTRIP` structure, `C_TABSTRIP-TAB1` constants) are equally valid; keep one naming per program. The wizard's `OK_CODE = SY-UCOMM.` line must be dropped — the OK_CODE field already holds the code, and copying `sy-ucomm` is a MAJOR finding.
- Each subscreen hosts its ALV in a custom control (`CL_GUI_CUSTOM_CONTAINER` bound to the subscreen's `CUST_CTRL` element) — the one place where a custom container is correct, because a docking container cannot be placed inside a tab page.

## Dynpro side (`UpdateScreen` `dynpro_data`)

Tabstrip screen (normal screen, e.g. 0200):

- `containers`:
  - `{ TYPE: "STRIP_CTRL", NAME: "TS_MAIN", ELEMENT_OF: "SCREEN", LINE: 1, COLUMN: 2, LENGTH: 80, HEIGHT: 18, C_RESIZE_V: "X", C_RESIZE_H: "X", C_LINE_MIN: 6, C_COLN_MIN: 15 }`
  - `{ TYPE: "SUBSCREEN", NAME: "TS_SCA", ELEMENT_OF: "TS_MAIN", LINE: 3, COLUMN: 3, LENGTH: 78, HEIGHT: 16, C_RESIZE_V: "X", C_RESIZE_H: "X", C_SCROLL_V: "X", C_SCROLL_H: "X" }` — exactly one subscreen area inside the strip
- `fields_to_containers`, one `PUSH` row per tab: `{ CONT_TYPE: "STRIP_CTRL", CONT_NAME: "TS_MAIN", TYPE: "PUSH", NAME: "TS_MAIN_TAB1", TEXT: "<tab text>", LINE: 1, COLUMN: <tab index 1..n>, LENGTH / VISLENGTH: <text length>, PUSH_FCODE: "TAB1", PUSH_FTYPE: "", REQU_ENTRY: "N", REF_FIELD: "TS_SCA" }` — `PUSH_FTYPE` blank = paging in PAI (application), `REF_FIELD` must name the subscreen area.
- the OKCODE row bound to the TOP variable (`NAME: "OK_CODE"`).
- flow logic:

```
PROCESS BEFORE OUTPUT.
  MODULE status_0200.
  MODULE tab_set_0200.
  CALL SUBSCREEN ts_sca INCLUDING sy-repid gs_ts_main-subscreen.

PROCESS AFTER INPUT.
  CALL SUBSCREEN ts_sca.
  MODULE user_command_0200.
```

Subscreens (one per tab, e.g. 0210, 0220): header `TYPE: "I"`, `NEXTSCREEN: "0000"`; one `CUST_CTRL` container for the grid; flow logic PBO `MODULE alv_0210.`, PAI empty (`PROCESS AFTER INPUT.` only).

## Creation order (Phase 4 Wave 4)

1. Includes with every PBO / PAI module the screens name are uploaded and activated first — screen activation fails on unknown modules.
2. Subscreens (`CreateScreen` → `UpdateScreen` with `TYPE I`) — one per tab.
3. The tabstrip screen (`CreateScreen` → `UpdateScreen` with the strip, area, tabs and both `CALL SUBSCREEN` lines).
4. GUI status for the tabstrip screen.
5. `GetScreen` read-back of every screen for the verify assertions in `skills/create-program/phase4-verify.md` § Tabstrip screens.

## Findings (Phase 6 §1)

MAJOR: no `CALL SUBSCREEN <area>.` under `PROCESS AFTER INPUT` (subscreen PAI never runs); `CALL SUBSCREEN … INCLUDING` missing in PBO; a tab `PUSH` without `PUSH_FCODE` or with a `REF_FIELD` that is not the subscreen area; a referenced subscreen that does not exist or is not `TYPE I`; `CONTROLS <strip> TYPE TABSTRIP` missing or named differently from the `STRIP_CTRL` element.
