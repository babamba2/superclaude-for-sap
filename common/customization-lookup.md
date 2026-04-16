# Customization Lookup Protocol

**MANDATORY for all sc4sap consultant agents, `sap-critic`, and any skill that analyses, critiques, or extends an existing SAP installation.**

The customer's live Z*/Y* customizations — BAdI implementations, CMOD projects, customized form-based user-exit includes, Append Structures, and custom fields — are inventoried into per-module JSON files by `/sc4sap:setup customizations` (or `node scripts/extract-customizations.mjs`). **Consulting this inventory before recommending, critiquing, or designing is not optional**: proposing a new BAdI when a working Z implementation already exists wastes effort, splits logic, and is the single most common cause of rework in brownfield SAP projects.

## Files You MUST Check

| File | Holds |
|---|---|
| `.sc4sap/customizations/{MODULE}/enhancements.json` | `smodExits[]` (standard SMOD → Z-namespace CMOD projects), `badiImplementations[]` (standard BAdI → Z*/Y* impl classes), `formBasedExits[]` (customized include programs with line counts) |
| `.sc4sap/customizations/{MODULE}/extensions.json` | `appendStructures[]` — for each base table, the `CI_*` / `Z*` appends and `ZZ*` / `YY*` custom fields actually on the table |

The JSON is **positive-only**: a standard exit or base table is listed only when the customer has actually customized it. Silence for a given exit means "no customization detected at last scan".

## Resolution Order

### 1. Local Customization Cache (preferred — short-circuits everything below)

For every module involved in the question:

- If `.sc4sap/customizations/{MODULE}/enhancements.json` exists:
  - Load it; surface the `timestamp` in your reasoning ("customization snapshot: 2026-04-17T…")
  - Cross-reference every standard SMOD / BAdI / include you are about to recommend against the cache. If the customer already has a Z implementation, **prefer extending the existing Z object** over creating a new one.
  - Note the reuse candidate explicitly in your output (e.g., "`BADI_SD_SALES` already has impl `ZCL_IM_SD_SALES_HEADER` — extend this instead of creating a new impl").
- If `.sc4sap/customizations/{MODULE}/extensions.json` exists:
  - Cross-reference the base tables you are about to extend. If a `CI_*` or `ZA*` append already exists, **add the new field to the existing append** rather than creating a second one. Duplicated appends on the same table are legal but widely considered anti-pattern.
- If the file for a required module is missing, fall through to Step 2 for that module only.

### 2. Static Reference — `configs/{MODULE}/enhancements.md`

If the cache file is missing, the static doc still tells you the *names* of the standard exits/BAdIs to recommend. It does **not** tell you which the customer has already implemented. In this case:

- Recommend the standard name
- **Add a callout** telling the user their choice: "No customization inventory is present. Run `/sc4sap:setup customizations {MODULE}` to check whether this BAdI already has a Z implementation before I create a new one."
- Do NOT block the current task on the extraction — proceed, but make the assumption ("no prior Z impl") explicit so it can be corrected.

### 3. Live MCP Fallback (last resort)

If the task is high-stakes (e.g., sap-critic about to REJECT a plan, sap-planner sizing WRICEF, sap-architect proposing a new BAdI implementation) AND no cache exists, you MAY call:

- `GetEnhancementSpot` to inspect a specific BAdI for Z*/Y* implementations
- `GetSqlQuery` on `MODSAP` / `MODACT` to find CMOD projects for a given SMOD enhancement
- `GetTable` on a base table to read its appends and custom fields

Every live call must:
1. Name the target (BAdI name / SMOD name / table name)
2. Declare why the cache miss prevents answering otherwise
3. Warn about token cost and offer the alternative of running `/sc4sap:setup customizations`

### Decision flow summary

```
about to recommend / critique / extend a standard SAP object
        │
        ▼
  .sc4sap/customizations/{MODULE}/*.json present?
    yes ──► cross-reference; prefer reuse; cite timestamp
     no
        │
        ▼
  configs/{MODULE}/enhancements.md (name-only reference)
        │
        └── high-stakes & live SAP available?
                 yes ──► Step 3 targeted MCP query (with user warning)
                  no ──► proceed with "no prior Z impl" assumption + call-out to user
```

## What "Prefer Reuse" Actually Looks Like

When the cache shows `BADI_SD_SALES → [ZCL_IM_SD_SALES_HEADER]`:

- ✅ Recommend: "Extend method `IF_BADI_SD_SALES~CHECK_HEADER` in existing impl `ZCL_IM_SD_SALES_HEADER` (active, last modified …)."
- ❌ Do NOT recommend: "Create new implementation `ZCL_IM_SD_SALES_HEADER_V2` of `BADI_SD_SALES`."

When the cache shows `VBAK → appendStructures: [CI_VBAK], customFields: [ZZAPPROVER]`:

- ✅ Recommend: "Add new field `ZZ_PRIORITY` to existing append `CI_VBAK` (already contains `ZZAPPROVER`)."
- ❌ Do NOT recommend: "Create a second append `ZAVBAK_NEW` on `VBAK`."

When the cache shows `MV45AFZZ → lineCount: 420, customized: true`:

- ✅ Recommend: "Add the check inside FORM `USEREXIT_SAVE_DOCUMENT_PREPARE` in `MV45AFZZ` (already customized — 420 non-comment lines)."
- ❌ Do NOT recommend: "Create a new BAdI — the customer already has 420 lines of legacy form-exit code that must be kept coherent with any new logic."

## Setup Awareness

- The cache is populated by `/sc4sap:setup customizations` (optional wizard step 11b)
- If missing, you MAY recommend `/sc4sap:setup customizations` after the current task — but do not block on it
- Treat a stale cache (> 30 days) as prompting a refresh suggestion, but still prefer it over live query

## Agent Integration Checklist

Every consultant agent's `<Reference_Data>` section MUST list:

1. Local Customization Cache (`.sc4sap/customizations/{MODULE}/{enhancements,extensions}.json`) — **priority 1 for any extension/enhancement recommendation**
2. Static fallback (`configs/{MODULE}/enhancements.md`) — name-only reference
3. Pointer to this protocol: `common/customization-lookup.md`

`sap-critic` MUST flag any plan that recommends a new BAdI / CMOD / append without justifying why the existing Z implementation (if any) cannot be extended.

Any skill that delegates to a consultant or critic MUST pass a "customization cache available: yes/no + timestamp" flag in its handoff context.
