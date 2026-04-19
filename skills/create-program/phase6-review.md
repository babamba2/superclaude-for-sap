# Phase 6 — Code Review (MANDATORY, Unconditional)

This file is the authoritative checklist for the Phase 6 review step of `/sc4sap:create-program`. SKILL.md references this file — do not duplicate the content there.

## Purpose

A successful activation from Phase 4 only proves the code **compiles and links**. It does NOT prove the code follows the shared conventions in `../../common/`. Phase 6 closes this gap: the reviewer fetches every created object's source via MCP and verifies, line by line, against each applicable convention file.

> **Past incident** — a spec said "build LVC_T_FCAT manually" → executor faithfully wrote `APPEND ls_fc TO pt_fcat` repeated per column → activation succeeded → user found `alv-rules.md` violation only after manual review. Phase 6 would have caught it before the user ever saw the program.

## Pipeline Position

- Phase 4 (Implementation) → Phase 6 (Review) → Phase 8 (Completion Report)
- Phase 5 (QA) is conditional on OOP mode. Phase 7 (Debug) is conditional on failures. **Phase 6 is unconditional.**
- Phase 8 has a hard gate: it requires `review.md` to exist with PASS verdicts before the report can be written.

## Agent + Strategy

Delegate to `sap-code-reviewer`. Pass:
- The list of object names created in Phase 4 (with type: PROG/I, PROG/P, DYNP, CUAD, etc.)
- The transport number
- The path to `spec.md`
- A reminder to write the review log to `.sc4sap/program/{PROG}/review.md`

**Execution strategy — 4-bucket parallel (Sonnet) + Opus escalation**: see [`phase6-buckets.md`](./phase6-buckets.md) for the authoritative bucket split, parallel dispatch rules, finding classification (PASS / MINOR / MAJOR), and the Sonnet→Opus escalation ladder. The checklist below remains the source of truth for WHAT is checked; buckets only govern HOW the checks are distributed.

## Convention Checklist

For each created object, fetch source via the appropriate MCP tool (`GetInclude`, `GetProgram`, `GetClass`, `GetInterface`, `GetScreen`, `GetGuiStatus`, `GetTextElement`) and verify against **every** convention below that applies. Record verdict per check: `PASS` / `FIX-APPLIED` / `N/A (reason)`.

### 1. `../../common/alv-rules.md` — ALV Display Rules

Applies to: any program that displays a result set in ALV.

- [ ] **Display mode** matches the spec: `CL_GUI_ALV_GRID` for full screens (custom screen + GUI status + Docking Container), `CL_SALV_TABLE` for popups
- [ ] **Container** for full ALV is `CL_GUI_DOCKING_CONTAINER` (NOT custom container in a Custom Control screen element)
- [ ] **Field Catalog Construction Standard (CRITICAL — most-often violated)**:
  - The catalog MUST be extracted via SALV factory and converted with `cl_salv_controller_metadata=>get_lvc_fieldcatalog`. See `alv-rules.md` Step 1 for the canonical FORM signature.
  - **VIOLATION pattern to flag**: any code that builds `LVC_T_FCAT` by repeated `CLEAR ls_fc / ls_fc-fieldname = ... / APPEND ls_fc TO pt_fcat`. This bypasses DDIC reference resolution and duplicates type metadata that SALV would derive automatically.
  - Per-field attribute adjustment (`coltext`, `outputlen`, `do_sum`, `no_out`, `hotspot`, `qfieldname`, `cfieldname`) must use a `CASE FIELDNAME` block on the extracted catalog, never inline construction.

### 2. `../../common/text-element-rule.md` — Text Element Rule

Applies to: every screen, every dialog message, every literal that the end user can see.

- [ ] No hardcoded display literals in screen layouts — all field labels reference `TEXT-Txx`
- [ ] No hardcoded literals in `MESSAGE` statements that aren't dynamic — short labels go through text elements (`MESSAGE TEXT-t01 TYPE 'E'`)
- [ ] Translatable strings are NOT embedded in string templates with literal text only (`|Material { lv } created|` — the static parts should still come from text elements when reused)
- [ ] Text elements are created via `CreateTextElement` and present after activation

### 3. `../../common/constant-rule.md` — Constant Rule

Applies to: every program with logic.

- [ ] No magic literals in business logic — function codes (`'SAVE'`, `'EXIT'`), status names, screen numbers used in branching, threshold values must be `CONSTANTS` declared in the TOP include
- [ ] `gc_fcode_*` (or equivalent prefix) constants are referenced everywhere the literal would otherwise appear
- [ ] System values like `abap_true` / `abap_false` / `space` used instead of `'X'` / `''` / `' '`

