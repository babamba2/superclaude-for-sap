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
- A reminder that it returns text only — the main thread writes `.sc4sap/program/{PROG}/review.md`
- The path to `verify-phase4.md` (Phase 4 Haiku verify results; a created screen / GUI status with no block there is a MAJOR finding under §1)

**Execution strategy** — chosen by `~/.sc4sap/preferences.json` → `phase6Strategy`: `buckets` (default — 4-bucket parallel Sonnet + Opus escalation, [`phase6-buckets.md`](./phase6-buckets.md)) or `detect-judge` (opt-in — Haiku detectors × N + one Opus judge, [`phase6-detect-judge.md`](./phase6-detect-judge.md)). Both share the PASS / MINOR / MAJOR classification in `phase6-buckets.md`; in both the reviewer is read-only and fixes go to `sap-executor`. The checklist below remains the source of truth for WHAT is checked; buckets only govern HOW the checks are distributed.

## Convention Checklist

For each created object, fetch source via the appropriate MCP tool (`GetInclude`, `GetProgram`, `GetClass`, `GetInterface`, `GetScreen`, `GetGuiStatus`, `GetTextElement`) and verify against **every** convention below that applies. Record verdict per check: `PASS` / `FAIL` (+ `FIX` line) / `N/A (reason)`; the main thread rewrites `FAIL` to `FIX-APPLIED` after `sap-executor` applies the fix.

**Context kit discipline (per `../../common/context-loading-protocol.md`)**: each §1–§12 below is an independent reviewer bucket. Load ONLY the rule file(s) named in that section when checking it — do NOT preload all 12. On a MAJOR finding, escalate to Opus with the narrow context for that section only.

### 1. `../../common/alv-rules.md` — ALV Display Rules + Screen/GUI Population

Applies to: any program that displays a result set in ALV.

- [ ] **Display mode** matches the spec: `CL_GUI_ALV_GRID` for full screens (custom screen + GUI status + Docking Container), `CL_SALV_TABLE` for popups
- [ ] **Container** for full ALV is `CL_GUI_DOCKING_CONTAINER` (NOT custom container in a Custom Control screen element) — except ALVs inside tabstrip subscreens, which use a custom control
- [ ] **Tabstrip screens** — per [`../../common/screen-tabstrip.md`](../../common/screen-tabstrip.md): `CONTROLS <strip> TYPE TABSTRIP` matches the `STRIP_CTRL` element; one `SUBSCREEN` area `ELEMENT_OF` the strip; every tab `PUSH` has `PUSH_FCODE` and `REF_FIELD` = the area; every referenced subscreen exists with `TYPE I`; PBO has `CALL SUBSCREEN <area> INCLUDING …` and PAI has `CALL SUBSCREEN <area>.` Any miss is MAJOR.
- [ ] **Field Catalog Construction Standard (CRITICAL — most-often violated)**: catalog MUST be derived from DDIC / SALV metadata — SALV factory + `cl_salv_controller_metadata=>get_lvc_fieldcatalog`, or the ALV framework base class's catalog builder (`GET_FIELDCAT`) when `alvFramework` ≠ `none`. Repeated `APPEND ls_fc TO pt_fcat` / `APPEND VALUE #( … ) TO rt_fcat` inline construction → VIOLATION. Per-field attribute adjustment (`coltext`, `outputlen`, `do_sum`, `no_out`, `hotspot`, `qfieldname`, `cfieldname`) via `CASE FIELDNAME` only (OOP: in a `REFINE_FCAT` method).
- [ ] **Screen flow logic populated (NEW — reject false positives)**: for every screen created, call `GetScreen(program, screen_number)` and verify `flow_logic` has at least one `MODULE <name>.` line under `PROCESS BEFORE OUTPUT.` AND one under `PROCESS AFTER INPUT.` (besides `AT EXIT-COMMAND`) that does NOT start with `*` or `"` — flow logic carries no `OUTPUT` / `INPUT` suffix on MODULE lines. A screen whose flow logic is only `* MODULE STATUS_0100.` / `* MODULE USER_COMMAND_0100.` is a MAJOR finding — executor ran `CreateScreen` but skipped `UpdateScreen(flow_logic)`. Exception: a tabstrip subscreen (`TYPE I`) needs a PBO MODULE only — its PAI may be empty (`screen-tabstrip.md`).
- [ ] **GUI Status populated (NEW)**: for every status created, call `GetGuiStatus(program, status_name)` and verify the status has non-empty PFKEYS / menu / toolbar entries — not just a `STA` + `TIT` shell. An empty GUI status presents a blank toolbar at runtime.
- [ ] **OK_CODE binding contract** — per [`../../common/ok-code-pattern.md`](../../common/ok-code-pattern.md): (a) the TOP include declares exactly one OK_CODE variable (any name, e.g. `OK_CODE` or `GV_OKCODE`); (b) the screen's `fields_to_containers[]` OKCODE entry has `NAME` = that variable; (c) PAI dispatches on that variable — in the PAI module, an `LCL_ALV` method, or a Procedural `user_command_xxxx` FORM. `CASE sy-ucomm` (or a copy of `sy-ucomm`) anywhere in PAI, a missing TOP variable, or an OKCODE field with no / another NAME is MAJOR. No local copy + `CLEAR`, or literal function codes in that `CASE`, is MINOR.

