# OOP Pattern — Two-Class Split

Shared convention for OOP-mode ABAP programs in sc4sap. Canonical reference: [`common/oop-sample/zrsc4sap_oop_ex*`](oop-sample/) (the `s4sap-cm` variant of the skeleton below). Include set and order: [`include-structure.md`](include-structure.md).

## Two-Class Split (Mandatory)

Both classes live in the class include `{PROG}c`:

- **`LCL_DATA`** — data selection / business logic
  - Owns the ALV object: attribute `MO_ALV TYPE REF TO LCL_ALV`, created in its `CONSTRUCTOR` (`mo_alv = NEW #( ).`)
  - Typical methods: `CONSTRUCTOR`, `INITIALIZATION`, `CHECK_COMMON_AUTHORITY`, `HANDLE_SCREEN`, `GET_DATA`
  - No UI calls
- **`LCL_ALV`** — screen / ALV / display
  - Typical methods: `DISPLAY`, `STATUS_0100`, `SET_ALV_0100`, `REFINE_FCAT`, `SET_GRID_TITLE`, `GET_DEFAULT_ALV_VARIANT`
  - Holds container / grid references; reads the result through `GO_DATA`
  - Inherits from the ALV framework base class when `alvFramework` ≠ `none` (§ ALV Framework)
- **Event classes** (in `{PROG}e`, only when events are handled): `LCL_EVENT_ALV` (grid), `LCL_SALV_EVENT_HANDLER` (SALV), `LCL_EVENT_TREE` (tree)

Layout of `{PROG}c`:

```abap
CLASS lcl_data DEFINITION DEFERRED.
CLASS lcl_alv DEFINITION DEFERRED.
DATA go_data TYPE REF TO lcl_data.
DATA go_alv  TYPE REF TO lcl_alv.

CLASS lcl_data DEFINITION. ... DATA mo_alv TYPE REF TO lcl_alv. ... ENDCLASS.
CLASS lcl_alv DEFINITION.  ... ENDCLASS.
CLASS lcl_data IMPLEMENTATION. ... ENDCLASS.
CLASS lcl_alv IMPLEMENTATION.  ... ENDCLASS.
```

`GO_DATA` / `GO_ALV` are declared here, right after the `DEFERRED` lines — not in TOP. Every other global stays in TOP.

## Main Program Orchestration

```abap
INITIALIZATION.
  go_data = NEW #( ).            " LCL_DATA constructor creates mo_alv = NEW #( )
  go_alv ?= go_data->mo_alv.
  go_data->initialization( ).

AT SELECTION-SCREEN.
  go_data->check_common_authority( ).

START-OF-SELECTION.
  go_data->get_data( ).

END-OF-SELECTION.
  go_alv->display( ).
```

Write only the event blocks the program needs (`AT SELECTION-SCREEN OUTPUT` → `go_data->handle_screen( )`, `ON VALUE-REQUEST FOR p_var` → `go_alv->get_default_alv_variant( )`); never an empty block. `NEW #( )` infers the type from the reference variable and is valid from 7.40.

## Method Naming

- **Recommended names**: `INITIALIZATION`, `CHECK_COMMON_AUTHORITY`, `HANDLE_SCREEN`, `GET_DATA`, `DISPLAY`, `GET_DEFAULT_ALV_VARIANT`, `SET_GRID_TITLE`, `REFINE_FCAT`.
- **Screen-bound methods carry the `_{screen_no}` suffix** — `STATUS_0100`, `SET_ALV_0100`, `USER_COMMAND_0100`. Same criterion as Procedural FORMs: bound to a dynpro of this program. Missing suffix is MINOR in review.

## Field Catalog

Build the catalog from DDIC / SALV metadata — `cl_salv_controller_metadata=>get_lvc_fieldcatalog` over a SALV factory of the output table, or the framework base class's `GET_FIELDCAT( it_data = … )` — then adjust it in `REFINE_FCAT` with `CASE fieldname`. No manual `APPEND … TO lt_fcat`. Details: [`alv-rules.md`](alv-rules.md).

## Event Wiring

