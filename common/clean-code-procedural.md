# Clean ABAP — Procedural Paradigm

Clean ABAP rules specific to the **Procedural paradigm** — `REPORT` programs built from `FORM` / `PERFORM` routines, classic PBO / PAI modules, function modules, and includes. Load this file when the Phase 1B interview picks `paradigm = Procedural` (and NOT when it picks `OOP`). Companion to [`clean-code.md`](clean-code.md) (paradigm-neutral shared baseline). Everything here is gated by `abap-release-reference.md`.

> Paired with [`procedural-form-naming.md`](procedural-form-naming.md) — that file defines FORM naming conventions (`_{screen_no}` suffix, STATUS_xxxx / USER_COMMAND_xxxx module names). This file defines the coding style rules that fill the FORM bodies.

## Mandatory Main Program Template (MUST match)

When generating a Procedural program's main `REPORT` source, the executor MUST start from and conform to the canonical sample:

**Source of truth**: [`procedural-sample/main-program.abap`](procedural-sample/main-program.abap).

- **Do**: copy the skeleton (REPORT statement, INCLUDE order matching the t/s/c/a/o/i/e/f/_tst convention, INITIALIZATION / AT SELECTION-SCREEN / START-OF-SELECTION / END-OF-SELECTION block layout, PBO/PAI module stubs delegating to FORMs), then adapt identifiers.
- **Do not**: inline FORM logic into events, declare globals outside the TOP include, place `DATA` statements in PBO/PAI/FORM includes, or deviate from the paired `procedural-form-naming.md` suffix rule.
- **Deviation requires written justification in `spec.md`** before the executor runs Phase 4. Undocumented structural drift from the template is a MAJOR finding in Phase 6 review.

## Global vs Local Discipline (TOP include)

- **TOP include holds every global TYPES / DATA / CONSTANTS**. No `DATA` declaration outside the TOP include (the PBO / PAI / FORM / EVENT includes consume globals; they do not declare them).
- **FORM locals are declared in the FORM**. Use `DATA: BEGIN OF` / `DATA:` inside the FORM body for variables that exist only for one routine. Do NOT add them to TOP as "I might need this elsewhere".
- **One global namespace — avoid collisions** — prefix globals with `g` (`gt_vbak`, `gs_header`, `gv_selected`) so FORM-locals (`lt_*`, `ls_*`, `lv_*`) are visually distinguishable.
- **Never shadow a global** inside a FORM with a same-named local — it is legal ABAP but catastrophic for debugging. Rename the local.
- **No cross-FORM state via globals except the main data table** — if FORM A needs a value produced by FORM B, pass it via `USING` / `CHANGING`, not through a hidden global.

## FORM / PERFORM — Parameters and Signatures

- **`USING` for inputs**, `CHANGING` for in/out. Never use `USING` to receive a value you are going to modify — the caller cannot see from the call site that the value will change.
- **Type every parameter** — `FORM f USING p_a TYPE ... p_b TYPE ...`. Avoid typeless `USING p_a` (defaults to `ANY` and disables static checks).
- **Use `TYPE REF TO` for large itabs** — `USING VALUE(it_data) TYPE ty_t` copies the whole table; prefer `USING it_data TYPE ty_t` (pass-by-reference by default).
- **Parameter count** — aim for ≤ 4. If a FORM needs more, pass a DDIC structure (`USING ps_ctx TYPE ty_ctx`) instead.
- **No boolean `USING` parameter** — `USING pv_force TYPE abap_bool` that branches inside the FORM should be two FORMs (`process_force`, `process_strict`).
- **PERFORM call layout** — one parameter per line when parameter count > 2, aligned under the FORM name.

## FORM Body

- **One FORM does one thing.** Name it as a verb + noun pair (`read_vbak`, `build_fieldcatalog`, `display_alv`). If the name needs "and", split.
- **Length** under ~50 lines — procedural logic is often more linear than OOP methods, but beyond 50 lines comprehension drops. Extract to sub-FORMs.
- **Screen-bound FORMs end with `_{screen_no}` suffix** (`process_save_0100`, `init_fields_0200`) per [`procedural-form-naming.md`](procedural-form-naming.md). Utility FORMs (shared across screens) get no suffix.
- **PBO / PAI module names** — `STATUS_0100`, `USER_COMMAND_0100`, `MODIFY_SCREEN_0100`. Body of a module should be one line: `PERFORM f_status_0100.` — all logic lives in the FORM, not the module.
- **PAI user-command routing — MUST follow the OK_CODE binding pattern** in [`ok-code-pattern.md`](ok-code-pattern.md). Declare `gv_okcode TYPE sy-ucomm.` in TOP, bind the screen's OKCODE field NAME to `GV_OKCODE`, and in the `user_command_xxxx` FORM copy `gv_okcode` to a local, `CLEAR gv_okcode`, then `CASE` on the local. Reading `sy-ucomm` directly inside the FORM breaks silently on popup / ALV-event flows and is a MAJOR Phase 6 finding.
- **No declaration in the middle of a FORM** — all FORM-local declarations at the top, logic below. Inline `DATA(lv_x)` is permitted if `ABAP_RELEASE ≥ 740`, but be sparing: keeping declarations at the top of the FORM improves procedural readability.

