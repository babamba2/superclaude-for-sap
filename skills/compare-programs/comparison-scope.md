# Comparison Scope — 10 Business Dimensions

The comparison is organized along **10 dimensions**. Each dimension answers a question a consultant actually asks when two programs claim to do "the same thing".

## Default vs Opt-in

| # | Dimension | Default | Reader question |
|---|-----------|---------|-----------------|
| 1 | **Module / Domain perspective** | ✅ | "Is this MM quantity, CO value, SD margin, FI posting?" |
| 2 | **Organization / Country scope** | ✅ | "Which BUKRS / WERKS / VKORG / country variant does each cover?" |
| 3 | **Selection screen (input surface)** | ✅ | "What does the user filter on — units, amounts, tax keys?" |
| 4 | **Core data sources** | ⬜ | "MSEG vs BSEG vs ACDOCA vs CDS I_* — which tables drive the result?" |
| 5 | **Business logic (calculation / derivation)** | ✅ | "How is aggregation done? Currency/UOM conversion? GL derivation?" |
| 6 | **Output columns / KPIs** | ✅ | "Quantity-centric, value-centric, tax-centric, or mixed?" |
| 7 | **Authorization objects** | ✅ | "Which role sees this — controller (F_BKPF_*) or warehouse (M_MSEG_*)?" |
| 8 | **CBO / Enhancement usage** | ⬜ | "Which append structures, BAdI impls, CMOD exits are wired in?" |
| 9 | **Country / Legal specifics** | ⬜ | "KR e-tax-invoice? EU VAT triangulation? BR NFe? US 1099?" |
| 10 | **Usage timing / Persona** | ✅ | "Month-end controller, daily warehouse clerk, real-time auditor?" |

**Default bundle** = 1, 2, 3, 5, 6, 7, 10 (7 dimensions) — covers ~80% of consultant questions without reading every include.
**Opt-in** = 4, 8, 9 — technical depth / enhancement depth / country depth.

## Scope Prompt (Step 2 of workflow)

Show the user this table with checkboxes, marking defaults pre-ticked, and ask a **single question**. Render the prompt in the user's current conversation language; the skeleton below is English.

```
Confirm comparison dimensions (7 defaults pre-selected, [x]=include / [ ]=exclude):

[x] 1. Module / Domain perspective (MM·CO·SD·FI …)
[x] 2. Organization / Country scope (BUKRS, WERKS, country)
[x] 3. Selection-screen input fields
[ ] 4. Core data sources (tables / CDS)
[x] 5. Business logic (aggregation · conversion · derivation)
[x] 6. Output columns / KPI
[x] 7. Authorization objects
[ ] 8. CBO · Enhancement usage
[ ] 9. Country / Legal specifics
[x] 10. Usage timing / Persona

Output: Markdown (default). Add "html" for a single-file HTML copy too, or "html only".

Reply with: numbers to toggle (e.g. "+4 +8", "-7"), "all" to enable every dimension,
"only N,M" to keep a specific subset, or "ok" to proceed with defaults.
```

Accept short replies (language-agnostic):
- `ok` / `proceed` / equivalents → keep defaults.
- `+N` / `-N` → toggle dimension N.
- `all` → enable 1–10.
- `only N,M` → keep only the listed numbers.
- `html` → formats = Markdown + HTML; `html only` → HTML only. May be combined with the dimension replies (e.g. `ok html`, `+4 html only`).

## Per-Dimension Data Sources (what Claude reads per dimension)

| Dim | Primary MCP source | Notes |
|-----|--------------------|-------|
| 1 | `GetObjectInfo`, package name, program TITLE, message class usage | Module is often encoded in package prefix (ZMM / ZCO / ZSD / ZFI) |
| 2 | Selection screen field types (DDIC), hard-coded WHERE on BUKRS/LAND1 | See `common/naming-conventions.md` for module prefix rules |
| 3 | Selection screen PARAMETERS / SELECT-OPTIONS + associated types | From `GetScreen` or parsed from source |
| 4 | `FROM` clauses in SELECT statements, JOIN targets, CDS view names | AST-based |
| 5 | Main computation blocks: ON CHANGE, COLLECT, AT END OF, aggregation FMs, BAPI calls | Narrative summary, not line-by-line |
| 6 | ALV field catalog entries, WRITE statements, output structure fields | `GetScreen` + source parse |
| 7 | `AUTHORITY-CHECK OBJECT '…'` statements | Listed verbatim with field/value |
| 8 | `GetEnhancements`, `GetEnhancementImpl`, append structures on referenced tables | See `common/customization-lookup.md` |
| 9 | Country-specific includes (`L*ID*`, RFUMSV*), country table lookups (T005), CDS localization | Cross-reference with loaded `country/<iso>.md` |
| 10 | Job scheduling metadata, variant names, program title wording | Often explicit: "Month-end", "Daily", "Real-time" |

## Dimension Scoring — "Different or Same?"

For each selected dimension × each program, emit one of:

- ✅ **Same** — all programs behave identically on this dimension
- 🔷 **Variant** — differs but in a structured, comparable way (e.g. different currency conversion rule)
- ⚠️ **Divergent** — fundamentally different (e.g. one reads MSEG, another reads ACDOCA)
- ❓ **Unclear** — source doesn't expose the answer; consultant must clarify

The **Executive Summary** is driven by the ⚠️ Divergent rows (those are the "why this program exists" story).
