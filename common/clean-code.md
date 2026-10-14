# Clean ABAP — Shared Baseline (Paradigm-Neutral)

This file lists the Clean ABAP rules that apply regardless of paradigm. Follow every rule unless a project-specific override is documented.

> **Gate rule**: every rule below is subordinate to `common/abap-release-reference.md` — never use syntax newer than the configured `ABAP_RELEASE` in `.sc4sap/config.json`.

> **Paradigm-specific rules live in companion files — load the right one based on the interview's Paradigm dimension (Phase 1B #2)**:
> - **OOP** (`paradigm = OOP`) → load **[`clean-code-oop.md`](clean-code-oop.md)** (classes, objects, constructors, method signatures, class-based exceptions, ABAP Unit with test doubles).
> - **Procedural** (`paradigm = Procedural`) → load **[`clean-code-procedural.md`](clean-code-procedural.md)** (FORM / PERFORM, `USING`/`CHANGING`, TOP-include globals discipline, `EXCEPTIONS` clause on function modules, procedural testing limits).
>
> Load exactly ONE of the two paradigm files per program. Loading both mixes signatures and leads to inconsistent code. The formatting, testing-principles, and comment-detail rules that apply to both paradigms remain in `clean-code-oop.md` (as the more exhaustive companion) — procedural code reviewers treat the OOP file's formatting / testing-principles / comment-detail sections as canonical while skipping the class-scope / constructor / method-call-syntax sections.

## Naming

- Follow [`naming-conventions.md`](naming-conventions.md) for object-level naming (Z/Y prefix, module namespace, includes, function groups, tables, DEs, DOs).
- Variables: descriptive full words, not abbreviations. `lv_order_total`, not `lv_ord_tot`.
- No single-letter variables except loop counters (`i`, `j`) and obvious short scopes.
- Booleans: `is_*` / `has_*` / `should_*` prefix. `lv_is_released`, not `lv_released_flag`.
- Method names are verbs; class names are nouns. `calculate_tax`, `order_processor`.
- Avoid Hungarian for objects and structures (`ls_`, `lt_`, `lo_` are tolerated for locals but discouraged on class members).

## Variables and Types

- **Declare where you use** (ABAP 740+). Use inline declarations (`DATA(x) = ...`, `FIELD-SYMBOLS(<fs>) ASSIGNING ...`) when release allows.
- **Minimize scope**. Locals over globals; method-locals over class attributes when possible.
- **Use typed constants, not magic numbers**. See [`constant-rule.md`](constant-rule.md).
- **Avoid `TYPE STANDARD TABLE WITH EMPTY KEY`** unless you really mean it; prefer `HASHED` / `SORTED` when lookup patterns allow.
- **Never reuse a variable** for a different semantic meaning across a routine.

## Control Flow

- **Early exit / guard clauses**. Return on invalid input first; keep the happy path un-indented.
- **No deeply nested `IF`**. More than 3 levels = extract a method.
- **Prefer `CASE`** over an `IF/ELSEIF` chain on a single variable.
- **Avoid `EXIT` / `CHECK` in the middle of long loops**. Extract instead.
- **No silent `CONTINUE`** — the skip reason must be obvious or commented.

## Conditions and IFs

- **Prefer positive conditions**. `IF lv_is_ready` over `IF NOT lv_is_not_ready`.
- **Prefer `IS NOT` to `NOT IS`**. `IF lv_x IS NOT INITIAL` over `IF NOT lv_x IS INITIAL`.
- **No empty `IF` branches** — if one branch is empty, invert the condition or remove the branch.
- **Decompose complex conditions** — assign each sub-condition to a well-named `lv_is_*` boolean, then combine. Long `IF ... AND ... OR ...` chains are unreadable.
- **Predicative method calls** when the method returns a boolean — `IF is_released( lo_order )` over `IF is_released( lo_order ) = abap_true`.

## Internal Tables

- **Pick the right table type by access pattern**:
  - `HASHED TABLE WITH UNIQUE KEY` — single-value lookups, ≥ a few thousand rows
  - `SORTED TABLE WITH NON-UNIQUE KEY` — range reads / ordered iteration
  - `STANDARD TABLE` — sequential processing only, no random access