### 2. `../../common/text-element-rule.md` — Text Element Rule (I / S / R / H)

Applies to: every screen, every dialog message, every literal that the end user can see.

- [ ] No hardcoded display literals in screen layouts — all field labels reference `TEXT-Txx` (dynpro element texts such as tab captions and pushbutton texts are translatable screen texts, not literals)
- [ ] No hardcoded literals in `MESSAGE` statements — use `MESSAGE TEXT-t01 TYPE 'E'`
- [ ] Translatable strings not embedded in string templates with literal text only
- [ ] Text elements created via `CreateTextElement` and present after activation
- [ ] **All four types verified via `ReadTextElementsBulk(program, language)` (NEW — blocks the "Create-without-full-types" regression)**:
  - `counts.R ≥ 1` (program title present)
  - `counts.I == count of TEXT-xxx literals in source` (read program source + regex `TEXT-[A-Z0-9]{3}`)
  - **`counts.S == count of SELECT-OPTIONS + PARAMETERS declarations on the selection screen`** (the most common miss — runtime shows technical names like `S_BUDAT` / `P_FILE`)
  - `counts.H ≥ 1` only if program uses classical WRITE lists (else 0 is correct)
- [ ] Every text id exists in BOTH the primary logon language AND `'E'` (run the bulk read twice with different `language=`; both must return the same key set).

### 3. `../../common/constant-rule.md` — Constant Rule

Applies to: every program with logic.

- [ ] No magic literals in business logic — function codes (`'SAVE'`, `'EXIT'`), status names, screen numbers used in branching, threshold values must be `CONSTANTS` declared in the TOP include
- [ ] `gc_fcode_*` (or equivalent prefix) constants are referenced everywhere the literal would otherwise appear — exception: function-code literals inside the PAI `CASE` on the OK_CODE variable are MINOR (see `ok-code-pattern.md`)
- [ ] System values like `abap_true` / `abap_false` / `space` used instead of `'X'` / `''` / `' '`

### 4. `../../common/procedural-form-naming.md` — Procedural FORM Naming (Procedural mode only)

Applies to: programs implemented with PERFORM (not OOP local classes).

- [ ] Every FORM bound to a custom dynpro of this program ends with that screen number (`_0100`, `_0200`)
- [ ] SALV-only FORMs (popup or full screen, no custom dynpro) and utility FORMs shared across screens have no suffix
- [ ] PBO/PAI module names follow `STATUS_xxxx` / `USER_COMMAND_xxxx` style

