# Clean ABAP — OOP Paradigm

Clean ABAP rules specific to the **OOP paradigm** — local classes (`LCL_DATA` / `LCL_ALV`) inside a REPORT, global classes, interfaces, exception classes, ABAP Unit with test doubles. Load this file when the Phase 1B interview picks `paradigm = OOP` (and NOT when it picks `Procedural`). Companion to [`clean-code.md`](clean-code.md) (paradigm-neutral shared baseline). Everything here is gated by `abap-release-reference.md`.

> Paired with the sc4sap OOP pattern file [`oop-pattern.md`](oop-pattern.md) — that file defines the two-class split (LCL_DATA + LCL_ALV / LCL_SCREEN); this file defines the coding style rules that fill the class bodies.

## Mandatory Main Program Template (MUST match)

When generating an OOP program's main `REPORT` source, the executor MUST start from and conform to the canonical sample:

**Source of truth**: [`oop-sample/zrsc4sap_oop_ex.prog.abap`](oop-sample/zrsc4sap_oop_ex.prog.abap) (companion includes: `zrsc4sap_oop_ext/exs/exc/exct/exe/exo/exi.prog.abap`, screens `zrsc4sap_oop_ex.prog.screen_0100.abap` / `_0200.abap`).

- **Do**: copy the skeleton (REPORT statement, INCLUDE order, INITIALIZATION / AT SELECTION-SCREEN / START-OF-SELECTION / END-OF-SELECTION blocks, class bootstrap pattern `go_data = NEW #( ).` / `go_alv ?= go_data->mo_alv.` / `go_data->initialization( ).` — globals declared in `{PROG}c` after `DEFERRED`, no inline `DATA( )` in event blocks), then adapt identifiers (`zrsc4sap_oop_ex` → actual program name, include suffix letters preserved).
- **Do not**: rearrange the event blocks, skip the two-class bootstrap, inline logic into events (all logic lives in class methods), replace Docking + Full ALV with Custom Control, or substitute a different include-suffix convention.
- **Deviation requires written justification in `spec.md`** before the executor runs Phase 4. Undocumented structural drift from the template is a MAJOR finding in Phase 6 review.

## OOP-Specific Error Handling

- **Class-based exceptions only** (`CX_*`). No `MESSAGE ... TYPE 'E'` mid-flow as a substitute for an exception.
- **Own project super class** — create `ZCX_{MODULE}_ERROR` as the base; sub-class for specific situations. Callers catch the base and filter when they care.
- **Choose the right base**:
  - `CX_STATIC_CHECK` — caller is expected to handle (most business errors). Compiler enforces the declaration.
  - `CX_DYNAMIC_CHECK` — avoidable if input is validated (e.g., conversion errors). Caller may catch or preempt.
  - `CX_NO_CHECK` — truly unrecoverable; the caller cannot sensibly handle it. Use for assertions / programming errors.
- **Prefer `RAISE EXCEPTION NEW zcx_x( ... )`** to `RAISE EXCEPTION TYPE zcx_x EXPORTING ...`.
- **Preserve the stack** — pass `PREVIOUS = lx_prev` when wrapping.
- **Wrap foreign exceptions** — never let `CX_SY_*` bubble through a public API. Catch, wrap in your own `ZCX_*`, and rethrow.

## OOP-Specific Modularization

- **Method length** under ~30 lines; the class is the unit of composition, not the file.
- **Parameter count** ≤ 3 IMPORTING; beyond that, pass a DDIC structure or split the method.
- **No output parameters masquerading as input** — use `CHANGING` deliberately; prefer `RETURNING` for functional methods, `EXPORTING` only when multi-value return is unavoidable.
- **Functional methods return one value, no side effects.** Side-effecting methods return nothing.
- **OOP two-class split** (sc4sap convention) — `LCL_DATA` for business logic / BAPI I/O, `LCL_ALV` or `LCL_SCREEN` for presentation. See [`oop-pattern.md`](oop-pattern.md).

## Object Orientation — Scope and Design