- **Avoid `DEFAULT KEY`** — implicit and inefficient. Declare the key explicitly or use a sorted/hashed type.
- **Prefer `INSERT INTO TABLE`** to `APPEND TO` when the table is sorted/hashed. `APPEND` on a sorted table errors at runtime; on a hashed table it is rejected.
- **Prefer `LINE_EXISTS( )`** to `READ TABLE ... TRANSPORTING NO FIELDS` or `LOOP AT ... ENDLOOP` just to detect presence.
- **Prefer `READ TABLE ... WITH KEY` + `ASSIGNING <fs>`** over `INTO ls_` when only inspecting the row.
- **Prefer `LOOP AT lt WHERE ...`** to a `LOOP AT` + inner `IF` filter — SAP evaluates `WHERE` with the key when possible.
- **Secondary keys** — see the large-table rule under `## Open SQL` below.

## Strings

- **Use backticks** `` `literal` `` for string literals, not single quotes `'literal'`. Single quotes create fixed-length `C` types and silently trim trailing spaces; backticks create proper `STRING` values.
- **Use string templates** `|text { lv_var } more|` for assembly. Avoid `CONCATENATE lv_a lv_b INTO lv_s` chains — the template is shorter and preserves explicit formatting (`|{ lv_amount NUMBER = USER }|`).
- **One translatable literal per text element** — see [`text-element-rule.md`](text-element-rule.md). Never embed only-literal text in a template when the string is user-visible.

## Booleans

- **Type**: declare boolean variables as `ABAP_BOOL`, not `CHAR1` / `C(1)`.
- **Compare against** `abap_true` / `abap_false` / `abap_undefined` — never `'X'` / `' '` / `''`.
- **Set** via `XSDBOOL( condition )` instead of `IF ... lv_b = abap_true. ELSE. lv_b = abap_false. ENDIF.`
- **Prefer enumeration types** (`ENUM STRUCTURE` or constants cluster) over a boolean when the concept has more than two states — "is_released" + "is_blocked" + "is_draft" should be one status enum, not three booleans.

## Expressions and Constructors (ABAP 740+)

- **Prefer `NEW`** over `CREATE OBJECT`.
- **Prefer `VALUE #( ... )`** and `CORRESPONDING #( ... )` over `MOVE-CORRESPONDING` / explicit field-by-field copies.
- **Use `COND #( ... )` / `SWITCH #( ... )`** instead of temp-variable IF trees.
- **Use `REDUCE`/`FOR` table-expressions** for small transformations; fall back to `LOOP` for complex logic.
- **Table expressions `table[ key = ... ]`** over `READ TABLE ... INTO`. Catch `CX_SY_ITAB_LINE_NOT_FOUND`.

## Exception / Error Handling (paradigm-neutral part)

- **Always act on errors** — catch what you can handle, propagate what you cannot. Never silently swallow.
- **Preserve the cause** — always include the original exception / `sy-subrc` value in any escalated error.
- **Never swallow runtime exceptions** (`CX_SY_*`) unless the recovery path is explicit and documented.
- Paradigm-specific details:
  - OOP: class-based exceptions, `RAISE EXCEPTION NEW`, `CX_STATIC_CHECK` vs `CX_NO_CHECK` vs `CX_DYNAMIC_CHECK` — see [`clean-code-oop.md`](clean-code-oop.md) § Error Handling.
  - Procedural: `sy-subrc` check after each statement, `EXCEPTIONS` clause on `CALL FUNCTION`, `MESSAGE ... RAISING` for FM errors — see [`clean-code-procedural.md`](clean-code-procedural.md) § Error Handling.

## Open SQL