### 5. `../../common/oop-pattern.md` — OOP Two-Class Pattern (OOP mode only)

Applies to: programs implemented with local classes.

- [ ] Two classes present in `{PROG}c`: `LCL_DATA` (BAPI/business logic, owns `MO_ALV`) + `LCL_ALV` (presentation), after `CLASS … DEFINITION DEFERRED` + `DATA go_data` / `go_alv`
- [ ] No business logic in screen class, no UI calls in data class
- [ ] PUBLIC methods have a caller outside the class (main event block, PBO/PAI module, other local class, or `LCL_TEST`); a PUBLIC method with no outside caller is MINOR
- [ ] ALV base class / handlers match the profile's `alvFramework` (recorded in `spec.md`): another framework than the chosen mode is MAJOR; with `none`, plain `CL_GUI_ALV_GRID` / `CL_SALV_TABLE` and no `ZCL_S4SAP_CM_*` is PASS
- [ ] Screen-bound methods carry the `_{screen_no}` suffix (`SET_ALV_0100`, `STATUS_0100`) — missing suffix is MINOR
- [ ] `{PROG}ct` exists with `LCL_TEST … FOR TESTING` (at least one test, even for testing scope `none`)

### 6. `../../common/include-structure.md` — Include Structure

Applies to: every multi-include program.

- [ ] Suffix convention followed per the table in `include-structure.md` — OOP `t` / `s` / `c` / `ct` / `e` / `o` / `i` (+ `f` only when FORMs exist; never `a`), Procedural `t` / `s` / `o` / `i` / `f` (+ `c` / `a` only when the spec declares them)
- [ ] Empty-by-design includes are NOT created; conditional includes (e.g., `s` for a no-parameter program) are simply omitted, not stubbed
- [ ] TOP include holds all global TYPES / DATA / CONSTANTS — no program-level DATA in PBO/PAI/FORM includes (FORM/method/module locals are fine; OOP `GO_DATA` / `GO_ALV` live in `{PROG}c` after `DEFERRED`)
- [ ] **Main program contains `INCLUDE` statements for every planned include (NEW — rejects "everything inlined into Main")**: call `GetProgram(main)` and verify the source contains one `INCLUDE {PROG}{SUFFIX}.` line per planned suffix. A Main program where all declarations / forms / modules are inlined is a MAJOR violation of the `common/procedural-sample/main-program.abap` template — event blocks and headers mixed with logic belong in their respective includes.
- [ ] **Procedural paradigm MUST NOT have `{PROG}E` include (NEW)**: `e` is the OOP ALV event-handler include only. If `paradigm = Procedural` in `interview.md` AND `SearchObject({PROG}E)` returns a hit → MAJOR. Event blocks (`INITIALIZATION`, `AT SELECTION-SCREEN`, `START-OF-SELECTION`, `END-OF-SELECTION`) belong in Main body per `include-structure.md`.

### 7. `../../common/naming-conventions.md` — Naming Conventions

Applies to: every created object.

- [ ] Exceptions in `naming-conventions.md` § Exceptions (plugin-owned, harness / `$TMP` prototype, spec-declared, house syntax-guide include) → N/A, not FAIL
- [ ] Z/Y prefix on all custom objects
- [ ] Module prefix in program / table / class names where the convention prescribes (e.g., `ZMM*` for MM, `ZSD*` for SD)
- [ ] Include names are `{PROG}` + suffix letter(s) with no underscore (`{PROG}T`, `{PROG}S`, `{PROG}C`, `{PROG}CT`, …) exactly as in `include-structure.md`
- [ ] Function group / function module / data element / domain naming follows the table in the convention
- [ ] Function Module source follows [`../../common/function-module-rule.md`](../../common/function-module-rule.md) — inline `IMPORTING/EXPORTING/CHANGING/TABLES/EXCEPTIONS` in the `FUNCTION` statement. **Reject if `GetFunctionModule` returns the placeholder `" You can use the template 'functionModuleParameter' to add here the signature!`**, or if spec calls for parameters but none are declared, or if body uses shadow locals (`lv_iv_xxx TYPE ...`) instead of real parameters.