- **Prefer objects to static classes**. Static classes encourage hidden global state; instances make dependencies explicit.
- **Prefer composition to inheritance**. Inheritance couples child to parent layout; composition accepts a collaborator via constructor / setter.
- **Don't mix stateful and stateless** in the same class. Stateless services (pure computation) belong in a separate class from stateful aggregates.
- **FINAL is allowed, not required.** Report-local classes may stay non-final (house OOP programs inherit `LCL_ALV` from a framework ALV base class). The reviewer does not flag a missing `FINAL`.
- **PRIVATE by default**. Members are PRIVATE; promote to PROTECTED / PUBLIC only when there is a demonstrated need. Being called from the test class, a PBO/PAI module, an event handler or the main event blocks is a demonstrated need.
- **READ-ONLY sparingly**. A public `READ-ONLY` attribute exposes state; prefer a getter method that returns a computed value.
- **Immutable over getter** when the value cannot change after construction — public `READ-ONLY` on a constructor-assigned attribute is cleaner than a trivial getter.
- **Instance over static methods** — static methods are awkward to mock and encode a design that resists evolution.
- **Public instance methods should be part of an interface**. Classes implement interfaces; callers depend on interfaces, not concrete classes.

## Constructors

- **Prefer `NEW #( ... )`** to `CREATE OBJECT lo_x EXPORTING ...`. Exception: `CREATE OBJECT … TYPE ('LCL_EVENT_ALV')` for the event receiver created by name (`oop-pattern.md` § Event Wiring) — `NEW` has no dynamic type.
- **Global `CREATE PRIVATE` classes still have a public CONSTRUCTOR** — constructor visibility is PUBLIC even when instantiation is restricted; use static factory methods to gate creation.
- **Multiple static creation methods over optional parameters**. `zcl_order=>create_from_vbeln( )` + `zcl_order=>create_from_posnr( )` is clearer than a single constructor with `OPTIONAL` parameters and branching logic.
- **Descriptive creation method names** — `build_`, `from_`, `copy_of_`. Never `create_1`, `create_2`.
- **Singletons only when multiple instances are genuinely impossible** — usually the desire for a singleton signals a missing factory or dependency-injection point.

## Methods — Parameters and Calls

- **Aim for fewer than 3 IMPORTING parameters**. Beyond that, pass a structure or split the method.
- **No `OPTIONAL` parameter just to shorten signatures** — split into two methods with clear names.
- **Prefer `RETURNING` to `EXPORTING`**. RETURNING enables functional-style calls (`lv_x = get_x( )`) and table expressions.
- **Return or export exactly one value**. A method that exports three things is doing three things.
- **Use `CHANGING` sparingly** — it blurs import vs export. Reserved for cases where the parameter's identity matters (e.g., mutating an existing internal table).
- **No boolean input parameter** — `process( iv_force = abap_true )` should be `force_process( )` as a separate method. Boolean inputs almost always signal two hidden methods merged into one.
- **RETURNING large tables is fine** — do not pre-optimize around the misconception that RETURNING copies the whole table. ABAP uses reference semantics internally for large tables.
- **Call style — omit noise**:
  - Omit `RECEIVING` — `lv_x = f( )`, not `CALL METHOD f RECEIVING x = lv_x`.
  - Omit `EXPORTING` keyword when it is the only parameter-kind used.
  - Omit the parameter name on single-parameter calls — `f( lv_a )`, not `f( iv_a = lv_a )`.
  - Omit `me->` when calling instance members of the current object.
- **Consider calling the `RETURNING` parameter `RESULT`** for neutrality — especially in generic utility classes.

## Method Body

- **Do one thing, do it well, do it only.** A method's name should be a complete description of what it does.
- **Descend one level of abstraction.** The body operates one level below the method name. If the body jumps levels (mixes high-level workflow with low-level SQL), extract.
- **Keep methods small** — under ~30 lines as a default. If a method grows, it is doing more than one thing.
- **Focus on the happy path OR error handling, not both.** One method handles errors (top), another executes the happy path (extracted).

## Error Handling — Detail

- **Exceptions are for errors, not for ordinary control flow.** "Not found" on an optional lookup is not an exception; "row missing from a required foreign key" is.
- **Class-based exceptions only** (`CX_*`). Message-and-exit inline is a flow abort, not error handling.
- **Own super class** — create a project-local base exception (e.g., `ZCX_SD_ERROR`) with sub-classes for specific situations. Catch the base class at workflow boundaries.
- **Throw one type per method**, distinguished by sub-class — callers catch the base class and then filter when they actually care.
- **Choose the right base**:
  - `CX_STATIC_CHECK` — caller is expected to handle (most business errors). Compiler enforces the declaration.
  - `CX_DYNAMIC_CHECK` — avoidable if input is validated (e.g., conversion errors). Caller may catch or preempt.
  - `CX_NO_CHECK` — truly unrecoverable; the caller cannot sensibly handle it. Use for assertions / programming errors.