- **No `SELECT *`**. Always list the fields you need. Exception: `GetTable` schema probe (never for business reads).
- **Prefer explicit typed internal tables over inline `INTO TABLE @DATA(...)` declarations in SELECT** — declare the row `TYPES` + table variable at the top of the local FORM / method, then use `INTO CORRESPONDING FIELDS OF TABLE @<var>` (or `APPENDING CORRESPONDING FIELDS OF TABLE @<var>` when accumulating across multiple SELECTs). Rationale: the typed structure is reused across the FORM/method, DDIC alignment is explicit, the itab's field catalog is traceable for SALV and for QA review, and multi-SELECT accumulation flows cleanly with `APPENDING` without allocating throwaway inline tables each round. Inline `INTO TABLE @DATA(...)` is acceptable **only** for one-shot local helpers (lookup helper with single SELECT whose result never leaves the method and never feeds another SELECT).
- **Secondary keys on internal tables that receive large-table SELECT results** — when the SELECT source is a transactional / high-volume table (VBRK, VBAP, BKPF, BSEG, EKKO, EKPO, ACDOCA, MATDOC, LIPS, MKPF, MSEG, etc.) AND the resulting internal table is subsequently accessed by `READ TABLE` / `LOOP ... WHERE` on a non-primary-key column, declare a `SECONDARY KEY` on that itab. Pattern:
  ```abap
  DATA: lt_vbap TYPE SORTED TABLE OF ty_vbap_row
                WITH NON-UNIQUE KEY vbeln
                WITH NON-UNIQUE SORTED KEY k_matnr COMPONENTS matnr.
  " ...
  READ TABLE lt_vbap WITH KEY k_matnr COMPONENTS matnr = lv_mat
                     ASSIGNING <ls_vbap>.
  LOOP AT lt_vbap USING KEY k_matnr WHERE matnr = lv_mat ...
  ```
  Choose `SORTED` vs `HASHED` by access pattern (range → SORTED; equality-only → HASHED). Do NOT blanket-apply secondary keys on small config/master itabs — they add memory overhead and make sense only when the lookup hotspot is measurable. This rule does NOT apply to small tables (T001, T001W, KNA1/LFA1 cached singletons, SPRO config tables). Record the rationale in a one-line comment next to the secondary key declaration when the itab size is borderline (< 100k but frequently accessed).