### 8. `../../common/clean-code.md` + paradigm-specific companion — Clean ABAP

**Paradigm gate** — read `Paradigm` from `interview.md`: `OOP` → load [`clean-code-oop.md`](../../common/clean-code-oop.md); `Procedural` → load [`clean-code-procedural.md`](../../common/clean-code-procedural.md). Loading both or the wrong one is MAJOR.

Core (clean-code.md, both paradigms):
- [ ] Main program header block present and complete (Module / Program ID / Tcode / Old Program ID / Title / Description + Change History) — `clean-code-procedural.md` § Mandatory Main Program Header
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
- [ ] **Main program structure matches `../../common/oop-sample/zrsc4sap_oop_ex.prog.abap`** — REPORT statement, INCLUDE order, event block layout, two-class bootstrap (`go_data = NEW #( )` / `go_alv ?= go_data->mo_alv` / `go_data->initialization( )`; `NEW lcl_data( )` with the explicit type is equivalent). Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
- [ ] Members `PRIVATE` where no other class, module or test calls them (see §5); `FINAL` optional
- [ ] Methods do one thing, ≤ 30 lines, single abstraction level, ≤ 3 IMPORTING parameters
- [ ] Methods return one value (`RETURNING` over `EXPORTING`); no boolean input parameters
- [ ] `NEW #( ... )` over `CREATE OBJECT`; multiple static creation methods over optional constructor params
- [ ] Exceptions: class-based only; own project super class; wrap foreign `CX_SY_*`; `RAISE EXCEPTION NEW`
- [ ] Formatting: 120-char line limit, consistent alignment, one statement per line
- [ ] Tests: given-when-then naming, test publics only, inject doubles via constructor, `LOCAL FRIENDS` only for constructor access

Paradigm = Procedural → load `clean-code-procedural.md` and check:
- [ ] **Main program structure matches `../../common/procedural-sample/main-program.abap`** — REPORT statement, INCLUDE order (t/c/s/o/i/a/f — `c` / `a` only when declared), event block layout, PBO/PAI modules as one-line `PERFORM` delegators. Any structural deviation must be justified in `spec.md`; otherwise MAJOR finding.
- [ ] All globals declared in TOP include only; no program-level `DATA` in PBO/PAI/FORM/EVENT includes (FORM-local `DATA` is required, not forbidden)
- [ ] Global / local variables visually distinguishable (`g*` vs `l*` prefix); no local shadows a global
- [ ] FORM parameters typed (`USING p_a TYPE ...`); `USING` for inputs, `CHANGING` for in/out; no boolean `USING`
- [ ] Screen-bound FORMs end with `_{screen_no}` suffix; utility FORMs have no suffix
- [ ] PBO/PAI module bodies are one line (`PERFORM f_...`); logic lives in FORMs, not in modules
- [ ] `sy-subrc` checked after every statement that sets it; `CALL FUNCTION` uses `EXCEPTIONS` clause with `CASE sy-subrc`
- [ ] No `EXIT` / `STOP` / `LEAVE PROGRAM` used as error handling
- [ ] Each FORM has a header comment (≤ 4 lines, as in `clean-code-procedural.md` § Comments) describing inputs / outputs / global side effects
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

## Output File Format + Failure Handling

Split to companion file: [`phase6-output-format.md`](./phase6-output-format.md). Contains the `review.md` template, the violation-fix loop, and the explicit false-positive patterns the reviewer must reject (commented-out flow logic, empty GUI, missing selection texts, inactive includes after "completed" report, Procedural-`E`, inlined Main).
