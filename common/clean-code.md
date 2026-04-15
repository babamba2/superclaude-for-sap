# Clean ABAP — sc4sap Coding Standards

Condensed Clean ABAP rules for sc4sap. Follow every rule unless a project-specific override is documented. Based on [SAP's Clean ABAP guide](https://github.com/SAP/styleguides/blob/main/clean-abap/CleanABAP.md) with sc4sap-specific priorities.

> **Gate rule**: every rule below is subordinate to `common/abap-release-reference.md` — never use syntax newer than the configured `ABAP_RELEASE` in `.sc4sap/config.json`.

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

## Expressions and Constructors (ABAP 740+)

- **Prefer `NEW`** over `CREATE OBJECT`.
- **Prefer `VALUE #( ... )`** and `CORRESPONDING #( ... )` over `MOVE-CORRESPONDING` / explicit field-by-field copies.
- **Use `COND #( ... )` / `SWITCH #( ... )`** instead of temp-variable IF trees.
- **Use `REDUCE`/`FOR` table-expressions** for small transformations; fall back to `LOOP` for complex logic.
- **Table expressions `table[ key = ... ]`** over `READ TABLE ... INTO`. Catch `CX_SY_ITAB_LINE_NOT_FOUND`.

## Exception Handling

- **Always catch what you can handle, rethrow what you cannot.** Never empty-catch (`CATCH cx_root INTO lx. ENDCATCH.`).
- **Class-based exceptions only** (`CX_*`). Avoid `MESSAGE ... TYPE 'E'` mid-flow — raise, don't abort.
- **Custom exceptions extend `CX_STATIC_CHECK`** for business errors, `CX_NO_CHECK` only for truly unrecoverable conditions.
- **Preserve the stack**: `RAISE EXCEPTION TYPE ... PREVIOUS = lx_prev.`
- **Never swallow runtime exceptions** (`CX_SY_*`) unless the recovery path is explicit and documented.

## Open SQL

- **No `SELECT *`**. Always list the fields you need. Exception: `GetTable` schema probe (never for business reads).
- **No `INTO CORRESPONDING FIELDS OF`** without an explicit field list. Prefer explicit SELECT with inline `DATA(@lt_result)`.
- **Use CDS views** for any reusable read logic (ABAP 750+). See `configs/{MODULE}/` for module-standard views.
- **Never `SELECT` inside a `LOOP`** — use `FOR ALL ENTRIES IN` or a join.
- **Always check `sy-subrc`** or catch the class-based equivalent (`CX_SY_OPEN_SQL_DB`).
- **Filter and aggregate server-side**. No `LOOP ... WHERE ... DELETE` to post-filter.
- **Blocked tables**: before any `GetTableContents` / `GetSqlQuery`, consult [`data-extraction-policy.md`](data-extraction-policy.md) and `exceptions/table_exception.md`.

## Modularization

- **A method does one thing.** Single level of abstraction inside the body.
- **Method length**: under ~30 lines as a default; extract when it grows.
- **Parameter count**: ≤ 3 importing/exporting; beyond that, pass a structure.
- **No output parameters masquerading as importing** — use `CHANGING` deliberately, `EXPORTING` for returns (or functional methods returning `RETURNING`).
- **Functional methods return one value**; no side effects. Side-effecting methods return nothing.
- **Respect include structure**: see [`include-structure.md`](include-structure.md) and [`procedural-form-naming.md`](procedural-form-naming.md).
- **OOP two-class split**: see [`oop-pattern.md`](oop-pattern.md) for separation of concerns.

## Text and User Interaction

- **All user-visible text via Text Elements**. See [`text-element-rule.md`](text-element-rule.md).
- **No hardcoded language literals** in logic — use text symbols (`TEXT-001`), message classes (`MESSAGE e001(z_msg)`), or OTR.
- **ALV output follows** [`alv-rules.md`](alv-rules.md) (field catalog, events, layout).

## Comments

- **Default: no comments.** Clean naming and short methods explain themselves.
- **Write a comment only for the WHY** — a hidden invariant, a workaround for a specific SAP Note, a constraint from a domain expert. Never the WHAT.
- **No comment banners, author tags, or change logs.** Git/Transport is the audit trail.
- **Delete commented-out code** — don't check it in.

## Testing

- **Write ABAP Unit tests** (`LOCAL CLASS ... FOR TESTING`) for every custom class with non-trivial logic.
- **Test the public contract**, not private internals.
- **One assert per test** when practical; descriptive test-method names: `is_released_returns_true_when_status_is_X`.
- **Use test doubles** (`CL_ABAP_TESTDOUBLE`) instead of real DB hits.
- **Each commit's tests pass** — `RunUnitTest` via MCP before release.

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