`{PROG}e` follows `{PROG}c`, so `LCL_ALV` cannot call `LCL_EVENT_ALV` statically. The receiver is created by name:

- `s4sap-cm` / `custom`: the base class does it (`mo_alv_event = NEW #( iv_local_class_definition = 'LCL_EVENT_ALV' )` in the sample).
- `none`: `LCL_ALV` keeps `mo_event TYPE REF TO object` and, after creating the grid, runs `CREATE OBJECT mo_event TYPE ('LCL_EVENT_ALV') EXPORTING io_grid = mo_grid.`; the `LCL_EVENT_ALV` constructor does `SET HANDLER`. This dynamic `CREATE OBJECT` is the sanctioned exception to "prefer `NEW #( )`" (NEW has no dynamic type).

Handlers delegate to `GO_ALV` / `GO_DATA` methods; no business logic in the event class.

## ALV Framework (profile setting `alvFramework`)

Profile `config.json` (`~/.sc4sap/profiles/<alias>/config.json`):

| Key | Values | Meaning |
|---|---|---|
| `alvFramework` | `s4sap-cm` | `LCL_ALV INHERITING FROM ZCL_S4SAP_CM_ALV`, events of `ZCL_S4SAP_CM_OALV` — the handlers in [`abap/alv-oop-handlers/`](../abap/alv-oop-handlers/) (setup step 9b) |
| | `custom` | `LCL_ALV INHERITING FROM <alvBaseClass>` — the customer's own framework |
| | `none` (default when unset) | plain `CL_GUI_DOCKING_CONTAINER` + `CL_GUI_ALV_GRID` (and `CL_SALV_TABLE` for popups), same `LCL_DATA` / `LCL_ALV` split |
| `alvBaseClass` | class name | `custom` only — base class of `LCL_ALV` |
| `alvGridClass` | class name | `custom` only, optional — grid class whose events `LCL_EVENT_ALV` handles (default `CL_GUI_ALV_GRID`) |
| `messageClass` | message class | optional — used in `REPORT … MESSAGE-ID` |

Set via `/sc4sap:sap-option` (ALV framework) or written by setup step 9b. Never write a customer's class names into plugin files — they live only in the profile.

**Phase 2 preflight** (`skills/create-program/agent-pipeline.md`): `SearchObject` the base class (and `messageClass`); if missing, fall back to `none` and record the note in `plan.md` / `spec.md`. If the framework classes sit in `$TMP` while the program goes to a transportable package, warn (QA/PRD import would fail) and recommend `none`.

**Messages**: `REPORT … MESSAGE-ID <msgclass>` with the profile `messageClass` or the module's message class; without one, text symbols. `S_UNIFIED_CON` only with `alvFramework = s4sap-cm`. Literal message texts violate [`text-element-rule.md`](text-element-rule.md).

## Unit Tests (`{PROG}ct`, always)

- `CLASS lcl_test DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.` — optional extra `LTC_*` classes for focused groups.
- Interview testing scope only decides the breadth. Scope `none` → one smoke test of a pure `LCL_DATA` method (no DB writes, no screen).
- Tested methods are PUBLIC; a call from `LCL_TEST` is a demonstrated need (see `clean-code-oop.md`).

## Sample Requirement

**When the program needs ALV (grid, tree, SALV, or editable ALV), model it after [`common/oop-sample/`](oop-sample/).** The sample is the `s4sap-cm` variant; lines marked `alvFramework` are the only framework-specific parts — replace them per the table above.

- **Reference set**: `zrsc4sap_oop_ex.prog.abap` + includes `*t` (TOP) `*s` (selection) `*c` (LCL_DATA + LCL_ALV) `*ct` (tests) `*e` (event handlers) `*o` (PBO) `*i` (PAI) + screens `0100` / `0200`.
- **When in doubt**: copy the sample's include split, bootstrap, event wiring, container creation, catalog refinement, and PBO / PAI module names.

Agents invoking `/sc4sap:create-program` in OOP mode, `sap-executor` when writing ALV logic, and `sap-code-reviewer` when reviewing it — all three MUST open the sample files before generating or approving ALV code.
