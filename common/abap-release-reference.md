# ABAP Release Reference

Syntax feature inventory by ABAP release. Agents MUST NOT emit features newer than the configured `ABAP_RELEASE` in `.sc4sap/config.json` (or `sap.env`) — doing so causes activation failures on the target system.

If `ABAP_RELEASE` is unset, fail safe: ask the user to run `/sc4sap:setup` or `/sc4sap:sap-option` before generating code.

---

## 1. Feature Matrix

| Release | Key Syntax Features |
|---------|---------------------|
| 702 (7.02) | `READ TABLE ... ASSIGNING FIELD-SYMBOL(<fs>)` not yet available |
| 740 | Inline declarations (`DATA(lv_x)`, `FIELD-SYMBOL(<fs>)`), constructor expressions (`NEW`, `VALUE`, `CORRESPONDING`, `CONV`, `CAST`, `REF`, `EXACT`, `COND`, `SWITCH`), table expressions (`itab[ key ]`), string templates (`\|{ var }\|`), chained method calls |
| 741 | `FOR` expressions in VALUE/REDUCE, `FILTER`, meshes, `MOVE-CORRESPONDING` for deep structures, `ASSERT` with boolean expressions |
| 750 | Open SQL expressions (CASE, CAST, COALESCE in SELECT), CDS view annotations, ABAP Channels (AMC/APC), `RANGES` via `VALUE FOR` |
| 751 | CDS view extensions, virtual elements in CDS, `ENUM` types, `GROUP BY` in internal tables, `LOOP AT ... GROUP BY` |
| 752 | CDS access control (DCL), CDS metadata extensions (DDLX), `CORRESPONDING` with mapping, virtual sorting of itab |
| 753 | ABAP CDS table functions (AMDP), released APIs (whitelist), `READ ENTITIES` (RAP preview), ABAP unit test `CL_ABAP_TESTDOUBLE` enhancements |
| 754 | **ABAP RESTful Application Programming (RAP)** — behavior definitions, EML (`MODIFY ENTITIES`, `READ ENTITIES`), `FINAL` classes |
| 755 | RAP managed/unmanaged scenarios, draft handling, ABAP SQL `LITERAL`, `@Environment.systemField` in CDS, virtual elements with managed calculations |
| 756 | **ABAP Cloud Development Model**, tier-1/tier-2 APIs, local ABAP types in ABAP SQL, `ABAP_BOOL`→`ABAP_BOOLEAN`, stricter CDS syntax |
| 757 | RAP side effects, ABAP SQL `CROSS JOIN`, `INNER/LEFT OUTER MANY TO MANY`, privileged mode in RAP |
| 758 | ABAP SQL `REPLACE`, `INITCAP`, new aggregate functions, RAP late numbering, background processing in RAP |

---

## 2. Examples by Feature

Concrete before/after code examples for each release feature live in the companion file **[abap-release-examples.md](abap-release-examples.md)** (subsections 2.1 – 2.9). Consult it when choosing between modern and legacy idioms for a given `ABAP_RELEASE`.

---

## 3. Decision Rules for Code Generation

| Target release | Use | Avoid |
|----------------|-----|-------|
| `< 740` | `DATA` declarations up front, `CREATE OBJECT`, `MOVE-CORRESPONDING`, classic `READ TABLE` | Any inline declaration or constructor expression |
| `= 740 … 749` | Inline declarations, `VALUE`/`NEW`/`CORRESPONDING`, table expressions, string templates | `FOR`/`FILTER`, Open SQL expressions, RAP |
| `= 750 … 753` | All of above + Open SQL expressions, CDS views, `GROUP BY` on itab | RAP/EML, `FINAL` classes |
| `= 754 … 755` | All of above + RAP (managed/unmanaged), `FINAL`, EML | ABAP Cloud-only restrictions |
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
