# ABAP Release Reference

Syntax feature inventory by ABAP release. Agents MUST NOT emit features newer than the configured `ABAP_RELEASE` in `.sc4sap/config.json` (or `sap.env`) — doing so causes activation failures on the target system.

If `ABAP_RELEASE` is unset, fail safe: ask the user to run `/sc4sap:setup` or `/sc4sap:sap-option` before generating code. On `740`, also read `abapSp` (SAP_BASIS support package, profile `config.json` → `abapSp`, captured by setup step 2b) — see § 1a.

---

## 1. Feature Matrix

| Release | Key Syntax Features |
|---------|---------------------|
| 702 (7.02) | `READ TABLE ... ASSIGNING FIELD-SYMBOL(<fs>)` not yet available |
| 740 | Inline declarations (`DATA(lv_x)`, `FIELD-SYMBOL(<fs>)`), constructor expressions (`NEW`, `VALUE`, `CORRESPONDING`, `CONV`, `CAST`, `REF`, `EXACT`, `COND`, `SWITCH`), table expressions (`itab[ key ]`), string templates (`\|{ var }\|`), chained method calls |
| 740 SP05 | Strict Open SQL: comma-separated field lists, `@` host variables, `INTO @DATA(...)`, first SQL expressions (CASE, COALESCE, arithmetic); meshes, `CORRESPONDING` for deep structures |
| 740 SP08 | `FOR` expressions in VALUE/NEW/REDUCE, `REDUCE`, `FILTER`, `LET`, `LOOP AT … GROUP BY`, more SQL expressions |
| 750 | More Open SQL expressions (`CAST`, string functions, `UNION`), CDS view annotations, ABAP Channels (AMC/APC), `RANGES` via `VALUE FOR` |
| 751 | CDS view extensions, virtual elements in CDS, `ENUM` types |
| 752 | CDS access control (DCL), CDS metadata extensions (DDLX), `CORRESPONDING` with mapping, virtual sorting of itab |
| 753 | ABAP CDS table functions (AMDP), released APIs (whitelist), `READ ENTITIES` (RAP preview), ABAP unit test `CL_ABAP_TESTDOUBLE` enhancements |
| 754 | **ABAP RESTful Application Programming (RAP)** — behavior definitions, EML (`MODIFY ENTITIES`, `READ ENTITIES`), `UTCLONG` |
| 755 | RAP managed/unmanaged scenarios, draft handling, ABAP SQL `LITERAL`, `@Environment.systemField` in CDS, virtual elements with managed calculations |
| 756 | **ABAP Cloud Development Model**, tier-1/tier-2 APIs, local ABAP types in ABAP SQL, `ABAP_BOOL`→`ABAP_BOOLEAN`, stricter CDS syntax |
| 757 | RAP side effects, ABAP SQL `CROSS JOIN`, `INNER/LEFT OUTER MANY TO MANY`, privileged mode in RAP, immutable inline declaration `FINAL(x) = …` |
| 758 | ABAP SQL `REPLACE`, `INITCAP`, new aggregate functions, RAP late numbering, background processing in RAP |

`CLASS … FINAL` / `METHODS … FINAL` are classic ABAP Objects syntax, valid on every supported release.

### 1a. 7.40 support-package gates

| Feature | Minimum |
|---|---|
| Comma field lists, `@` host variables, `INTO @DATA(...)`, SQL CASE / COALESCE / arithmetic (first set) | 740 SP05 |
| `FOR` / `REDUCE` / `FILTER`, `LOOP AT … GROUP BY`, more SQL expressions | 740 SP08 |

If `abapRelease = 740` and `abapSp` is unset or < `05`: emit classic Open SQL (no `@`, space-separated field list) and record "SP unknown — classic SQL" in `spec.md`. `abapSp` < `08`: no `FOR` / `REDUCE` / `FILTER` / `GROUP BY` loops. From 750 on, use the strict syntax.

---

## 2. Examples by Feature

Concrete before/after code examples for each release feature live in the companion file **[abap-release-examples.md](abap-release-examples.md)** (subsections 2.1 – 2.9). Consult it when choosing between modern and legacy idioms for a given `ABAP_RELEASE`.

---

## 3. Decision Rules for Code Generation

| Target release | Use | Avoid |
|----------------|-----|-------|
| `< 740` | `DATA` declarations up front, `CREATE OBJECT`, `MOVE-CORRESPONDING`, classic `READ TABLE` | Any inline declaration or constructor expression |
| `= 740 … 749` | Inline declarations, `VALUE`/`NEW`/`CORRESPONDING`, table expressions, string templates; strict Open SQL from SP05, `FOR`/`FILTER`/`REDUCE` from SP08 (§ 1a) | Strict Open SQL when `abapSp` unset or < 05; `FOR`/`FILTER` below SP08; RAP |
| `= 750 … 753` | All of above + Open SQL expressions, CDS views, `GROUP BY` on itab | RAP/EML, `FINAL( )` declaration operator (757+) |
| `= 754 … 755` | All of above + RAP (managed/unmanaged), EML | ABAP Cloud-only restrictions, `FINAL( )` declaration operator (757+) |
| `≥ 756` on-prem | Full modern syntax | — |
| `≥ 756` cloud (ABAP Cloud) | Only released APIs, CDS, and BAdIs (C1 tier) | Any unreleased table/FM/BAPI |

Always prefer the most modern syntax allowed by the target release. Do not downgrade working modern code for stylistic reasons.

---

## 4. Checklist Before Emitting ABAP

1. Did I read `ABAP_RELEASE` from config? If no → stop and ask the user.
2. Is any feature I'm about to emit newer than `ABAP_RELEASE`? If yes → rewrite to the older idiom in [abap-release-examples.md](abap-release-examples.md).
3. Is `SAP_SYSTEM_TYPE=cloud`? If yes → every `SELECT`/`CALL FUNCTION`/`CALL METHOD` must target a **released** API (check `GetPackage` or released annotations).
4. Did I add a `TRY...CATCH` around operations that raise class-based exceptions? (RAP, CDS read, reference conversion.)
5. Did I avoid `SELECT *` in favor of named fields?