- **Prefer `RAISE EXCEPTION NEW zcx_x( ... )`** to `RAISE EXCEPTION TYPE zcx_x EXPORTING ...`.
- **Preserve the stack** — pass `PREVIOUS = lx_prev` when wrapping.
- **Wrap foreign exceptions** — never let an `CX_SY_*` bubble through a public API. Catch, wrap into your own `ZCX_*`, and rethrow.
- **Don't swallow** (`CATCH ... ENDCATCH` with nothing in between). If truly ignoring, add a one-line comment with the reason.

## Formatting

- **Be consistent within a project** — match the existing style over "what I learned last".
- **Optimize for reading**, not for writing. The code is read 10× more than it is written.
- **Use the project's Pretty Printer / ABAP Formatter settings** (configured in `.abap_formatter` when present).
- **One statement per line** — no `.` chains on one line.
- **Reasonable line length** — wrap around 120 characters. Avoid horizontal scrolling.
- **Blank lines separate thoughts** — add one blank line between groups of related statements. Do not pad every single statement with blank lines.
- **Align assignments to the same target**, not across different targets:
  ```abap
  " Yes:
  ls_order-vbeln = lv_vbeln.
  ls_order-posnr = lv_posnr.
  ls_order-matnr = lv_matnr.
  ```
- **Close brackets at line end** — ` ... )` at end of line, not on its own line.
- **Parameter line breaks** — if a call does not fit on one line, indent parameters under the method name:
  ```abap
  lo_service->process(
    iv_order = lv_vbeln
    iv_item  = lv_posnr
    iv_plant = lv_werks ).
  ```
- **Indent inline declarations** like regular parameters — `DATA(lv_x)` aligns with the others.
- **Don't align `TYPE` clauses** across unrelated DATA statements — it creates maintenance friction when one row's type grows.
- **No assignment chaining** — `lv_a = lv_b = 0.` is compact but harder to read and debug.

## Testing — Detail

- **`{PROG}ct` always exists** for an OOP program: `LCL_TEST … FOR TESTING RISK LEVEL HARMLESS DURATION SHORT` (+ optional `LTC_*`). Testing scope `none` → Phase 5 is skipped, but Phase 4 still writes one smoke test of a pure `LCL_DATA` method (no DB writes, no screen).

- **Test publics, not private internals**. Private members are implementation; refactoring them must not break tests.
- **Don't obsess about coverage** — 100% line coverage can coexist with meaningless asserts. Prefer focused tests on critical paths.
- **Name tests for given-when-then** — `is_released_returns_true_when_status_is_freigegeben`, not `test01` / `test_ok`.
- **One `when` per test method** — one action, one set of assertions.
- **Don't add `TEARDOWN`** unless genuinely needed — `SETUP` usually creates fresh state each method.
- **Code Under Test naming** — name a local `cut` reference to the object being tested. Default to `cut` when no better name exists.
- **Test against interfaces** — the test creates a concrete instance, but the reference type is the interface.
- **Extract the call to CUT** to its own helper method (`when_called_with` / `act`) so the given/when/then structure reads like prose.
- **Dependency inversion + test doubles** — accept collaborators via constructor; inject `CL_ABAP_TESTDOUBLE` instances in tests. No `SELECT` in unit tests.
- **`LOCAL FRIENDS`** only for test-constructor access — never to reach into private methods from tests.
- **No production hooks purely for testing** — if a method exists only so a test can poke it, rework the design.
- **Assertions**:
  - Few, focused (1–3 per method).
  - Right type — `assert_equals` for values, `assert_bound` / `assert_not_bound` for references, `assert_true` for `ABAP_BOOL` only.
  - Assert on content (the value that matters), not on quantity (just checking a counter).
  - `CL_ABAP_UNIT_ASSERT=>fail( ... )` inside a `CATCH` block to assert an expected exception was thrown.
  - Forward unexpected exceptions — don't `CATCH cx_root` + `fail( )` blindly; let the test framework show the actual cause.

## Comments — Detail (beyond main file)

- **Before the statement, not after** — block comment sits above the statement it explains; no trailing `"…` comments that explain what the line just did.
- **No manual versioning** — `" 2024-03-15 ABC: added field` belongs in the transport description.
- **Use `" FIXME:` / `" TODO:` / `" XXX:`** with your user ID for tracked in-code markers; they show up in ADT search.
- **No method signature / end-of-method comments** — `" method begin` / `" end of process_order` pollute the file.
- **No text-symbol duplication as comment** — the text element itself is the documentation.
- **ABAP Doc only for public APIs** — private helpers get no ABAP Doc; their name is the doc.
- **Prefer pragmas `##NEEDED` / `##NO_TEXT`** to pseudo-comments `"#EC` when the release supports them.
