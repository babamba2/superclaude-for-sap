# Analysis Dimensions

**Rule loading is owned by the `sap-code-reviewer` agent**, not the main thread. When dispatched by `analyze-code` (see `workflow.md` Step 2), the reviewer reads the files below itself and evaluates the 14 dimensions against them. The main skill orchestrator never needs to preload them — keeping the orchestrator context light.

## Rule Files (loaded by the reviewer agent)

| Rule File | Scope |
|-----------|-------|
| `common/naming-conventions.md` | ABAP object naming (Z/Y prefix, ZCL_/ZIF_/ZCX_, variable prefixes LV_/LS_/LT_, etc.) |
| `common/constant-rule.md` | Constants declaration & usage (GC_/LC_/CO_ patterns, magic number avoidance) |
| `common/oop-pattern.md` | OO design patterns (class responsibility, interfaces, exception classes) |
| `common/procedural-form-naming.md` | FORM/PERFORM naming for legacy procedural code |
| `common/include-structure.md` | Include organization (_TOP, _F01, _SEL, _CLS separations) |
| `common/text-element-rule.md` | Text symbols/messages handling (hardcoded strings forbidden) |
| `common/alv-rules.md` | ALV grid / list display patterns and field catalog conventions |
| `common/spro-lookup.md` | SPRO config lookup patterns (avoid hardcoded values) |
| `common/data-extraction-policy.md` | Sensitive table extraction policy (PII, credentials, HR, financial) |

Also reference `configs/common/naming-conventions.md` as the module-aware naming extension.

---

## 14 Evaluation Dimensions

The sap-code-reviewer agent evaluates these dimensions:

**1. Syntax and Semantics**
- Parse tree validity via `GetAbapAST`
- Type errors, unresolved references via `GetAbapSemanticAnalysis`
- Unused variables, unreachable code

**2. Naming Conventions** → `common/naming-conventions.md`, `configs/common/naming-conventions.md`
- Z/Y prefix compliance, object-type prefixes (ZCL_/ZIF_/ZCX_/ZR_/...)
- Variable prefixes (LV_/LS_/LT_/IV_/EV_/MV_)
- Method, parameter, constant naming

**3. Constants & Magic Numbers** → `common/constant-rule.md`
- GC_/LC_/CO_ usage, avoidance of hardcoded literals
- Enum-like constant groupings

**4. OO Patterns** → `common/oop-pattern.md`
- Single responsibility, interface usage, exception class design (ZCX_)
- Dependency injection, method cohesion

**5. Procedural/Form Naming** → `common/procedural-form-naming.md`
- FORM naming, PERFORM parameter passing (legacy code)

**6. Include Structure** → `common/include-structure.md`
- TOP/F01/SEL/CLS separation in module pools and reports

**7. Text Elements & Messages** → `common/text-element-rule.md`
- Text symbols for UI strings, message class usage, no hardcoded literals

**8. ALV Patterns** → `common/alv-rules.md`
- Field catalog, layout, event handling, classical ALV vs CL_SALV_TABLE vs CL_GUI_ALV_GRID

**9. SPRO Lookup** → `common/spro-lookup.md`
- Use of config tables vs hardcoded values

**10. Performance Patterns**
- SELECT * vs. explicit field list; SELECT inside loops (N+1 pattern)
- Missing WHERE clauses on large tables; unoptimized sorts
- Buffer usage (ABAP table buffer, shared buffer)

**11. Error Handling**
- Missing exception handling (sy-subrc after DB ops)
- Uncaught OO exceptions; MESSAGE vs exception classes
- RAISE EXCEPTION TYPE vs. legacy RAISE

**12. Modern ABAP**
- Inline declarations (DATA(...)), string templates instead of CONCATENATE
- VALUE/REDUCE/FILTER/FOR expressions, BDEF/RAP vs legacy BOR

**13. Security** → `common/data-extraction-policy.md`
- SQL injection risks (dynamic WHERE clauses)
- Authorization checks (AUTHORITY-CHECK placement)
- Sensitive data handling per extraction policy

**14. Where-Used Impact**
- `GetWhereUsed` to identify all callers/users of the object
- Flag high-impact objects (used in >10 places) for extra care