### 4. `../../common/procedural-form-naming.md` — Procedural FORM Naming (Procedural mode only)

Applies to: programs implemented with PERFORM (not OOP local classes).

- [ ] Every FORM that handles screen-bound logic ends with the screen number suffix (`_0100`, `_0200`)
- [ ] FORMs shared across screens get no suffix (utility helpers)
- [ ] PBO/PAI module names follow `STATUS_xxxx` / `USER_COMMAND_xxxx` style

### 5. `../../common/oop-pattern.md` — OOP Two-Class Pattern (OOP mode only)

Applies to: programs implemented with local classes.

- [ ] Two classes present: `LCL_DATA` (BAPI/business logic) + `LCL_SCREEN` or `LCL_ALV` (presentation)
- [ ] No business logic in screen class, no UI calls in data class
- [ ] Public method surface is minimal; helpers are PRIVATE

### 6. `../../common/include-structure.md` — Include Structure

Applies to: every multi-include program.

- [ ] Suffix convention followed: `_TOP` / `_SEL` / `_CLASS` / `_PBO` / `_PAI` / `_FORM` / `_TST` (and `_O` / `_I` / `_F` legacy variants if the project uses them)
- [ ] Empty-by-design includes are NOT created; conditional includes (e.g., `_SEL` for a no-parameter program) are simply omitted, not stubbed
- [ ] TOP include holds all global TYPES / DATA / CONSTANTS — no DATA declarations leaking into PBO/PAI/FORM

### 7. `../../common/naming-conventions.md` — Naming Conventions

Applies to: every created object.

- [ ] Z/Y prefix on all custom objects
- [ ] Module prefix in program / table / class names where the convention prescribes (e.g., `ZMM*` for MM, `ZSD*` for SD)
- [ ] Include names match `{PROG}_{SUFFIX}` exactly
- [ ] Function group / function module / data element / domain naming follows the table in the convention
- [ ] Function Module source follows [`../../common/function-module-rule.md`](../../common/function-module-rule.md) — inline `IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS` in the `FUNCTION` statement. **Reject if `GetFunctionModule` returns the placeholder `" You can use the template 'functionModuleParameter' to add here the signature!`**, or if spec calls for parameters but none are declared, or if body uses shadow locals (`lv_iv_xxx TYPE ...`) instead of real parameters.

### 8. `../../common/clean-code.md` + paradigm-specific companion — Clean ABAP

**Paradigm gate** — read `Paradigm` from `interview.md`: `OOP` → load [`clean-code-oop.md`](../../common/clean-code-oop.md); `Procedural` → load [`clean-code-procedural.md`](../../common/clean-code-procedural.md). Loading both or the wrong one is MAJOR.

Core (clean-code.md, both paradigms):
- [ ] No `SELECT *` — explicit field list
- [ ] No `SELECT` inside `LOOP` — use `FOR ALL ENTRIES` or join
- [ ] `SY-SUBRC` checked after every statement that sets it (SELECT SINGLE, READ TABLE, CALL FUNCTION with EXCEPTIONS)
- [ ] Internal table type matches access pattern (HASHED / SORTED / STANDARD), no DEFAULT KEY
- [ ] Secondary key declared when SELECT source is a transactional / large table AND downstream access is on non-primary fields
- [ ] Large-table SELECTs preceded by `COUNT(*)` check + tuning plan when count > 1M
- [ ] Backtick string literals (` \` `) for STRING values, `|...|` templates for assembly
- [ ] Boolean variables typed `ABAP_BOOL`, compared against `abap_true` / `abap_false`, set via `XSDBOOL( )`
- [ ] Conditions positive, `IS NOT` over `NOT IS`, no empty IF branches
- [ ] Prefer explicit typed internal tables over inline `INTO TABLE @DATA(...)` for SELECTs feeding further logic
- [ ] Inline declarations / modern syntax used where `ABAP_RELEASE` permits — never newer than configured release
- [ ] No commented-out code, no debug statements (`BREAK-POINT`, `MESSAGE 'TEST'`)

Paradigm = OOP → load `clean-code-oop.md` and check:
- [ ] **Main program structure matches `../../common/oop-sample/zrsc4sap_oop_ex.prog.abap`** — REPORT statement, INCLUDE order, event block layout, two-class bootstrap (`go_data = NEW lcl_data( )` / `go_alv = NEW lcl_alv( go_data )`). Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
- [ ] Classes `FINAL` unless designed for inheritance; members `PRIVATE` by default
- [ ] Methods do one thing, ≤ 30 lines, single abstraction level, ≤ 3 IMPORTING parameters
- [ ] Methods return one value (`RETURNING` over `EXPORTING`); no boolean input parameters
- [ ] `NEW #( ... )` over `CREATE OBJECT`; multiple static creation methods over optional constructor params
- [ ] Exceptions: class-based only; own project super class; wrap foreign `CX_SY_*`; `RAISE EXCEPTION NEW`
- [ ] Formatting: 120-char line limit, consistent alignment, one statement per line
- [ ] Tests: given-when-then naming, test publics only, inject doubles via constructor, `LOCAL FRIENDS` only for constructor access