## Procedural Error Handling

- **`sy-subrc` checked after every statement that sets it** — `SELECT SINGLE`, `READ TABLE`, `ASSIGN`, `CALL FUNCTION` with `EXCEPTIONS`, `AUTHORITY-CHECK`, `CALL TRANSACTION`, `OPEN CURSOR` / `FETCH NEXT CURSOR`, and similar.
- **Classic pattern — call function modules with an `EXCEPTIONS` clause**:
  ```abap
  CALL FUNCTION 'Z_MM_GR_POST'
    EXPORTING iv_matnr = lv_matnr
    IMPORTING ev_result = lv_result
    EXCEPTIONS not_authorized    = 1
               posting_failed    = 2
               OTHERS            = 3.
  CASE sy-subrc.
    WHEN 0.
      " happy path
    WHEN 1. MESSAGE e001(zmsg).
    WHEN 2. MESSAGE e002(zmsg) WITH lv_matnr.
    WHEN OTHERS. MESSAGE e999(zmsg).
  ENDCASE.
  ```
- **Message types match intent** — `'S'` success, `'I'` info, `'W'` warning, `'E'` error-in-dialog, `'A'` abort (rare), `'X'` short dump (never from business logic).
- **`MESSAGE ... RAISING <exc>`** inside a function module — this sets `sy-subrc` and the message fields in one go; the caller reads `MESSAGE ID ... NUMBER ...` to recover the text.
- **No `EXIT` / `STOP` / `LEAVE PROGRAM`** as error handling — they bypass `AT EXIT-COMMAND` cleanup. Use `MESSAGE e... `'E'`` or return via `sy-subrc`.
- **Never swallow `sy-subrc`** — if not handled, the value is checked later or the case is documented inline.

## Modularization Boundaries

- **FORM** — program-local logic, called only from the same program or its includes
- **FUNCTION MODULE** — reusable across programs, may participate in RFC / tRFC / qRFC. Add `EXCEPTIONS` clause.
- **INCLUDE** — not a modularization unit, just a text split. Never use includes to share logic between programs (copy-paste risk); use a FM for that.
- **When a FORM grows beyond comprehension AND is called from only one place** — extract to a sub-FORM, not a function module. FM creation is a design choice (reusability, RFC capability), not a length fix.
- **When the same procedural logic appears in 2+ programs** — promote to a function module inside the program's function group, or extract to a local class `LCL_HELPER` in a shared include.
- See [`procedural-form-naming.md`](procedural-form-naming.md) for FORM / module naming rules and [`include-structure.md`](include-structure.md) for the t/s/c/a/o/i/e/f/_tst suffix convention.

## Procedural Testing — Limits and Workarounds

- **Procedural code is hard to unit-test** — FORMs depend on globals, which ABAP Unit cannot isolate cleanly.
- **Strategy 1 — extract to a helper class and test that**. Move the pure-computation logic (validation, calculation, transformation) from a FORM into a local class `LCL_HELPER` with `FOR TESTING` sibling. Keep the FORM as a thin adapter: `PERFORM ... → lcl_helper=>process( ... )`.
- **Strategy 2 — test the FORM indirectly via a small driver program** — write a test REPORT that sets globals, calls the FORM via `PERFORM`, and asserts results. Less automated but better than nothing.
- **What not to do** — do NOT add `FOR TESTING` annotations directly on FORMs (not supported) and do NOT mock globals by reassigning them in setup (race conditions, debug pain).
- **Mandatory**: if the interview's testing scope is `none`, skip ABAP Unit entirely for procedural programs — do not stub out empty test classes. Document the rationale in the spec.

## Comments — Procedural-Specific

- **One-line header above each FORM** describing the FORM's contract (inputs, outputs, side effects on globals). Example:
  ```abap
  "--------------------------------------------------
  " f_read_vbak — reads header data for selected
  "   vbeln range into gt_vbak; uses gs_selscreen.
  "--------------------------------------------------
  FORM f_read_vbak.
  ...
  ```
  The header is justified because procedural FORMs often touch globals — the name alone does not document that coupling. Do NOT write this header on OOP methods (the method signature is self-documenting).
- **No `" begin of ...` / `" end of ...` blocks inside a FORM** — if a FORM is long enough to need inner section markers, it is too long; extract.
- **Module-level block** — PBO / PAI / EVENT includes may have a single top-of-include comment declaring the include's purpose; no other structural comments.