- **Use CDS views** for any reusable read logic (ABAP 750+). See `configs/{MODULE}/` for module-standard views.
- **Never `SELECT` inside a `LOOP`** — use `FOR ALL ENTRIES IN` or a join.
- **Always check `sy-subrc`** or catch the class-based equivalent (`CX_SY_OPEN_SQL_DB`).
- **Filter and aggregate server-side**. No `LOOP ... WHERE ... DELETE` to post-filter.
- **Large transactional tables — mandatory pre-count**: before a SELECT on a transactional table (VBRK, VBAP, BKPF, BSEG, EKKO, EKPO, ACDOCA, MATDOC, LIPS, MKPF, MSEG, WBCROSSGT and equivalents), first run `SELECT COUNT(*) FROM <table> WHERE <same predicate>` to size the result set. If the count exceeds **1,000,000 rows**, do NOT run the main SELECT as-is — apply at least one of the following tuning measures before proceeding:
  - tighten the `WHERE` predicate (add mandatory date/org unit filter) and re-count
  - confirm an index covers the predicate (`DB02` / `ST05` during development, or the table's secondary index list via `GetTable`)
  - switch to **package iteration**: `SELECT ... PACKAGE SIZE n` with chunked processing, or `OPEN CURSOR` + `FETCH NEXT CURSOR`
  - parallelize via `aRFC` / `bgRFC` on independent key ranges
  - push filtering/aggregation to a CDS view with the matching annotations (`@Analytics`, `@ClientHandling`, buffer hints) so only aggregates hit the ABAP layer
  - reject row-level extraction and switch to aggregated output (SUM / GROUP BY)
  
  Record the count and the chosen tuning measure in `spec.md` / `plan.md` when Phase 2 detects the risk, and in the Phase 6 review notes when confirmed.
- **Blocked tables**: before any `GetTableContents` / `GetSqlQuery`, consult [`data-extraction-policy.md`](data-extraction-policy.md) and `exceptions/table_exception.md`.

## Modularization (paradigm-neutral part)

- **One unit does one thing.** Whether the unit is a method, a FORM, or a function module, it should have a single purpose that the name captures.
- **Length limit** — default under ~30 lines; extract when it grows.
- **Parameter count** — aim for ≤ 3 inputs. Beyond that, pass a structure.
- **Respect include structure**: see [`include-structure.md`](include-structure.md).
- Paradigm-specific guidance:
  - OOP methods / classes / constructors — see [`clean-code-oop.md`](clean-code-oop.md) § Methods and § OOP.
  - Procedural FORM / PERFORM / FM — see [`clean-code-procedural.md`](clean-code-procedural.md) § Modularization and [`procedural-form-naming.md`](procedural-form-naming.md).

## Text and User Interaction

- **All user-visible text via Text Elements**. See [`text-element-rule.md`](text-element-rule.md).
- **No hardcoded language literals** in logic — use text symbols (`TEXT-001`), message classes (`MESSAGE e001(z_msg)`), or OTR.
- **ALV output follows** [`alv-rules.md`](alv-rules.md) (field catalog, events, layout).

## Comments

- **Default: no comments.** Clean naming and short methods explain themselves.
- **Write a comment only for the WHY** — a hidden invariant, a workaround for a specific SAP Note, a constraint from a domain expert. Never the WHAT.
- **No comment banners, author tags, or change logs** — except the mandatory main-program header (see [`clean-code-procedural.md`](clean-code-procedural.md) § Mandatory Main Program Header), which is the only place for them. Git/Transport stays the detailed audit trail.
- **Delete commented-out code** — don't check it in.

## Testing (paradigm-neutral principles)

- **Tests exist for non-trivial logic** — every calculation, every branching decision, every integration edge.
- **Test the public contract**, not private internals.
- **One concept per test** when practical; descriptive test names: `is_released_returns_true_when_status_is_X`.
- **Each commit's tests pass** — `RunUnitTest` via MCP before release.
- Paradigm-specific test patterns:
  - OOP — ABAP Unit `LOCAL CLASS ... FOR TESTING`, `CL_ABAP_TESTDOUBLE`, `LOCAL FRIENDS` only for constructor access — see [`clean-code-oop.md`](clean-code-oop.md) § Testing.
  - Procedural — FORM testing limits (hard to mock globals); recommend extracting testable logic into a helper class tested separately — see [`clean-code-procedural.md`](clean-code-procedural.md) § Testing.

## Performance

- **Measure, don't guess**. Use `RuntimeRunClassWithProfiling` / `RuntimeAnalyzeProfilerTrace`.
- **Server-side work beats client-side**. Filter/aggregate/sort in Open SQL or CDS; bring back only what you need.
- **Avoid nested SELECTs / nested loops over large itabs**. Use `FOR ALL ENTRIES`, joins, or hashed lookups.
- **Parallelization**: `aRFC` / `bgRFC` for independent chunks when the operation supports it.
- **Avoid buffer-busting patterns** — `SELECT ... BYPASSING BUFFER` is a last resort.

## Security and Data Handling

- **Authorization checks at every entry point** (`AUTHORITY-CHECK` before read/write of restricted data).
- **No SQL injection**: never concatenate user input into `EXEC SQL` or dynamic `WHERE`. Use parameter markers.
- **Mask/skip PII in logs, dumps, and error messages.** PII categories in `exceptions/*.md`.
- **Data extraction rules are hard rules** — see [`data-extraction-policy.md`](data-extraction-policy.md). `acknowledge_risk` requires explicit user affirmative (`yes` / `authorize` / `approve` / `proceed` / `confirmed`). Never auto-set.

## Version Awareness

- Configured `SAP_VERSION` (`S4` vs `ECC`) and `ABAP_RELEASE` are the gate for every generated code snippet. Check [`sap-version-reference.md`](sap-version-reference.md) and [`abap-release-reference.md`](abap-release-reference.md).
- In S/4HANA: use Business Partner (BP), not `XD01`/`XK01`. Use `ACDOCA` / `MATDOC` / CDS views, not classic cluster tables.
- Before suggesting a feature (inline decl, RAP, CDS behavior def, Open SQL expressions), verify the minimum release.

## Review Checklist (agent self-check before handing off)

1. All names pass [`naming-conventions.md`](naming-conventions.md).
2. No `SELECT *`; no hardcoded magic literals.
3. Methods short, one responsibility, ≤ 3 params.
4. Every exception is caught by a handler that does something, or rethrown.
5. Text Elements used; no language literals in output.
6. `RunUnitTest` and `GetAbapSemanticAnalysis` both green; `GetInactiveObjects` empty.
7. Syntax matches the configured `ABAP_RELEASE`.
8. Blocklist / `acknowledge_risk` rules respected in any `GetTableContents` / `GetSqlQuery` invocation.