Paradigm = Procedural → load `clean-code-procedural.md` and check:
- [ ] **Main program structure matches `../../common/procedural-sample/main-program.abap`** — REPORT statement, INCLUDE order (t/s/c/a/o/i/e/f/_tst), event block layout, PBO/PAI modules as one-line `PERFORM` delegators. Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
- [ ] All globals declared in TOP include only; no `DATA` in PBO/PAI/FORM/EVENT includes
- [ ] Global / local variables visually distinguishable (`g*` vs `l*` prefix); no local shadows a global
- [ ] FORM parameters typed (`USING p_a TYPE ...`); `USING` for inputs, `CHANGING` for in/out; no boolean `USING`
- [ ] Screen-bound FORMs end with `_{screen_no}` suffix; utility FORMs have no suffix
- [ ] PBO/PAI module bodies are one line (`PERFORM f_...`); logic lives in FORMs, not in modules
- [ ] `sy-subrc` checked after every statement that sets it; `CALL FUNCTION` uses `EXCEPTIONS` clause with `CASE sy-subrc`
- [ ] No `EXIT` / `STOP` / `LEAVE PROGRAM` used as error handling
- [ ] Each FORM has a one-line header comment describing inputs / outputs / global side effects
- [ ] Testing: if the spec requires tests, the testable logic is extracted to `LCL_HELPER` (not left inside FORMs)

### 9. `../../common/abap-release-reference.md` — ABAP Release Awareness

- [ ] No syntax used that exceeds the configured `abapRelease` (e.g., no `RAP managed implementation` on a 740 system)

### 10. `../../common/sap-version-reference.md` — SAP Version Awareness

- [ ] No S/4-only tables/APIs on ECC (`MATDOC`, `ACDOCA`, `BUT000` for BP)
- [ ] No ECC-deprecated patterns on S/4 (e.g., `LFA1`/`KNA1` directly when BP is the master record)

### 11. `../../common/spro-lookup.md` — SPRO Lookup Protocol

Applies to: programs that depend on SPRO/IMG configuration.

- [ ] Customizing tables referenced in code match what `sap-{module}-consultant` recommended in `consult-{module}.md`
- [ ] No hardcoded org-unit values that should come from customizing

### 12. Activation State

- [ ] `GetInactiveObjects` returns 0 entries from the program's object set
- [ ] All objects assigned to the agreed transport request

## Output File Format

Write to `.sc4sap/program/{PROG}/review.md`:

```markdown
# Phase 6 Review — {PROG}

**Date**: YYYY-MM-DD
**Reviewer Agent**: sap-code-reviewer
**Spec ref**: spec.md
**Objects reviewed**: list of N objects

## Conventions Checked

| # | Convention | Verdict | Notes |
|---|------------|---------|-------|
| 1 | alv-rules.md           | PASS / FIX-APPLIED / N/A | ... |
| 2 | text-element-rule.md   | ... | ... |
| 3 | constant-rule.md       | ... | ... |
| 4 | procedural-form-naming | ... | ... |
| 5 | oop-pattern.md         | ... | ... |
| 6 | include-structure.md   | ... | ... |
| 7 | naming-conventions.md  | ... | ... |
| 8 | clean-code.md          | ... | ... |
| 9 | abap-release-reference | ... | ... |
| 10| sap-version-reference  | ... | ... |
| 11| spro-lookup.md         | ... | ... |
| 12| Activation state       | ... | GetInactiveObjects=0 |

## Violations Fixed In-Phase

For each FIX-APPLIED entry: object name, line excerpt, what was changed, why.

## Final Verdict

✅ ALL PASS — proceed to Phase 8
or
❌ BLOCKED — list residual violations and reason
```

## Failure Handling

- On any violation: the reviewer **fixes the violation directly** via `Update*` MCP tools and re-activates. Documentation-only flagging is NOT acceptable.
- After all fixes, re-fetch sources and re-verify. Loop until ALL PASS or 3 iterations exhausted.
- If 3 iterations exhausted with residual violations: STOP, write `review.md` with `❌ BLOCKED`, surface to user with the specific violation list. Phase 8 is blocked.
